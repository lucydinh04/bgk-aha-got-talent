"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Performance } from "@/lib/data";
import { orderLabel, teamLabel } from "@/lib/data";
import { useMotion } from "./MotionRoot";
import { MotionSafeQR, stagger } from "./primitives";

/* ═══════════════════════════════════════════════════════════════════════════
   CHƯA NỐI VÀO STATE THẬT — ĐỌC TRƯỚC KHI DÙNG

   Mọi component trong file này phục vụ chế độ công bố giải, mà chế độ đó chưa
   tồn tại trong data layer: `live_display_state.display_mode` có CHECK
   constraint chỉ nhận chín giá trị vận hành, cố ý dựng như vậy ở Phase 3 để
   LED không thể tự vào chế độ công bố.

   Vì vậy các component này hiện chỉ chạy trong harness `/motion/[location]`
   (chỉ có ở development). Khi Phase 4 mở thêm display_mode và Publishing
   Snapshot, cắm thẳng vào là chạy — không phải viết lại.

   LUẬT SỐNG CÒN CỦA SHUFFLE: component KHÔNG BAO GIỜ tự chọn người thắng.
   `winnerCode` là prop, đến từ snapshot kết quả đã khoá, và chỉ được truyền
   xuống ở đúng khoảnh khắc Admin bấm Reveal. Trước đó prop là null — không có
   cách nào để DOM order, class name hay thứ tự animation làm lộ kết quả.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Crowd Magnet · shuffle ──────────────────────────────────────────────── */

