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
 * NGÂN SÁCH CHUYỂN ĐỘNG — đọc trước khi thêm lớp mới
 *
 * Màn này chạy Chrome fullscreen ba tiếng trên máy phát LED, thứ có GPU và bộ
 * nhớ video kém xa máy dev. Nên chỉ còn ĐÚNG MỘT animation chạy liên tục ở
 * kích thước toàn khung: KV drift. Mọi lớp khác đã thành tĩnh hoặc rất nhỏ.
 *
 * Bốn thứ đã bỏ khỏi bản trước, kèm lý do:
 *
 *   · Hai quầng glow `filter: blur(28px)` CÓ animate transform và opacity.
 *     Blur là paint; animate một lớp đã blur ở cỡ nửa màn hình buộc GPU tổng
 *     hợp lại vùng mờ mỗi khung hình. Đây là lớp đắt nhất trong bản cũ. Giờ là
 *     radial-gradient tĩnh — mắt thấy gần như y hệt, chi phí bằng không, vì
 *     gradient đã có biên mềm sẵn nên không cần blur.
 *
 *   · Lưới animate `background-position` → repaint toàn khung mỗi frame. Giờ
 *     tĩnh.
 *
 *   · Lớp noise `feTurbulence` + `mix-blend-mode: overlay` ở opacity 0.035.
 *     Blend mode buộc tách stacking context riêng; và 3.5% hạt trên màn LED
 *     cách người xem 20m thì không ai thấy. Bỏ hẳn.
 *
 *   · 18 particle, mỗi cái `will-change` → 18 texture GPU thường trú. Còn 10,
 *     và không lớp nào tự khai `will-change` nữa; trình duyệt tự promote trong
 *     lúc animation chạy, đó là việc của nó.
 *
 * Năm lớp còn lại, dưới lên trên:
 *   1. KV city      — zoom rất chậm 1 → 1.025, 18s, alternate  ← animation duy nhất cỡ lớn
 *   2. Ambient glow — hai quầng navy/cyan TĨNH
 *   3. Orange trail — hai vệt mảnh chạy ngang dải thấp
 *   4. Particles    — 10 điểm nhỏ trôi lên
 *   5. Fine grid    — TĨNH
 *   6. Overlay      — scrim navy của design system, không đổi
 *   7. Vignette     — TĨNH
 *
 * Lớp 3 và 4 đánh dấu `data-motion-decorative` → biến mất hoàn toàn khi người
 * xem bật reduced motion.
 */

/** Vị trí và nhịp cố định theo index — không random, nên SSR và client dựng ra
 *  cùng một DOM, và không có hydration mismatch. */
const PARTICLE_COUNT = 10;

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
      {/*
        1 · KV city — scale đồng đều, không bao giờ scaleX riêng lẻ.
        Animation liên tục cỡ lớn DUY NHẤT trên màn này.

        Dùng `coverLandscape` (3000×1322 = 2.27:1) chứ KHÔNG phải `kvLandscape`
        (1920×1072 = 1.79:1). Canvas LED là 3008×1088 = 2.765:1, nên:

          · coverLandscape → cover cắt 18% chiều cao
          · kvLandscape    → cover cắt 35% chiều cao

        Ở mức cắt 35%, hai góc trên của artwork mất — đúng chỗ logo Ahamove và
        badge 11 năm được in sẵn. Với 18% thì phần branding ở giữa ảnh còn nguyên.
        Không bao giờ dùng `fit: contain` ở đây: nó để lại hai dải navy hai bên
        giữa lòng canvas, trông như ảnh bị đặt lệch chứ không phải nền sân khấu.
      */}
      <div
        aria-hidden
        className="motion-layer-gpu"
        style={{ animation: "kv-drift 18s ease-in-out infinite alternate" }}
      >
        <CampaignImage
          asset="coverLandscape"
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
          <AmbientGlow />
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

/* ── Lớp 2 · Ambient glow — TĨNH ─────────────────────────────────────────
   Một lớp, hai gradient, không animation và không `filter: blur`.

   `radial-gradient` với điểm dừng cuối ở alpha 0 đã cho biên mềm hoàn toàn, nên
   `blur()` chỉ làm mềm thêm thứ đã mềm — trả bằng một lần paint vùng lớn. Gộp
   hai quầng vào một node để bớt một lớp tổng hợp.

   Không còn `data-motion-decorative`: lớp này đã tĩnh, reduced motion không cần
   ẩn nó, và giữ lại thì màu campaign không biến mất khi bật chế độ đó. */

export function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="motion-layer"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 52% 70% at 4% -8%, rgba(30,107,255,.30) 0%, rgba(30,107,255,0) 66%)," +
          "radial-gradient(ellipse 46% 62% at 104% 88%, rgba(53,214,240,.22) 0%, rgba(53,214,240,0) 68%)",
      }}
    />
  );
}

