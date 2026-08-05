"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Gốc của hệ motion trên màn LED.
 *
 * Làm đúng ba việc, không hơn:
 *   1. Tạm dừng mọi animation khi tab bị ẩn — máy chiếu hay bị chuyển tab giữa
 *      chương trình, và không có gì tệ hơn việc đốt GPU cho màn không ai nhìn.
 *   2. Đọc `prefers-reduced-motion` để component nào cần rẽ nhánh thật sự
 *      (shuffle → crossfade) thì biết đường rẽ. Phần tắt hiệu ứng thuần trang
 *      trí đã do CSS lo.
 *   3. Bật panel debug khi `?motionDebug=true` — và CHỈ ở development.
 *
 * Không giữ state animation nào. Mọi hiệu ứng là CSS declarative, nên React
 * render lại bao nhiêu lần cũng không làm animation chạy lại từ đầu — đây
 * chính là điều kiện để realtime update không reset background.
 */

export type MotionSpeed = "normal" | "slow" | "paused" | "skip";

interface MotionState {
  reducedMotion: boolean;
  /** true khi tab ẩn HOẶC người debug bấm pause */
  paused: boolean;
  speed: MotionSpeed;
  debug: boolean;
}

const MotionContext = createContext<MotionState>({
  reducedMotion: false,
  paused: false,
  speed: "normal",
  debug: false,
});

export const useMotion = () => useContext(MotionContext);

export function MotionRoot({
  debug = false,
  children,
}: {
  debug?: boolean;
  children: ReactNode;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [speed, setSpeed] = useState<MotionSpeed>("normal");

  // Panel debug không bao giờ tồn tại ở production, kể cả khi ai đó gắn query.
  const debugEnabled = debug && process.env.NODE_ENV !== "production";

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const paused = hidden || speed === "paused";

  return (
    <MotionContext.Provider
      value={{ reducedMotion, paused, speed, debug: debugEnabled }}
    >
      <div
        data-motion-paused={paused ? "true" : "false"}
        data-motion-speed={speed === "slow" ? "slow" : undefined}
        className="contents"
      >
        {children}
      </div>
      {debugEnabled ? (
        <MotionDebugPanel speed={speed} onSpeed={setSpeed} reduced={reducedMotion} />
      ) : null}
    </MotionContext.Provider>
  );
}

/** Chỉ dựng ở development. Production không render nút nào. */
function MotionDebugPanel({
  speed,
  onSpeed,
  reduced,
}: {
  speed: MotionSpeed;
  onSpeed: (s: MotionSpeed) => void;
  reduced: boolean;
}) {
  const options: [MotionSpeed, string][] = [
    ["normal", "1×"],
    ["slow", "0.25×"],
    ["paused", "Pause"],
    ["skip", "Skip"],
  ];
  return (
    <div className="fixed bottom-3 left-3 z-[100] flex flex-col gap-1.5 rounded-lg border border-[#35d6f0]/40 bg-[rgba(4,9,20,.92)] p-2 font-mono text-[0.62rem] text-[#93a7c4]">
      <span className="text-[#35d6f0] tracking-[0.14em] uppercase">motion debug</span>
      <div className="flex gap-1">
        {options.map(([value, label]) => (
          <button
            key={value}
            onClick={() => onSpeed(value)}
            className={`rounded border px-1.5 py-0.5 ${
              speed === value
                ? "border-[#ff7f32] text-[#ff7f32]"
                : "border-[#1b3d6e] text-[#5e7a9c]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <span>reduced-motion: {reduced ? "on" : "off"}</span>
    </div>
  );
}
