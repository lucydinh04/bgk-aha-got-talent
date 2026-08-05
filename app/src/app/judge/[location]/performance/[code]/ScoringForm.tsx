"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CampaignLogo } from "@/components/campaign";
import {
  CRITERIA,
  scoreBand,
  orderLabel,
  teamLabel,
  type CriterionKey,
  type Performance,
} from "@/lib/data";
import { computeTotal, parseScore, type ScoreValues } from "@/lib/scoring";
import {
  clearLocalDraft,
  newIdempotencyKey,
  readLocalDraft,
  saveLocalDraft,
} from "@/lib/localDraft";
import { saveDraftAction, submitScoreAction } from "@/app/actions/scoring";

type Scores = ScoreValues;

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "offline" }
  | { kind: "error"; message: string };

const AUTOSAVE_DELAY = 900;

export function ScoringForm({
  performance: p,
  locationSlug,
  initial,
}: {
  performance: Performance;
  locationSlug: string;
  initial: {
    values: Scores;
    highlight: string;
    improvement: string;
    privateNote: string;
    status: "draft" | "submitted" | "locked" | null;
  };
}) {
  const router = useRouter();

  /** Không có giá trị mặc định: điểm 0 và "chưa chấm" là hai chuyện khác nhau. */
  const [scores, setScores] = useState<Scores>(initial.values);
  const [highlight, setHighlight] = useState(initial.highlight);
  const [improvement, setImprovement] = useState(initial.improvement);
  const [privateNote, setPrivateNote] = useState(initial.privateNote);
  const [status, setStatus] = useState(initial.status);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const locked = status === "locked";
  const sent = status === "submitted" || status === "locked";

  const filled = CRITERIA.filter((c) => scores[c.key] !== undefined).length;
  const complete = filled === CRITERIA.length;
  const total = useMemo(() => computeTotal(scores), [scores]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Còn thay đổi chưa lên tới server hay không — dùng cho cảnh báo đóng tab. */
  const unsynced = useRef(false);
  /**
   * BGK đã thực sự chạm vào form chưa.
   *
   * Autosave chỉ được phép ghi khi cờ này bật. Không có nó, một lần mount là
   * một lần ghi DB — và một bản nháp trống xuất hiện trên bảng tiến độ của
   * Admin cho tiết mục mà BGK mới chỉ mở ra xem.
   */
  const touched = useRef(false);

  /*
   * Khôi phục bản nháp cục bộ.
   *
   * Chỉ nhận khi bản trên máy MỚI HƠN và chưa đồng bộ. Server vẫn là nguồn
   * chính; localDraft chỉ để cứu những thay đổi chưa kịp gửi đi.
   */
  useEffect(() => {
    if (sent) return;
    let cancelled = false;
    void readLocalDraft(p.registrationCode).then((draft) => {
      if (cancelled || !draft || draft.synced) return;
      setScores(draft.values);
      setHighlight(draft.highlight);
      setImprovement(draft.improvement);
      setPrivateNote(draft.privateNote);
      touched.current = true;
      unsynced.current = true;
      setSave({ kind: "dirty" });
    });
    return () => {
      cancelled = true;
    };
  }, [p.registrationCode, sent]);

  const persistLocal = useCallback(
    (next: Scores, synced: boolean) =>
      saveLocalDraft({
        code: p.registrationCode,
        values: next,
        highlight,
        improvement,
        privateNote,
        synced,
        updatedAt: Date.now(),
      }),
    [p.registrationCode, highlight, improvement, privateNote],
  );

  /* ── Autosave ────────────────────────────────────────────────────────── */

  const flush = useCallback(
    async (next: Scores) => {
      if (sent) return; // điểm đã gửi thì autosave dừng — sửa phải là chủ ý
      if (!touched.current) return; // chưa ai chạm vào thì không có gì để lưu
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSave({ kind: "offline" });
        return;
      }

      setSave({ kind: "saving" });
      try {
        const result = await saveDraftAction({
          locationSlug,
          code: p.registrationCode,
          values: next,
          highlight,
          improvement,
          privateNote,
        });
        if (result.ok) {
          unsynced.current = false;
          void persistLocal(next, true);
          setSave({ kind: "saved", at: Date.now() });
        } else {
          setSave({ kind: "error", message: result.error ?? "Không lưu được." });
        }
      } catch {
        // Mất mạng giữa chừng: bản nháp cục bộ đã có, nên không mất gì.
        setSave({ kind: "offline" });
      }
    },
    [sent, locationSlug, p.registrationCode, highlight, improvement, privateNote, persistLocal],
  );

  const schedule = useCallback(
    (next: Scores) => {
      touched.current = true;
      unsynced.current = true;
      void persistLocal(next, false);
      setSave({ kind: "dirty" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(next), AUTOSAVE_DELAY);
    },
    [flush, persistLocal],
  );

  const set = (key: CriterionKey, raw: number) => {
    const value = parseScore(raw);
    if (value === undefined) return; // số rác bị bỏ, không ép về 0
    setScores((s) => {
      const next = { ...s, [key]: value };
      schedule(next);
      return next;
    });
  };

  // Có mạng lại thì đẩy nốt phần còn nợ, không đợi BGK chạm vào gì.
  useEffect(() => {
    const onOnline = () => {
      if (unsynced.current && !sent) void flush(scores);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush, scores, sent]);

  // Đóng tab khi còn dữ liệu chưa đồng bộ: chặn lại một nhịp để hỏi.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!unsynced.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  /* ── Gửi chính thức ──────────────────────────────────────────────────── */

  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    if (timer.current) clearTimeout(timer.current);

    // Một khoá cho một lần bấm. Gửi lại cùng khoá không tạo bản ghi thứ hai.
    const existing = await readLocalDraft(p.registrationCode);
    const idempotencyKey = existing?.idempotencyKey ?? newIdempotencyKey();
    await saveLocalDraft({
      code: p.registrationCode,
      values: scores,
      highlight,
      improvement,
      privateNote,
      synced: false,
      idempotencyKey,
      updatedAt: Date.now(),
    });

    try {
      const result = await submitScoreAction({
        locationSlug,
        code: p.registrationCode,
        values: scores,
        highlight,
        improvement,
        privateNote,
        idempotencyKey,
      });

      if (!result.ok) {
        setSubmitError(result.error ?? "Không gửi được điểm.");
        setSubmitting(false);
        return;
      }

      unsynced.current = false;
      await clearLocalDraft(p.registrationCode);
      setStatus(result.status ?? "submitted");
      setConfirming(false);
      router.push(`/judge/${locationSlug}/result/${p.registrationCode}`);
      router.refresh();
    } catch {
      setSubmitError(
        "Mất kết nối khi gửi. Điểm đã lưu trên máy — thử lại khi có mạng, hệ thống sẽ không ghi trùng.",
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="bg-ink grid-city min-h-dvh pb-40 lg:pb-16">
      {/* Header sticky — KV không xuất hiện ở màn chấm để không phân tán */}
      <header className="glass-strong sticky top-0 z-30 border-b border-b-[color-mix(in_oklab,var(--color-navy-700)_60%,transparent)]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href={`/judge/${locationSlug}/dashboard`}
            className="text-silver hover:text-chalk flex min-h-[44px] items-center pr-1 text-sm"
            aria-label="Về danh sách tiết mục"
          >
            ‹
          </Link>
          <CampaignLogo width={82} priority />
          <span className="bg-navy-700 h-5 w-px" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-brand tnum font-mono text-[0.6rem] tracking-[0.14em] uppercase">
              {p.location} · #{orderLabel(p)}
            </p>
            <p className="display text-chalk truncate text-sm">
              {p.performanceName}
            </p>
          </div>
          <SaveBadge state={save} sent={sent} />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[300px_1fr_280px] lg:items-start">
        <PerformanceInfo performance={p} />

        <section className="flex flex-col gap-3">
          {locked ? (
            <p className="border-locked/50 text-locked rounded-lg border px-3 py-2 text-xs">
              Ban Tổ chức đã khoá điểm tiết mục này. Bạn chỉ xem lại được.
            </p>
          ) : sent ? (
            <p className="border-ok/40 text-ok rounded-lg border px-3 py-2 text-xs leading-relaxed">
              Điểm đã gửi. Sửa giá trị bên dưới rồi bấm “Gửi lại” nếu cần thay
              đổi — hệ thống không tự lưu đè điểm đã gửi.
            </p>
          ) : null}

          {CRITERIA.map((c) => (
            <CriterionRow
              key={c.key}
              label={c.label}
              description={c.description}
              weight={c.weight}
              value={scores[c.key]}
              disabled={locked}
              onChange={(v) => set(c.key, v)}
            />
          ))}
        </section>

        <CommentPanel
          disabled={locked}
          highlight={highlight}
          improvement={improvement}
          privateNote={privateNote}
          onHighlight={(v) => {
            setHighlight(v);
            schedule(scores);
          }}
          onImprovement={(v) => {
            setImprovement(v);
            schedule(scores);
          }}
          onPrivateNote={(v) => {
            setPrivateNote(v);
            schedule(scores);
          }}
        />
      </div>

      {/* CTA sticky bottom — trên mobile là thứ quan trọng nhất trong tầm ngón cái */}
      <div className="glass-strong fixed inset-x-0 bottom-0 z-30 border-t border-t-[color-mix(in_oklab,var(--color-navy-700)_60%,transparent)] lg:static lg:mx-auto lg:max-w-6xl lg:rounded-xl lg:border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2.5 px-4 py-3 sm:px-6">
          <div className="flex items-baseline justify-between">
            <span className="text-silver font-mono text-[0.66rem] tracking-[0.14em] uppercase">
              Tổng điểm
            </span>
            <span className="display text-brand tnum text-3xl">
              {total ?? "—"}
              <span className="text-silver-dim ml-1 text-xs">/ 100</span>
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={locked || sent || save.kind === "saving"}
              onClick={() => void flush(scores)}
              className="border-navy-600 text-silver hover:text-chalk min-h-[48px] flex-1 rounded-lg border text-sm transition disabled:opacity-40"
            >
              Lưu nháp
            </button>
            <button
              type="button"
              disabled={!complete || locked || submitting}
              onClick={() => setConfirming(true)}
              className="bg-brand hover:bg-brand-deep display min-h-[48px] flex-[1.4] rounded-lg text-base text-[#1a0c02] transition disabled:opacity-40"
            >
              {sent ? "Gửi lại" : "Gửi điểm"}
            </button>
          </div>
          {submitError ? (
            <p className="text-danger text-[0.68rem] leading-relaxed">{submitError}</p>
          ) : !complete ? (
            <p className="text-silver-dim text-[0.68rem]">
              Cần đủ {CRITERIA.length} tiêu chí mới gửi được — còn{" "}
              {CRITERIA.length - filled}.
            </p>
          ) : null}
        </div>
      </div>

      {confirming && total !== null ? (
        <ConfirmModal
          total={total}
          scores={scores}
          submitting={submitting}
          onConfirm={() => void submit()}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </main>
  );
}

/** Bốn trạng thái autosave BGK cần phân biệt — và không một trạng thái nào nữa. */
function SaveBadge({ state, sent }: { state: SaveState; sent: boolean }) {
  if (sent && state.kind !== "saving") {
    return (
      <span className="text-ok shrink-0 font-mono text-[0.62rem] whitespace-nowrap">
        ● Đã gửi
      </span>
    );
  }
  const map: Record<SaveState["kind"], { tone: string; text: string }> = {
    idle: { tone: "text-silver-dim", text: "○ Chưa có thay đổi" },
    dirty: { tone: "text-warn", text: "○ Chưa lưu" },
    saving: { tone: "text-cyan", text: "◌ Đang lưu…" },
    saved: {
      tone: "text-ok",
      text:
        state.kind === "saved"
          ? `● Đã lưu ${new Date(state.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
          : "● Đã lưu",
    },
    offline: { tone: "text-warn", text: "⚠ Ngoại tuyến · đã lưu trên máy" },
    error: { tone: "text-danger", text: "✕ Lỗi lưu" },
  };
  const s = map[state.kind];
  return (
    <span
      title={state.kind === "error" ? state.message : undefined}
      className={`${s.tone} shrink-0 font-mono text-[0.62rem] whitespace-nowrap`}
    >
      {s.text}
    </span>
  );
}

function PerformanceInfo({ performance: p }: { performance: Performance }) {
  const facts: [string, string | null][] = [
    ["Mã tiết mục", p.registrationCode],
    ["Hình thức", p.participationType],
    ["Loại hình", p.performanceType],
    ["Phòng ban", p.department],
    ["Thành viên", p.memberCount ? `${p.memberCount} người` : null],
    ["Thời lượng", p.durationMinutes ? `${p.durationMinutes} phút` : null],
  ];
  const blocks: [string, string | null][] = [
    ["Mô tả ý tưởng", p.conceptDescription],
    ["Điểm nhấn chuyển mình", p.transformationHighlight],
    ["Ý tưởng trang phục", p.costumeIdea],
    ["Ứng dụng AI/công nghệ", p.aiTechnologyUsage],
  ];

  return (
    <aside className="glass rounded-xl p-4 lg:sticky lg:top-20">
      <h2 className="display text-chalk text-lg leading-tight">
        {p.performanceName}
      </h2>
      <p className="text-silver mt-1 text-xs">{teamLabel(p)}</p>

      <dl className="mt-4 flex flex-col gap-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-xs">
            <dt className="text-silver-dim shrink-0">{k}</dt>
            <dd className="text-silver text-right break-words">
              {v ?? "Chưa có thông tin"}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-col gap-3">
        {blocks.map(([k, v]) => (
          <div key={k}>
            <p className="text-cyan font-mono text-[0.6rem] tracking-[0.12em] uppercase">
              {k}
            </p>
            <p
              className={`mt-1 text-xs leading-relaxed whitespace-pre-line ${
                v ? "text-silver" : "text-silver-dim italic"
              }`}
            >
              {v ?? "Chưa có thông tin"}
            </p>
          </div>
        ))}
      </div>

      {/* Không có email, SĐT, Telegram, ghi chú BTC — allow-list chặn từ tầng dữ liệu */}
    </aside>
  );
}

function CriterionRow({
  label,
  description,
  weight,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  weight: number;
  value: number | undefined;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const scored = value !== undefined;
  const band = scored ? scoreBand(value) : null;

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-chalk text-sm font-medium">{label}</h3>
        <span className="text-cyan tnum shrink-0 font-mono text-[0.66rem]">
          {Math.round(weight * 100)}%
        </span>
      </div>
      <p className="text-silver-dim mt-1 text-xs leading-relaxed">{description}</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-label={`Giảm 1 điểm ${label}`}
          onClick={() => onChange((value ?? 0) - 1)}
          className="border-navy-600 text-silver hover:text-chalk h-11 w-11 shrink-0 rounded-lg border text-lg transition disabled:opacity-40"
        >
          −
        </button>

        {/* px-3 để tay cầm slider không sát mép màn hình */}
        <div className="flex-1 px-3">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value ?? 0}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => onChange(Number(e.target.value))}
            className="accent-brand h-11 w-full cursor-pointer disabled:opacity-40"
          />
        </div>

        <button
          type="button"
          disabled={disabled}
          aria-label={`Tăng 1 điểm ${label}`}
          onClick={() => onChange((value ?? 0) + 1)}
          className="border-navy-600 text-silver hover:text-chalk h-11 w-11 shrink-0 rounded-lg border text-lg transition disabled:opacity-40"
        >
          +
        </button>

        <input
          type="number"
          min={0}
          max={100}
          value={value ?? ""}
          disabled={disabled}
          placeholder="—"
          aria-label={`Điểm ${label}`}
          onChange={(e) =>
            e.target.value === "" ? undefined : onChange(Number(e.target.value))
          }
          className="bg-navy-950/80 text-chalk tnum placeholder:text-silver-dim focus:border-brand h-11 w-16 shrink-0 rounded-lg border border-[color-mix(in_oklab,var(--color-navy-600)_100%,transparent)] text-center text-base outline-none disabled:opacity-40"
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        {scored && band ? (
          <>
            <span className={band.tone}>{band.label}</span>
            <span className="text-silver-dim tnum">
              Quy đổi{" "}
              <strong className="text-silver">{(value * weight).toFixed(2)}</strong>
            </span>
          </>
        ) : (
          <span className="text-silver-dim font-mono text-[0.66rem]">
            Chưa chấm · không có giá trị mặc định
          </span>
        )}
      </div>
    </div>
  );
}

function CommentPanel({
  disabled,
  highlight,
  improvement,
  privateNote,
  onHighlight,
  onImprovement,
  onPrivateNote,
}: {
  disabled?: boolean;
  highlight: string;
  improvement: string;
  privateNote: string;
  onHighlight: (v: string) => void;
  onImprovement: (v: string) => void;
  onPrivateNote: (v: string) => void;
}) {
  const fields: [string, string, string, (v: string) => void][] = [
    ["Điểm nổi bật", "Điều gì khiến tiết mục này tạo được dấu ấn?", highlight, onHighlight],
    ["Góp ý", "Tiết mục có thể cải thiện điểm nào?", improvement, onImprovement],
    [
      "Ghi chú riêng cho BTC",
      "Ghi chú dành riêng cho Ban Tổ chức, nếu có.",
      privateNote,
      onPrivateNote,
    ],
  ];

  return (
    <aside className="glass flex flex-col gap-4 rounded-xl p-4 lg:sticky lg:top-20">
      {fields.map(([label, placeholder, value, onChange]) => (
        <label key={label} className="flex flex-col gap-1.5">
          <span className="text-cyan font-mono text-[0.6rem] tracking-[0.12em] uppercase">
            {label}
          </span>
          <textarea
            rows={3}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="bg-navy-950/70 border-navy-700 text-chalk placeholder:text-silver-dim focus:border-brand resize-y rounded-lg border px-3 py-2 text-sm outline-none transition disabled:opacity-40"
          />
        </label>
      ))}
    </aside>
  );
}

function ConfirmModal({
  total,
  scores,
  submitting,
  onConfirm,
  onClose,
}: {
  total: number;
  scores: Scores;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xác nhận gửi điểm"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(4,9,20,.78)] p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="glass-strong w-full max-w-md rounded-2xl p-5">
        <h2 className="display text-chalk text-xl">Xác nhận gửi điểm?</h2>
        <p className="text-silver mt-2 text-sm">
          Điểm sẽ được ghi nhận chính thức. Bạn có thể chỉnh sửa nếu Ban Tổ chức
          chưa khóa kết quả.
        </p>

        <ul className="border-navy-700 mt-4 flex flex-col gap-1.5 rounded-lg border p-3">
          {CRITERIA.map((c) => (
            <li key={c.key} className="text-silver flex justify-between text-xs">
              <span>
                {c.label} · {Math.round(c.weight * 100)}%
              </span>
              <span className="text-chalk tnum">{scores[c.key]}</span>
            </li>
          ))}
          <li className="border-navy-700 mt-1 flex justify-between border-t pt-2">
            <span className="text-silver font-mono text-[0.66rem] tracking-[0.12em] uppercase">
              Tổng điểm
            </span>
            <span className="display text-brand tnum text-lg">{total}</span>
          </li>
        </ul>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="border-navy-600 text-silver min-h-[48px] flex-1 rounded-lg border text-sm disabled:opacity-40"
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="bg-brand display min-h-[48px] flex-[1.3] rounded-lg text-base text-[#1a0c02] disabled:opacity-60"
          >
            {submitting ? "Đang gửi…" : "Gửi điểm"}
          </button>
        </div>
      </div>
    </div>
  );
}