export function CrowdMagnetShuffle({
  performances,
  awardName,
}: {
  performances: Performance[];
  awardName: string;
}) {
  const { reducedMotion } = useMotion();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2cqw]">
      <span className="border-y border-[rgba(255,127,50,.45)] px-[2.4cqw] py-[0.8cqw] text-[1.8cqw] font-mono tracking-[0.3em] text-[#FF7F32] uppercase">
        {awardName}
      </span>

      <div className="flex flex-wrap items-center justify-center gap-[1.6cqw]">
        {performances.map((p, i) => (
          <div
            key={p.registrationCode}
            className="rounded-[0.9cqw] border border-[rgba(62,216,240,.32)] bg-[rgba(4,9,20,.86)] px-[2cqw] py-[1.2cqw] text-center"
            style={
              reducedMotion
                ? undefined
                : ({
                    // Quỹ đạo cố định theo index, có nhịp dừng 38% chu kỳ để tên
                    // đọc được. Không random — random là cửa ngõ để lộ winner.
                    "--orbit-x": `${((i % 4) - 1.5) * 34}px`,
                    "--orbit-y": `${((i % 3) - 1) * 22}px`,
                    animation: `shuffle-orbit ${3.2 + (i % 3) * 0.5}s ease-in-out ${i * 0.22}s infinite`,
                    willChange: "transform",
                  } as React.CSSProperties)
            }
          >
            <span className="tnum block font-mono text-[1.2cqw] text-[#FF7F32]">
              {orderLabel(p)}
            </span>
            <span className="display mt-[0.4cqw] block text-[1.9cqw] text-[#F2F7FF]">
              {p.performanceName}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[1.3cqw] font-mono tracking-[0.2em] text-[#8FA3BC] uppercase">
        Đang tổng hợp bình chọn khán giả
      </p>
    </div>
  );
}

/* ── Award reveal ────────────────────────────────────────────────────────── */

export type AwardIntensity = "pulse" | "spotlight" | "audience" | "grand";

/**
 * Bốn cường độ cho bốn giải. Cùng một animation cho mọi giải sẽ làm giải Nhất
 * mất trọng lượng — cao trào phải tăng dần theo thứ tự công bố.
 */
const INTENSITY: Record<
  AwardIntensity,
  { accent: string; glow: string; confetti: number; buildMs: number }
> = {
  pulse: { accent: "#3ED8F0", glow: "rgba(62,216,240,.5)", confetti: 0, buildMs: 260 },
  spotlight: { accent: "#FF7F32", glow: "rgba(255,127,50,.5)", confetti: 0, buildMs: 420 },
  audience: { accent: "#FFA76B", glow: "rgba(255,167,107,.55)", confetti: 18, buildMs: 520 },
  grand: { accent: "#FF7F32", glow: "rgba(255,127,50,.7)", confetti: 34, buildMs: 760 },
};

export function AwardRevealSequence({
  awardName,
  awardSub,
  performance,
  intensity = "pulse",
}: {
  awardName: string;
  awardSub?: string;
  performance: Performance;
  intensity?: AwardIntensity;
}) {
  const cfg = INTENSITY[intensity];
  const { reducedMotion } = useMotion();

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-[1.4cqw]">
      {/* Energy build-up: các đường hội tụ về tâm, chạy một lần */}
      {!reducedMotion ? (
        <ConvergingLines accent={cfg.accent} durationMs={cfg.buildMs} />
      ) : null}

      {intensity === "spotlight" || intensity === "grand" ? (
        <SpotlightSweep />
      ) : null}

      <span
        className="anim-enter-fade border-y px-[2.4cqw] py-[0.8cqw] text-[1.8cqw] font-mono tracking-[0.3em] uppercase"
        style={{
          borderColor: cfg.glow,
          color: cfg.accent,
          ...stagger(0, 0, cfg.buildMs),
        }}
      >
        {awardName}
      </span>

      {awardSub ? (
        <span
          className="anim-enter-fade text-[1.4cqw] font-mono tracking-[0.24em] text-[#C6D4E6] uppercase"
          style={stagger(0, 0, cfg.buildMs + 160)}
        >
          {awardSub}
        </span>
      ) : null}

      <h1
        className="display text-center text-[5.4cqw] leading-[0.95] text-[#F2F7FF]"
        style={{
          animation: `winner-rise 720ms cubic-bezier(0.22,1,0.36,1) ${cfg.buildMs + 300}ms both`,
          textShadow: `0 0 4cqw ${cfg.glow}`,
        }}
      >
        {performance.performanceName}
      </h1>

      <p
        className="anim-enter-up text-[1.6cqw] font-mono tracking-[0.14em] text-[#C6D4E6] uppercase"
        style={stagger(0, 0, cfg.buildMs + 620)}
      >
        {teamLabel(performance)}
        {performance.department ? ` · ${performance.department}` : ""}
      </p>

      {cfg.confetti > 0 && !reducedMotion ? (
        <ConfettiBurst count={cfg.confetti} delayMs={cfg.buildMs + 420} accent={cfg.accent} />
      ) : null}
    </div>
  );
}

function ConvergingLines({
  accent,
  durationMs,
}: {
  accent: string;
  durationMs: number;
}) {
  const lines = [0, 1, 2, 3];
  return (
    <span aria-hidden data-motion-decorative="true" className="motion-layer">
      {lines.map((i) => {
        const top = 30 + i * 13;
        const fromLeft = i % 2 === 0;
        return (
          <span
            key={i}
            className="absolute h-[2px]"
            style={{
              top: `${top}%`,
              [fromLeft ? "left" : "right"]: 0,
              width: "46%",
              transformOrigin: fromLeft ? "left center" : "right center",
              background: `linear-gradient(${fromLeft ? "90deg" : "270deg"}, transparent, ${accent})`,
              boxShadow: `0 0 12px ${accent}`,
              animation: `converge-line ${durationMs + 240}ms cubic-bezier(0.22,1,0.36,1) ${i * 70}ms both`,
            }}
          />
        );
      })}
    </span>
  );
}

function SpotlightSweep() {
  return (
    <span aria-hidden data-motion-decorative="true" className="motion-layer">
      <span
        className="absolute inset-y-0 left-0 w-[28%]"
        style={{
          background:
            "linear-gradient(100deg, transparent, rgba(255,215,170,.4), transparent)",
          animation: "spotlight-sweep 1.6s ease-in-out 300ms both",
        }}
      />
    </span>
  );
}

/** Confetti có kiểm soát: số lượng cố định, chạy một lượt rồi biến mất khỏi DOM. */
function ConfettiBurst({
  count,
  delayMs,
  accent,
}: {
  count: number;
  delayMs: number;
  accent: string;
}) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setGone(true), delayMs + 3200);
    return () => clearTimeout(t);
  }, [delayMs]);

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        x: `${((i % 7) - 3) * 26}px`,
        r: `${140 + (i % 5) * 70}deg`,
        dur: `${2100 + (i % 6) * 260}ms`,
        delay: `${delayMs + (i % 9) * 90}ms`,
        color: i % 3 === 0 ? accent : i % 3 === 1 ? "#3ED8F0" : "#F2F7FF",
        w: i % 4 === 0 ? 5 : 3,
        h: i % 4 === 0 ? 9 : 7,
      })),
    [count, delayMs, accent],
  );

  if (gone) return null;

  return (
    <span aria-hidden data-motion-decorative="true" className="motion-layer overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block"
          style={
            {
              left: p.left,
              width: p.w,
              height: p.h,
              background: p.color,
              "--confetti-x": p.x,
              "--confetti-r": p.r,
              animation: `confetti-fall ${p.dur} linear ${p.delay} both`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

/* ── Scorecard ───────────────────────────────────────────────────────────── */

/**
 * Bảng điểm hiện theo thứ tự đọc: từng tiêu chí, rồi tổng điểm cuối cùng.
 *
 * Không đếm số từ 0 lên. Một con số chạy từ 0 tới 89.40 trông như hệ thống
 * đang tính lại điểm ngay trên sân khấu; con số này đã chốt từ trước, nên nó
 * xuất hiện dứt khoát.
 */
export function ScorecardReveal({
  awardName,
  performance,
  rows,
  total,
}: {
  awardName: string;
  performance: Performance;
  rows: { label: string; weight: number; value: string }[];
  total: string;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-[1.2cqw]">
      <span
        className="anim-enter-fade text-[1.4cqw] font-mono tracking-[0.26em] text-[#FF7F32] uppercase"
        style={stagger(0, 0, 80)}
      >
        {awardName}
      </span>
      <h2
        className="anim-enter-left display text-[3.2cqw] text-[#F2F7FF]"
        style={stagger(0, 0, 200)}
      >
        {performance.performanceName}
      </h2>

      <ul className="mt-[0.6cqw] flex w-[58cqw] max-w-full flex-col">
        {rows.map((r, i) => (
          <li
            key={r.label}
            className="anim-enter-up grid grid-cols-[1fr_12%_16%] items-baseline gap-[1cqw] border-b border-[rgba(146,170,200,.18)] py-[0.6cqw]"
            style={stagger(i, 130, 420)}
          >
            <span className="text-[1.5cqw] text-[#DCE7F5]">{r.label}</span>
            <span className="tnum text-right font-mono text-[1.2cqw] text-[#3ED8F0]">
              {Math.round(r.weight * 100)}%
            </span>
            <span className="tnum display text-right text-[2cqw] text-[#F2F7FF]">
              {r.value}
            </span>
          </li>
        ))}
      </ul>

      <div
        className="anim-enter-pop mt-[0.8cqw] flex w-[58cqw] max-w-full items-baseline justify-between"
        style={stagger(rows.length, 130, 420)}
      >
        <span className="text-[1.4cqw] font-mono tracking-[0.2em] text-[#C6D4E6] uppercase">
          Tổng điểm
        </span>
        <span className="display tnum text-[4.4cqw] text-[#FF7F32] [text-shadow:0_0_3cqw_rgba(255,127,50,.5)]">
          {total}
        </span>
      </div>
    </div>
  );
}

/* ── Countdown bình chọn ─────────────────────────────────────────────────── */

/**
 * Đồng hồ đếm ngược neo theo GIỜ SERVER.
 *
 * `endsAt` và `serverNow` cùng đến từ một response, nên lệch giờ máy chiếu
 * không ảnh hưởng: ta tính offset một lần rồi luôn đọc giờ qua offset đó.
 */
export function VoteCountdown({
  endsAt,
  serverNow,
  onExpire,
}: {
  endsAt: string;
  serverNow: string;
  onExpire?: () => void;
}) {
  /*
    Giá trị đầu tính THUẦN từ hai prop, không đụng `Date.now()`: render phải cho
    ra cùng một kết quả trên server và trên client, nếu không sẽ lệch hydration
    và số giây nhảy một cái ngay khi trang vừa hiện.
  */
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(endsAt).getTime() - new Date(serverNow).getTime()),
  );
  const fired = useRef(false);

  useEffect(() => {
    // Chênh lệch giữa giờ server và giờ máy chiếu, đo một lần rồi dùng suốt.
    // Máy chiếu lệch giờ vài phút là chuyện thường; đồng hồ vẫn phải đúng.
    const offset = new Date(serverNow).getTime() - Date.now();
    const end = new Date(endsAt).getTime();

    const tick = () => {
      const left = Math.max(0, end - (Date.now() + offset));
      setRemaining(left);
      if (left === 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, serverNow, onExpire]);

  const secs = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  // Ba ngưỡng: 60s tăng glow, 30s chuyển sang cam, 10s đập nhẹ mỗi giây.
  const urgent = secs <= 10 && secs > 0;
  const warm = secs <= 30;
  const glow = secs <= 60;
  const accent = warm ? "#FF7F32" : "#3ED8F0";

  return (
    <div
      className="display tnum flex items-baseline gap-[0.4cqw] text-[9cqw] leading-none"
      style={{
        color: accent,
        textShadow: glow ? `0 0 4cqw ${warm ? "rgba(255,127,50,.6)" : "rgba(62,216,240,.5)"}` : undefined,
        transition: "color 600ms ease, text-shadow 600ms ease",
        // Đập theo từng giây, không flash toàn màn hình.
        animation: urgent ? "urgent-beat 1s ease-in-out infinite" : undefined,
      }}
      aria-label={`Còn ${mm} phút ${ss} giây`}
    >
      <Digits value={mm} />
      <span className="opacity-70">:</span>
      <Digits value={ss} />
    </div>
  );
}

/** Mỗi chữ số đổi bằng slide ngắn — không flip clock, không 3D. */
function Digits({ value }: { value: string }) {
  return (
    <span className="inline-flex">
      {value.split("").map((d, i) => (
        <span key={`${i}-${d}`} className="inline-block overflow-hidden">
          <span
            className="inline-block"
            style={{ animation: "digit-in 260ms cubic-bezier(0.22,1,0.36,1) both" }}
          >
            {d}
          </span>
        </span>
      ))}
    </span>
  );
}

/* ── Vote states ─────────────────────────────────────────────────────────── */

export function VoteLivePanel({
  voteUrl,
  participants,
  endsAt,
  serverNow,
}: {
  voteUrl: string;
  participants: number;
  endsAt: string;
  serverNow: string;
}) {
  return (
    <div className="flex h-full items-center justify-between gap-[3cqw]">
      <div className="flex flex-col gap-[1.2cqw]">
        <span className="anim-enter-left text-[1.5cqw] font-mono tracking-[0.28em] text-[#3ED8F0] uppercase">
          Bình chọn tiết mục yêu thích
        </span>
        <VoteCountdown endsAt={endsAt} serverNow={serverNow} />
        <p className="anim-enter-up text-[1.5cqw] text-[#C6D4E6]" style={stagger(0, 0, 300)}>
          Mỗi người tối đa <strong className="text-[#F2F7FF]">2 phiếu</strong>
        </p>
        <p
          className="anim-enter-up tnum text-[1.8cqw] font-mono text-[#FFA76B]"
          style={stagger(0, 0, 420)}
        >
          {participants} khán giả đã tham gia
        </p>
      </div>

      {/* QR đứng yên tuyệt đối — không animate, không blur, không particle đè */}
      <MotionSafeQR caption={voteUrl} />
    </div>
  );
}

export function VoteClosedPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[1.2cqw]">
      <h1
        className="anim-enter-up display text-[4.6cqw] text-[#F2F7FF]"
        style={stagger(0, 0, 120)}
      >
        Bình chọn đã kết thúc
      </h1>
      <p
        className="anim-enter-up text-[1.7cqw] font-mono tracking-[0.2em] text-[#C6D4E6] uppercase"
        style={stagger(0, 0, 320)}
      >
        Ban Tổ chức đang xác nhận kết quả
      </p>
      <span
        aria-hidden
        data-motion-decorative="true"
        className="mt-[1cqw] block h-[0.3cqw] w-[22cqw] overflow-hidden rounded-full bg-[rgba(146,170,200,.25)]"
      >
        <span
          className="block h-full w-[36%]"
          style={{
            background: "linear-gradient(90deg, transparent, #3ED8F0, transparent)",
            animation: "scan-line 1.8s ease-in-out infinite",
          }}
        />
      </span>
    </div>
  );
}
