"use client";

import { useMemo } from "react";

import { CampaignImage } from "@/components/campaign/CampaignImage";
import { Overlay, type OverlayLevel } from "@/components/campaign";

/**
 * Nền LED nhiều lớp, chuyển động chậm.
 *
 * ĐIỀU QUAN TRỌNG NHẤT VỀ FILE NÀY: nó không nhận prop nào thay đổi theo
 * realtime. Toàn bộ lớp nền là CSS animation trên các node có identity ổn
 * định, nên khi snapshot SSE về và React render lại, background KHÔNG bị
 * remount và animation KHÔNG chạy lại từ đầu. Đó là lý do component này tách
 * hẳn khỏi phần nội dung state.
 *
 * Bảy lớp, dưới lên trên:
 *   1. KV city      — zoom rất chậm 1 → 1.025, 18s, alternate
 *   2. Blue glow    — hai quầng xanh trôi và thở
 *   3. Orange trail — vệt sáng chạy ngang dải thấp
 *   4. Particles    — 18 node CSS, không phải hàng trăm
 *   5. Fine grid    — drift gần như tĩnh
 *   6. Overlay      — scrim navy của design system, không đổi
 *   7. Vignette + noise
 *
 * Lớp 2–5 và 7 đánh dấu `data-motion-decorative` → biến mất hoàn toàn khi
 * người xem bật reduced motion.
 */

/** 18 hạt. Vị trí và nhịp cố định theo index — không random, nên SSR và client
 *  dựng ra cùng một DOM, và không có hydration mismatch. */
const PARTICLE_COUNT = 18;

interface BackgroundProps {
  overlay?: OverlayLevel;
  /** Standby giữ trọn artwork; state có chữ dùng scrim đậm hơn. */
  quiet?: boolean;
  /** Tắt hẳn các lớp trang trí (dùng cho Emergency Hide). */
  bare?: boolean;
  /**
   * Nội dung nằm ở đâu trên khung.
   *
   * `bottom` là mặc định: chữ nằm trong dải light trail dưới đáy, scrim dồn
   * xuống đó, headline in sẵn của KV vẫn hiện nguyên.
   *
   * `center` dành cho các màn công bố — chữ nằm giữa khung, đúng chỗ KV đã có
   * headline "CHUYỂN MÌNH BỨT PHÁ" rất sáng. Không có scrim giữa thì chữ trắng
   * đè lên chữ trắng và không ai đọc được.
   */
  anchor?: "bottom" | "center";
}

export function AnimatedCampaignBackground({
  overlay,
  quiet = true,
  bare = false,
  anchor = "bottom",
}: BackgroundProps) {
  const level: OverlayLevel = overlay ?? (quiet ? "stage" : "light");

  return (
    <>
      {/* 1 · KV city — scale đồng đều, không bao giờ scaleX riêng lẻ */}
      <div
        aria-hidden
        className="motion-layer"
        style={{
          animation: "kv-drift 18s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      >
        <CampaignImage
          asset="kvLandscape"
          fill
          priority
          quality={90}
          sizes="100vw"
          anchor="full"
          fit="cover"
        />
      </div>

      {!bare ? (
        <>
          <BlueEnergyGlow />
          <OrangeLightTrail />
          <AmbientParticleLayer />
          <DigitalSquareField />
        </>
      ) : null}

      {/* 6 · Overlay của design system — giữ nguyên, không đổi màu KV */}
      <Overlay level={level} />

      {/*
        Scrim trung tâm cho màn công bố. Ellipse chứ không phủ đều: bốn mép vẫn
        giữ light trail cam và cyan của artwork, chỉ vùng đặt chữ mới tối đi.
      */}
      {anchor === "center" && !bare ? (
        <div
          aria-hidden
          className="motion-layer"
          style={{
            background:
              "radial-gradient(ellipse 62% 58% at 50% 50%, rgba(4,9,20,.93) 0%, rgba(4,9,20,.82) 42%, rgba(4,9,20,.35) 70%, transparent 88%)",
          }}
        />
      ) : null}

      {!bare ? <VignetteNoise /> : null}
    </>
  );
}

/* ── Lớp 2 · Blue energy glow ────────────────────────────────────────────── */

export function BlueEnergyGlow() {
  return (
    <div aria-hidden data-motion-decorative="true" className="motion-layer">
      <div
        className="absolute top-[-12%] left-[-8%] h-[70%] w-[52%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(30,107,255,.34) 0%, rgba(30,107,255,0) 68%)",
          filter: "blur(28px)",
          animation: "glow-drift 9s ease-in-out infinite",
          willChange: "transform, opacity",
        }}
      />
      <div
        className="absolute right-[-10%] bottom-[6%] h-[62%] w-[46%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(53,214,240,.26) 0%, rgba(53,214,240,0) 70%)",
          filter: "blur(32px)",
          animation: "glow-drift 12.5s ease-in-out -4s infinite",
          willChange: "transform, opacity",
        }}
      />
    </div>
  );
}

