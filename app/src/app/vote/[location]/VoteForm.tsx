"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CampaignHero, KVBackground, CampaignLogo } from "@/components/campaign";
import { orderLabel, teamLabel, type LocationCode, type Performance } from "@/lib/data";
import { newIdempotencyKey } from "@/lib/localDraft";
import {
  readVoteStateAction,
  submitBallotAction,
  type VoteState,
} from "@/app/actions/voting";

/**
 * Lá phiếu khán giả.
 *
 * Màn hình này KHÔNG BAO GIỜ hiện số phiếu của bất kỳ tiết mục nào, kể cả sau
 * khi gửi xong. Khán giả biết mình đã bầu, không biết ai đang dẫn — nếu biết,
 * những người bầu sau sẽ bầu theo đám đông và giải mất ý nghĩa.
 *
 * Mọi điều kiện hợp lệ đều kiểm lại ở server: còn hạn hay không, thiết bị đã
 * bầu chưa, tiết mục có trong lá phiếu không. Ở đây chỉ là trải nghiệm.
 */
export function VoteForm({
  location,
  performances,
  initial,
}: {
  location: LocationCode;
  performances: Performance[];
  initial: VoteState;
}) {
  const [state, setState] = useState<VoteState>(initial);
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(initial.alreadyVoted);

  const maxVotes = state.maxSelections;

  // Một khoá cho một lá phiếu, sinh khi mount. Bấm gửi hai lần, mạng gửi lại —
  // server vẫn chỉ ghi một ballot.
  const idempotencyKey = useRef<string | null>(null);
  if (idempotencyKey.current == null) idempotencyKey.current = newIdempotencyKey();

  /** Hai phiếu phải là hai tiết mục khác nhau — cùng một card không chọn 2 lần được. */
  const toggle = (code: string) =>
    setPicked((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : prev.length >= maxVotes
          ? prev
          : [...prev, code],
    );

  /*
    Đồng bộ lại trạng thái phiên mỗi 5 giây.
    Không dùng SSE ở đây: hàng trăm điện thoại giữ kết nối mở suốt buổi là gánh
    nặng thật, trong khi thứ duy nhất khán giả cần biết là "còn mở hay đã đóng".
  */
  const refresh = useCallback(async () => {
    try {
      const next = await readVoteStateAction(location.toLowerCase());
      setState(next);
      if (next.alreadyVoted) setDone(true);
    } catch {
      // Mất mạng: giữ nguyên state cũ, thử lại ở nhịp sau.
    }
  }, [location]);

  useEffect(() => {
    if (done) return;
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh, done]);

  const submit = async () => {
    if (sending || !state.sessionId) return;
    setSending(true);
    setError(null);
    const result = await submitBallotAction({
      slug: location.toLowerCase(),
      sessionId: state.sessionId,
      performanceCodes: picked,
      idempotencyKey: idempotencyKey.current ?? newIdempotencyKey(),
    });
    if (result.ok) {
      setDone(true);
      setStep("pick");
    } else {
      setError(result.error);
      setStep("pick");
    }
    setSending(false);
  };

  if (done) return <VoteSuccess />;
  if (state.status === "none") return <VoteNotOpen location={location} />;
  if (state.status === "closed") return <VoteClosed />;

  const votable = performances.filter((p) =>
    state.performances.some((sp) => sp.code === p.registrationCode),
  );

  return (
    <main className="bg-ink min-h-dvh pb-32">
      {/*
        Dải KV thuần, KHÔNG đặt chữ lên trên: ở bề rộng mobile, cover ảnh 2.27:1
        vào dải thấp vẫn để lọt headline "CHUYỂN MÌNH BỨT PHÁ" của artwork, đặt
        chữ lên đó sẽ thành hai headline chồng nhau. Tiêu đề nằm dưới, trên navy.
      */}
      <CampaignHero
        variant="square"
        anchor="cityBand"
        overlay="light"
        priority
        sizes="100vw"
        className="h-24 w-full"
      >
        <div className="flex h-full items-start p-4">
          <CampaignLogo width={92} priority />
        </div>
      </CampaignHero>

      <div className="border-navy-800 border-b px-4 py-3">
        <p className="text-cyan font-mono text-[0.62rem] tracking-[0.22em] uppercase">
          The Crowd Magnet · {location}
        </p>
        <h1 className="display text-chalk mt-1 text-lg">
          Bình chọn tiết mục bạn yêu thích
        </h1>
      </div>

      <div className="border-brand/45 bg-navy-950/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-2.5">
          <span className="text-silver text-xs">
            Đã chọn{" "}
            <strong className="text-brand tnum">
              {picked.length}/{maxVotes}
            </strong>{" "}
            tiết mục
          </span>
          <Countdown
            closesAt={state.closesAt}
            serverNow={state.serverNow}
            onExpire={refresh}
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-lg px-4 pt-4">
        <p className="text-silver-dim mb-3 text-xs">
          Bạn có tối đa {maxVotes} phiếu. {maxVotes > 1 ? "Các phiếu phải dành cho các tiết mục khác nhau, và " : "Phiếu "}
          không sửa được sau khi gửi.
        </p>

        {error ? (
          <p
            role="alert"
            className="border-danger/45 text-danger mb-3 rounded-lg border px-3 py-2 text-xs leading-relaxed"
          >
            {error}
          </p>
        ) : null}

        <ul className="flex flex-col gap-2.5">
          {votable.map((p) => {
            const on = picked.includes(p.registrationCode);
            const full = picked.length >= maxVotes && !on;
            return (
              <li key={p.registrationCode}>
                <button
                  type="button"
                  onClick={() => toggle(p.registrationCode)}
                  disabled={full}
                  aria-pressed={on}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                    on
                      ? "border-cyan bg-cyan/8 edge-electric"
                      : "border-navy-700 bg-navy-900/60"
                  } ${full ? "opacity-40" : ""}`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded border text-xs ${
                      on
                        ? "border-cyan bg-cyan text-[#04121a]"
                        : "border-navy-600 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className="text-brand tnum block font-mono text-[0.62rem]">
                      #{orderLabel(p)}
                    </span>
                    <span className="display text-chalk mt-0.5 block text-sm leading-tight">
                      {p.performanceName}
                    </span>
                    <span className="text-silver mt-1 block text-xs">
                      {[p.participationType, p.performanceType]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="text-silver-dim block text-xs">
                      {teamLabel(p)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {/* Không số phiếu, không tiết mục dẫn đầu — kể cả ở đây */}
      </div>

      <div className="glass-strong fixed inset-x-0 bottom-0 z-20 border-t border-t-[color-mix(in_oklab,var(--color-navy-700)_60%,transparent)]">
        <div className="mx-auto w-full max-w-lg px-4 py-3">
          <button
            type="button"
            disabled={picked.length === 0 || sending}
            onClick={() => setStep("confirm")}
            className="bg-brand hover:bg-brand-deep display min-h-[52px] w-full rounded-lg text-base text-[#1a0c02] transition disabled:opacity-40"
          >
            Xác nhận bình chọn
          </button>
        </div>
      </div>

      {step === "confirm" ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận lựa chọn"
          className="fixed inset-0 z-40 flex items-end bg-[rgba(4,9,20,.8)] p-4 backdrop-blur-sm sm:items-center sm:justify-center"
        >
          <div className="glass-strong w-full max-w-md rounded-2xl p-5">
            <h2 className="display text-chalk text-xl">Xác nhận lựa chọn?</h2>
            <p className="text-silver mt-2 text-sm">
              Bạn sẽ không thể thay đổi bình chọn sau khi gửi.
            </p>
            <ul className="border-navy-700 mt-4 flex flex-col gap-1 rounded-lg border p-3">
              {picked.map((code) => {
                const p = votable.find((x) => x.registrationCode === code);
                return (
                  <li key={code} className="text-silver text-xs">
                    #{p ? orderLabel(p) : "--"} · {p?.performanceName}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setStep("pick")}
                disabled={sending}
                className="border-navy-600 text-silver min-h-[48px] flex-1 rounded-lg border text-sm disabled:opacity-40"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={sending}
                className="bg-brand display min-h-[48px] flex-[1.3] rounded-lg text-base text-[#1a0c02] disabled:opacity-60"
              >
                {sending ? "Đang gửi…" : "Gửi bình chọn"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/** Đếm ngược theo giờ SERVER — điện thoại lệch giờ không làm sai hạn. */
function Countdown({
  closesAt,
  serverNow,
  onExpire,
}: {
  closesAt: string | null;
  serverNow: string;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(() =>
    closesAt
      ? Math.max(0, new Date(closesAt).getTime() - new Date(serverNow).getTime())
      : 0,
  );
  const fired = useRef(false);

  useEffect(() => {
    if (!closesAt) return;
    const offset = new Date(serverNow).getTime() - Date.now();
    const end = new Date(closesAt).getTime();
    const tick = () => {
      const ms = Math.max(0, end - (Date.now() + offset));
      setLeft(ms);
      if (ms === 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [closesAt, serverNow, onExpire]);

  if (!closesAt) return null;
  const secs = Math.ceil(left / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span
      className={`tnum font-mono text-sm ${secs <= 30 ? "text-brand" : "text-chalk"}`}
    >
      {mm}:{ss}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-ink flex min-h-dvh flex-col">
      {/* KV vuông giữ trọn icon A — không cover sang khung hẹp hơn 1:1 */}
      <KVBackground
        variant="portrait"
        overlay="medium"
        fit="cover"
        priority
        sizes="100vw"
        className="aspect-square w-full"
      />
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        {children}
      </div>
    </main>
  );
}

function VoteSuccess() {
  return (
    <Shell>
      <span className="text-ok border-ok grid size-14 place-items-center rounded-full border-2 text-2xl">
        ✓
      </span>
      <h1 className="display text-chalk mt-4 text-2xl">Bình chọn thành công</h1>
      <p className="text-silver mt-2 max-w-xs text-sm">
        Cảm ơn bạn đã bình chọn cho tiết mục mình yêu thích.
      </p>
      {/* Không số phiếu, không tiết mục dẫn đầu, không tỷ lệ, không thứ hạng */}
    </Shell>
  );
}

function VoteNotOpen({ location }: { location: LocationCode }) {
  return (
    <Shell>
      <h1 className="display text-chalk text-2xl">Bình chọn chưa mở</h1>
      <p className="text-silver mt-2 max-w-xs text-sm">
        Phần bình chọn {location} sẽ mở trong chương trình. Giữ trang này và quay
        lại khi MC thông báo.
      </p>
    </Shell>
  );
}

function VoteClosed() {
  return (
    <Shell>
      <h1 className="display text-chalk text-2xl">Bình chọn đã kết thúc</h1>
      <p className="text-silver mt-2 max-w-xs text-sm">
        Ban Tổ chức đang xác nhận kết quả. Kết quả sẽ được công bố trên sân khấu.
      </p>
    </Shell>
  );
}