/* ── Lớp 3 · Orange light trail ──────────────────────────────────────────
   Chạy ở dải 72–84% chiều cao: dưới vùng headline của KV, trên vùng chữ của
   hệ thống. Không che nội dung ở bất kỳ state nào. */

export function OrangeLightTrail() {
  // Hai vệt, không ba. Vệt thứ ba ở opacity 0.32 và cao 1px nằm lẫn trong KV,
  // không ai phân biệt được — nhưng vẫn là một lớp tổng hợp phải chạy suốt.
  const trails = [
    { top: "74%", w: "26%", h: "2px", dur: "7.5s", delay: "0s", o: 0.75 },
    { top: "80%", w: "16%", h: "1px", dur: "9.5s", delay: "-3.2s", o: 0.5 },
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
            // Quầng sáng nằm trong chính gradient thay vì box-shadow: cùng một
            // vẻ, nhưng không có vùng shadow phải paint ngoài khung phần tử.
            background:
              "linear-gradient(90deg, rgba(255,127,50,0) 0%, rgba(255,167,107,.95) 55%, rgba(255,127,50,0) 100%)",
            animation: `trail-run ${t.dur} linear ${t.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Lớp 4 · Particles ───────────────────────────────────────────────────
   10 div, mỗi div một animation CSS chạy trên compositor. Không canvas, không
   requestAnimationFrame, nên không có timer để rò và không có gì phải dọn khi
   unmount.

   Bản trước có 18 hạt, mỗi hạt tự khai `will-change: transform, opacity` —
   nghĩa là 18 texture GPU giữ thường trú cho 18 điểm sáng rộng 1.5–3px. Trên
   màn LED xa 20m thì tám hạt bớt đi không ai nhận ra; bộ nhớ video thì có. */

export function AmbientParticleLayer({ count = PARTICLE_COUNT }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Dàn đều theo chiều ngang bằng số nguyên tố để không thành hàng lối.
        const left = ((i * 37) % 100) + (i % 3);
        const size = i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5;
        const cyan = i % 4 === 0;
        return {
          left: `${left}%`,
          bottom: `${(i * 13) % 46}%`,
          size,
          driftX: `${((i % 7) - 3) * 8}px`,
          duration: `${11 + (i % 6) * 2.4}s`,
          delay: `-${(i * 1.7) % 14}s`,
          cyan,
        };
      }),
    [count],
  );

  return (
    <div aria-hidden data-motion-decorative="true" className="motion-layer">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute block"
          style={
            {
              left: p.left,
              bottom: p.bottom,
              // Hạt to hơn một chút và dùng radial-gradient thay cho
              // màu đặc + box-shadow: quầng sáng nằm trong nền của chính phần
              // tử, không phải một vùng shadow riêng phải paint quanh nó.
              width: p.size * 4,
              height: p.size * 4,
              background: p.cyan
                ? "radial-gradient(circle, rgba(53,214,240,.95) 0%, rgba(53,214,240,0) 62%)"
                : "radial-gradient(circle, rgba(127,178,255,.9) 0%, rgba(127,178,255,0) 62%)",
              "--drift-x": p.driftX,
              animation: `particle-rise ${p.duration} linear ${p.delay} infinite`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ── Lớp 5 · Digital square field ───────────────────────────────────────── */

/* Lưới TĨNH. Xem ghi chú `grid-drift` trong motion.css về lý do bỏ animation. */

export function DigitalSquareField() {
  return (
    <div
      aria-hidden
      className="motion-layer"
      style={{
        opacity: 0.16,
        backgroundImage:
          "linear-gradient(to right, rgba(53,214,240,.5) 1px, transparent 1px)," +
          "linear-gradient(to bottom, rgba(53,214,240,.5) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(0,0,0,.9) 0%, transparent 78%)",
      }}
    />
  );
}

/* ── Lớp 7 · Vignette ────────────────────────────────────────────────────
   Một gradient tĩnh. Có mặt để KV có chiều sâu, không phải để chuyển động.

   Lớp noise `feTurbulence` + `mix-blend-mode: overlay` đã bị bỏ: blend mode
   buộc trình duyệt tách stacking context và tổng hợp lại toàn khung, để đổi lấy
   3.5% hạt mà ở khoảng cách xem trong hội trường thì không ai thấy. */

function VignetteNoise() {
  return (
    <div
      aria-hidden
      className="motion-layer"
      style={{
        background:
          "radial-gradient(ellipse 88% 74% at 50% 46%, transparent 42%, rgba(4,9,20,.55) 100%)",
      }}
    />
  );
}
