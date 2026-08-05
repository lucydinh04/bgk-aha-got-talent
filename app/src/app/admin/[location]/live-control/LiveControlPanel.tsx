"use client";

import { useEffect, useState, useTransition } from "react";

import { Panel, Btn } from "@/components/ui";
import type { LocationCode } from "@/lib/data";
import { useSnapshot } from "@/lib/useSnapshot";
import type { AdminSnapshot } from "@/lib/server/views";
import type { LedSnapshot } from "@/lib/server/views";
import {
  emergencyHideAction,
  setCurrentPerformanceAction,
  setDisplayModeAction,
  setPublicMessageAction,
  stepPerformanceAction,
} from "@/app/actions/live";
import {
  closeVotingAction,
  createVotingSessionAction,
  openVotingAction,
  verifyVotingAction,
} from "@/app/actions/voting";
import {
  createSnapshotAction,
  loadAwardsAction,
  publishAwardAction,
  setAwardStageAction,
} from "@/app/actions/awards";

/**
 * Live Control.
 *
 * Browser này KHÔNG giữ state hiển thị. Mỗi nút là một lần ghi DB; thứ hiện lên
 * bảng điều khiển là thứ vừa đọc lại từ DB qua SSE. Admin mở hai tab, hoặc đổi
 * máy giữa chương trình, cả hai vẫn thấy đúng một sự thật.
 *
 * Ba nhóm điều khiển: vận hành, bình chọn khán giả, công bố giải. Nhóm công bố
 * chỉ mở sau khi có Publishing Snapshot — trước đó nút không tồn tại, không
 * phải bị disable.
 */

const PROGRAMME_MODES = [
  { mode: "standby", label: "Chờ chương trình" },
  { mode: "interlude", label: "Giữa hai tiết mục" },
  { mode: "performance", label: "Đang biểu diễn" },
  { mode: "judging_progress", label: "BGK đang chấm" },
  { mode: "performance_waiting", label: "Chờ hoàn tất" },
  { mode: "performance_completed", label: "Đã chấm xong" },
  { mode: "all_performances_status", label: "Bảng tổng trạng thái" },
  { mode: "all_scores_completed", label: "Xong toàn bộ" },
] as const;