/* ── Lớp 3 · Orange light trail ──────────────────────────────────────────
   Chạy ở dải 72–84% chiều cao: dưới vùng headline của KV, trên vùng chữ của
   hệ thống. Không che nội dung ở bất kỳ state nào. */

export function OrangeLightTrail() {
  const trails = [
    { top: "74%", w: "26%", h: "2px", dur: "7.5s", delay: "0s", o: 0.75 },
    { top: "80%", w: "16%", h: "1px", dur: "9.5s", delay: "-3.2s", o: 0.5 },
    { top: "69%", w: "10%", h: "1px", dur: "11s", delay: "-6.4s", o: 0.32 },
  ];
  return (
    <div aria-hidden data-motion-decorative="true" className="motion-layer">
      {trails.map((t, i) => (
        <div
          key={i}
          className="absolute left-0"
          style={{
            top: t.top,
            width: t.w,
            height: t.h,
            opacity: t.o,
            background:
              "linear-gradient(90deg, rgba(255,127,50,0) 0%, rgba(255,167,107,.95) 55%, rgba(255,127,50,0) 100%)",
            boxShadow: "0 0 14px rgba(255,127,50,.55)",
            animation: `trail-run ${t.dur} linear ${t.delay} infinite`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}

/* ── Lớp 4 · Particles ───────────────────────────────────────────────────
   18 div, mỗi div một animation CSS chạy trên compositor. Không canvas, không
   requestAnimationFrame, nên không có timer để rò và không có gì phải dọn khi
   unmount. Với 18 node thì DOM rẻ hơn hẳn một vòng lặp rAF tự viết. */

export function AmbientParticleLayer({ count = PARTICLE_COUNT }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Dàn đều theo chiều ngang bằng số nguyên tố để không thành hàng lối.
        const left = ((i * 37) % 100) + (i % 3);
        const size = i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5;
        return {
          left: `${left}%`,
          bottom: `${(i * 13) % 46}%`,
          size,
          driftX: `${((i % 7) - 3) * 8}px`,
          duration: `${11 + (i % 6) * 2.4}s`,
          delay: `-${(i * 1.7) % 14}s`,
          cyan: i % 4 === 0,
        };
      }),
    [count],
  );

  return (
    <div aria-hidden data-motion-decorative="true" className="motion-layer">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute block rounded-[1px]"
          style={
            {
              left: p.left,
              bottom: p.bottom,
              width: p.size,
              height: p.size,
              background: p.cyan ? "#35d6f0" : "#7fb2ff",
              boxShadow: `0 0 ${p.size * 3}px ${p.cyan ? "rgba(53,214,240,.8)" : "rgba(127,178,255,.7)"}`,
              "--drift-x": p.driftX,
              animation: `particle-rise ${p.duration} linear ${p.delay} infinite`,
              willChange: "transform, opacity",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ── Lớp 5 · Digital square field ───────────────────────────────────────── */

export function DigitalSquareField() {
  return (
    <div
      aria-hidden
      data-motion-decorative="true"
      className="motion-layer"
      style={{
        opacity: 0.16,
        backgroundImage:
          "linear-gradient(to right, rgba(53,214,240,.5) 1px, transparent 1px)," +
          "linear-gradient(to bottom, rgba(53,214,240,.5) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,.9) 0%, transparent 78%)",
        animation: "grid-drift 26s linear infinite",
        willChange: "background-position",
      }}
    />
  );
}

/* ── Lớp 7 · Vignette + noise ────────────────────────────────────────────
   Tĩnh hoàn toàn. Có mặt để KV có chiều sâu, không phải để chuyển động. */

function VignetteNoise() {
  return (
    <>
      <div
        aria-hidden
        className="motion-layer"
        style={{
          background:
            "radial-gradient(ellipse 88% 74% at 50% 46%, transparent 42%, rgba(4,9,20,.55) 100%)",
        }}
      />
      <div
        aria-hidden
        className="motion-layer"
        style={{
          opacity: 0.035,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </>
  );
}