export function LiveControlPanel({
  location,
  slug,
  initialLed,
  initialAdmin,
}: {
  location: LocationCode;
  slug: string;
  initialLed: LedSnapshot;
  initialAdmin: AdminSnapshot;
}) {
  const led = useSnapshot<LedSnapshot>(`/api/led/${slug}/stream`, initialLed);
  const admin = useSnapshot<AdminSnapshot>(`/api/admin/${slug}/stream`, initialAdmin);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(initialLed.publicMessage ?? "");

  const state = led.data;
  const mode = state.displayMode;
  const currentId = admin.data.currentPerformanceId;
  const rows = admin.data.performances;
  const currentRow = rows.find((r) => r.id === currentId);

  const call = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result.ok ? null : (result.error ?? "Thao tác thất bại."));
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="flex flex-col gap-4">
        {admin.connection !== "live" || led.connection !== "live" ? (
          <p className="border-warn/50 text-warn rounded-lg border px-3 py-2 font-mono text-xs">
            ⚠ Mất kết nối realtime — đang tự nối lại. LED vẫn giữ khung hình cuối
            cùng; số liệu dưới đây có thể chưa mới nhất.
          </p>
        ) : null}

        {error ? (
          <p className="border-danger/50 text-danger rounded-lg border px-3 py-2 text-xs">
            {error}
          </p>
        ) : null}

        <Panel
          title="Preview 16:9 — đang phát trên LED"
          action={
            <a
              href={`/live/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-cyan font-mono text-xs underline-offset-4 hover:underline"
            >
              Mở toàn màn hình ↗
            </a>
          }
        >
          {/*
            Preview nhúng chính trang LED, cùng một render và cùng một nguồn dữ
            liệu — không có nguy cơ preview nói một đằng LED chiếu một nẻo.
          */}
          <div className="border-navy-700 aspect-video w-full overflow-hidden rounded-lg border">
            <iframe
              src={`/live/${slug}`}
              title={`Preview LED ${location}`}
              className="h-full w-full"
            />
          </div>
          <p className="text-silver-dim mt-2 font-mono text-[0.66rem]">
            display_mode: <span className="text-cyan">{mode}</span>
            {state.updatedAt ? (
              <span className="text-silver-dim">
                {" "}
                · ghi lúc {new Date(state.updatedAt).toLocaleTimeString("vi-VN")}
              </span>
            ) : null}
          </p>
        </Panel>

        <Panel title="Tiết mục hiện tại">
          <div className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <ModeBtn
                key={r.id}
                active={r.id === currentId}
                disabled={pending}
                onClick={() => call(() => setCurrentPerformanceAction(slug, r.id))}
              >
                <span className="tnum font-mono text-[0.7rem]">
                  #{String(r.order ?? 0).padStart(2, "0")}
                </span>{" "}
                {r.name}
              </ModeBtn>
            ))}
            {rows.length === 0 ? (
              <p className="text-silver-dim text-xs">
                Chưa có tiết mục nào được duyệt cho đầu cầu này.
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Btn
              variant="ghost"
              disabled={pending}
              onClick={() => call(() => stepPerformanceAction(slug, "prev"))}
            >
              Tiết mục trước
            </Btn>
            <Btn
              variant="electric"
              disabled={pending}
              onClick={() => call(() => stepPerformanceAction(slug, "next", "interlude"))}
            >
              Tiết mục tiếp theo
            </Btn>
            <Btn
              variant="ghost"
              disabled={pending || !currentId}
              onClick={() => call(() => setCurrentPerformanceAction(slug, null))}
            >
              Bỏ chọn
            </Btn>
          </div>

          <p className="text-silver-dim mt-3 text-xs">
            Đang chọn:{" "}
            <span className="text-chalk">{currentRow?.name ?? "chưa chọn tiết mục nào"}</span>
            {currentRow ? (
              <span className="text-silver-dim tnum">
                {" "}
                · {currentRow.submitted}/{currentRow.assigned} BGK đã gửi
              </span>
            ) : null}
          </p>
        </Panel>

        <Panel title="Phần chương trình">
          <div className="flex flex-wrap gap-2">
            {PROGRAMME_MODES.map((s) => (
              <ModeBtn
                key={s.mode}
                active={mode === s.mode}
                disabled={pending}
                onClick={() => call(() => setDisplayModeAction(slug, s.mode))}
              >
                {s.label}
              </ModeBtn>
            ))}
          </div>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-silver font-mono text-[0.64rem] tracking-[0.12em] uppercase">
              Thông báo tùy chỉnh
            </span>
            <div className="flex gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Để trống để xoá thông báo"
                className="bg-navy-950/80 border-navy-700 text-chalk placeholder:text-silver-dim focus:border-brand min-h-[44px] flex-1 rounded-lg border px-3 text-sm outline-none"
              />
              <Btn
                variant="ghost"
                disabled={pending}
                onClick={() => call(() => setPublicMessageAction(slug, message))}
              >
                Lưu
              </Btn>
            </div>
          </label>
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Tiến độ chấm — realtime">
          <ul className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 font-mono text-[0.68rem]"
              >
                <span className="text-brand tnum">
                  #{String(r.order ?? 0).padStart(2, "0")}
                </span>
                <span className="text-silver truncate">{r.name}</span>
                <span
                  className={
                    r.assigned > 0 && r.submitted >= r.assigned
                      ? "text-ok tnum"
                      : "text-warn tnum"
                  }
                >
                  {r.submitted}/{r.assigned}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-silver-dim mt-3 text-[0.66rem] leading-relaxed">
            Tổng {admin.data.totals.done}/{admin.data.totals.needed} phiếu chấm (
            {admin.data.totals.pct}%). Số liệu này chỉ ở đây — LED không nhận
            điểm, không nhận tên BGK còn thiếu.
          </p>
        </Panel>

        <VotingPanel slug={slug} led={state} onError={setError} />
        <AwardsPanel slug={slug} onError={setError} />

        {/* Emergency Hide: luôn cùng một chỗ, đỏ, không modal xác nhận */}
        <Btn
          variant="danger"
          className="display min-h-[52px] w-full text-base"
          disabled={pending}
          onClick={() => call(() => emergencyHideAction(slug))}
        >
          Ẩn toàn bộ dữ liệu trên LED
        </Btn>
      </div>
    </div>
  );
}

/* ═══ Bình chọn khán giả ══════════════════════════════════════════════════ */

function VotingPanel({
  slug,
  led,
  onError,
}: {
  slug: string;
  led: LedSnapshot;
  onError: (m: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [duration, setDuration] = useState(180);
  const [maxPicks, setMaxPicks] = useState(2);
  const [note, setNote] = useState<string | null>(null);

  const voting = led.voting;
  // 'verified' nghĩa là vòng bình chọn đó đã khép lại. Cho phép tạo vòng mới —
  // nếu không, một phiên lỡ tay chốt sớm sẽ khoá cứng cả phần bình chọn.
  const canCreate = !voting || voting.status === "verified";
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      onError(r.ok ? null : (r.error ?? "Thao tác thất bại."));
    });

  return (
    <Panel title="Bình chọn khán giả">
      {/* Con số duy nhất Admin thấy khi phiếu còn mở là số người tham gia.
          Số phiếu từng tiết mục chỉ tồn tại sau khi chốt snapshot. */}
      <p className="text-silver-dim mb-3 text-xs">
        Trạng thái:{" "}
        <span className="text-chalk font-mono">
          {voting ? voting.status : "chưa tạo phiên"}
        </span>
        {voting ? (
          <>
            {" · "}
            <span className="text-cyan tnum font-mono">
              {voting.participants} người đã bình chọn
            </span>
          </>
        ) : null}
      </p>

      {canCreate ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label className="text-silver flex items-center gap-2 text-xs">
              Thời lượng
              <input
                type="number"
                min={30}
                max={1800}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="bg-navy-950/80 border-navy-700 text-chalk tnum h-9 w-20 rounded border px-2 text-center text-sm"
              />
              giây
            </label>
            <label className="text-silver flex items-center gap-2 text-xs">
              Tối đa
              <input
                type="number"
                min={1}
                max={5}
                value={maxPicks}
                onChange={(e) => setMaxPicks(Number(e.target.value))}
                className="bg-navy-950/80 border-navy-700 text-chalk tnum h-9 w-16 rounded border px-2 text-center text-sm"
              />
              phiếu/người
            </label>
          </div>
          <Btn
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createVotingSessionAction(slug, duration, maxPicks);
                if (r.ok) {
                  setSessionId(r.sessionId ?? null);
                  onError(null);
                } else onError(r.error ?? "Không tạo được phiên.");
              })
            }
          >
            Tạo phiên bình chọn
          </Btn>
        </>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {sessionId && (!voting || voting.status === "verified") ? (
          <Btn
            variant="brand"
            disabled={pending}
            onClick={() => run(() => openVotingAction(slug, sessionId))}
          >
            Mở bình chọn
          </Btn>
        ) : null}

        {voting?.status === "open" ? (
          <Btn
            variant="danger"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await closeVotingAction(slug, sessionIdOf(led) ?? "");
                return r;
              })
            }
          >
            Đóng bình chọn
          </Btn>
        ) : null}

        {voting?.status === "closed" ? (
          <Btn
            variant="brand"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await verifyVotingAction(slug, sessionIdOf(led) ?? "");
                if (!r.ok) {
                  onError(r.error ?? "Không xác minh được.");
                  return;
                }
                onError(null);
                setNote(
                  r.tied
                    ? "⚠ Có tiết mục đồng phiếu cao nhất. Hệ thống KHÔNG tự chọn — Ban Tổ chức phải quyết trước khi công bố."
                    : `Đã chốt kết quả · ${r.participants} người bình chọn. Con số không đổi nữa.`,
                );
              })
            }
          >
            Xác minh và chốt kết quả
          </Btn>
        ) : null}
      </div>

      {note ? (
        <p className="text-warn mt-3 text-[0.68rem] leading-relaxed">{note}</p>
      ) : null}

      <p className="text-silver-dim mt-3 text-[0.66rem] leading-relaxed">
        Số phiếu từng tiết mục không hiển thị ở bất kỳ đâu trước khi chốt — kể cả
        trên trang Admin này.
      </p>
    </Panel>
  );
}

/** Phiên hiện tại lấy từ snapshot LED; Admin và LED luôn nói về cùng một phiên. */
function sessionIdOf(led: LedSnapshot): string | null {
  return led.voting?.sessionId ?? null;
}

/* ═══ Công bố giải ════════════════════════════════════════════════════════ */

function AwardsPanel({
  slug,
  onError,
}: {
  slug: string;
  onError: (m: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAwardsAction>> | null>(
    null,
  );
  const [confirmSnapshot, setConfirmSnapshot] = useState(false);

  useEffect(() => {
    void loadAwardsAction(slug).then(setData);
  }, [slug]);

  const reload = () => void loadAwardsAction(slug).then(setData);

  if (!data?.ok) {
    return (
      <Panel title="Công bố giải">
        <p className="text-silver-dim text-xs">Đang tải…</p>
      </Panel>
    );
  }

  const { awards, blockers, hasJudgingSnapshot } = data;

  return (
    <Panel title="Công bố giải">
      {/* Điều kiện mở phần công bố — hiển thị đúng cái đang thiếu */}
      {blockers.length ? (
        <ul className="mb-3 flex flex-col gap-1">
          {blockers.map((b) => (
            <li key={b} className="text-warn font-mono text-[0.66rem]">
              ✕ {b}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ok mb-3 font-mono text-[0.66rem]">
          ✓ Đủ điều kiện công bố
        </p>
      )}

      {/* Nút snapshot và danh sách giải hiển thị SONG SONG. Giải khán giả chỉ
          cần snapshot bình chọn, nên giấu cả danh sách sau snapshot điểm BGK là
          khoá nhầm một luồng không liên quan. */}
      {!hasJudgingSnapshot ? (
        <>
          <Btn
            variant="ghost"
            disabled={pending || blockers.length > 0}
            onClick={() => setConfirmSnapshot(true)}
          >
            Tạo Publishing Snapshot
          </Btn>
          <p className="text-silver-dim mt-2 text-[0.66rem] leading-relaxed">
            Chốt bảng điểm và khoá toàn bộ điểm của đầu cầu. Sau bước này BGK
            không sửa điểm được nữa.
          </p>
        </>
      ) : null}

      {awards.length ? (
        <ol className="mt-3 flex flex-col gap-1.5">
          {awards.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[0.68rem]"
            >
              <span className={a.publishedAt ? "text-ok" : "text-silver-dim"}>
                {a.publishedAt ? "✓" : "○"}
              </span>
              <span className="text-chalk">
                {a.sortOrder}. {a.nameEn}
              </span>
              <span className="text-silver-dim">{a.nameVi}</span>
              {a.source === "audience_vote" ? (
                <span className="text-cyan">· khán giả</span>
              ) : null}

              <span className="ml-auto flex gap-2">
                {!a.publishedAt ? (
                  <button
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await publishAwardAction(slug, a.id);
                        onError(r.ok ? null : (r.error ?? "Không công bố được."));
                        reload();
                      })
                    }
                    className="text-brand underline-offset-4 hover:underline disabled:opacity-40"
                  >
                    công bố
                  </button>
                ) : (
                  <>
                    <button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await setAwardStageAction(slug, "award_reveal", a.id);
                          onError(r.ok ? null : (r.error ?? null));
                        })
                      }
                      className="text-cyan underline-offset-4 hover:underline"
                    >
                      chiếu lại
                    </button>
                    {a.source === "judging" ? (
                      <button
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await setAwardStageAction(slug, "scorecard", a.id);
                            onError(r.ok ? null : (r.error ?? null));
                          })
                        }
                        className="text-silver underline-offset-4 hover:underline"
                      >
                        bảng điểm
                      </button>
                    ) : null}
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["awards_intro", "Mở màn công bố"],
            ["audience_award_shuffle", "Shuffle Crowd Magnet"],
            ["awards_summary", "Màn tổng kết"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setAwardStageAction(slug, mode);
                onError(r.ok ? null : (r.error ?? null));
              })
            }
            className="border-navy-600 text-silver hover:text-chalk min-h-[36px] rounded-lg border px-2.5 text-xs transition disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-silver-dim mt-3 text-[0.66rem] leading-relaxed">
        Giải cao nhất bị chặn tới khi mọi giải khác đã công bố. Shuffle không
        mang theo kết quả — winner chỉ đi lên LED sau khi bấm công bố.
      </p>

      {confirmSnapshot ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận tạo snapshot"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,9,20,.82)] p-4 backdrop-blur-sm"
        >
          <div className="glass-strong w-full max-w-md rounded-2xl p-5">
            <p className="text-warn font-mono text-[0.64rem] tracking-[0.16em] uppercase">
              Không quay lại được
            </p>
            <h2 className="display text-chalk mt-2 text-xl">
              Chốt bảng điểm và khoá điểm?
            </h2>
            <p className="text-silver mt-2 text-sm leading-relaxed">
              Toàn bộ điểm của đầu cầu này sẽ chuyển sang trạng thái đã khoá. BGK
              không sửa được nữa. Kết quả công bố về sau đọc từ snapshot này.
            </p>
            <div className="mt-4 flex gap-2">
              <Btn
                variant="ghost"
                className="flex-1"
                onClick={() => setConfirmSnapshot(false)}
              >
                Hủy
              </Btn>
              <Btn
                variant="brand"
                className="flex-[1.4]"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await createSnapshotAction(slug);
                    setConfirmSnapshot(false);
                    onError(r.ok ? null : (r.error ?? "Không tạo được snapshot."));
                    if (r.ok && r.ties) {
                      onError(
                        `⚠ Có ${r.ties} nhóm đồng điểm. Ban Tổ chức phải quyết trước khi công bố giải liên quan.`,
                      );
                    }
                    reload();
                  })
                }
              >
                Chốt và khoá
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function ModeBtn({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-[44px] rounded-lg border px-3.5 text-sm transition disabled:opacity-50 ${
        active
          ? "border-brand text-brand edge-brand"
          : "border-navy-600 text-silver hover:text-chalk"
      }`}
    >
      {children}
    </button>
  );
}
