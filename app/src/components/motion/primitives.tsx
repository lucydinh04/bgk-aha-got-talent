"use client";

import { useState, type ReactNode } from "react";

import { useMotion } from "./MotionRoot";

/* ═══════════════════════════════════════════════════════════════════════════
   LEDStateTransition — chuyển cảnh giữa hai state LED.

   Nội dung nằm trong một ô grid duy nhất nên đổi state không gây layout shift,
   và fade vào trên nền KV luôn hiện — không có frame trắng. Chi tiết vì sao
   không giữ lớp "outgoing" nằm trong thân hàm.
   ═══════════════════════════════════════════════════════════════════════════ */

const TRANSITION_MS = 420;

export function LEDStateTransition({
  stateKey,
  children,
  /** Emergency Hide cần tức thì: bỏ qua fade, đổi thẳng. */
  instant = false,
}: {
  stateKey: string;
  children: ReactNode;
  instant?: boolean;
}) {
  const { reducedMotion } = useMotion();
  const skip = instant || reducedMotion;

  /*
    Chỉ một lớp nội dung, `key` theo state.

    Bản đầu giữ thêm một lớp "outgoing" để crossfade thật, nhưng nó phải nhét
    ReactNode vào state rồi đồng bộ bằng effect — sinh ra cascading render và
    một setTimeout phải tự dọn. Với một màn hình chạy ba tiếng không ai trông,
    đó là hai nguồn hỏng đổi lấy 400ms hiệu ứng.

    Không cần lớp đó: nền KV nằm NGOÀI component này và không bao giờ tắt, nên
    khoảnh khắc giữa hai state là KV chứ không phải màn trắng. Nội dung mới fade
    vào trên nền đang chuyển động — đọc ra vẫn là một cú chuyển cảnh liền mạch.

    `key` đổi → React thay cả cây con → mọi `anim-enter-*` bên trong chạy lại từ
    đầu, đúng thứ ta muốn khi sang state mới. Cùng một state mà chỉ dữ liệu đổi
    (2/5 → 3/5) thì `key` không đổi, không có gì chạy lại, màn hình không chớp.
  */
  return (
    <div className="grid h-full min-h-0 w-full flex-1 [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:h-full [&>*]:min-h-0">
      <div
        key={stateKey}
        style={
          skip
            ? undefined
            : { animation: `enter-fade ${TRANSITION_MS}ms ease-out both` }
        }
      >
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AnimatedProgress — thanh tiến độ chạy từ giá trị cũ sang giá trị mới.

   Dùng `transition` trên `transform: scaleX`, không phải `width`: scaleX chạy
   trên compositor, width thì bắt trình duyệt layout lại mỗi frame.
   ═══════════════════════════════════════════════════════════════════════════ */

export function AnimatedProgress({
  value,
  tone = "cyan",
  className = "",
  label,
}: {
  /** 0–100 */
  value: number;
  tone?: "cyan" | "orange" | "ok";
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const colors = {
    cyan: "linear-gradient(90deg, #1e6bff 0%, #35d6f0 100%)",
    orange: "linear-gradient(90deg, #f25c05 0%, #ffa76b 100%)",
    ok: "linear-gradient(90deg, #16a374 0%, #34d399 100%)",
  } as const;
  const glow = {
    cyan: "0 0 18px rgba(53,214,240,.55)",
    orange: "0 0 18px rgba(255,127,50,.55)",
    ok: "0 0 18px rgba(52,211,153,.5)",
  } as const;

  return (
    <div
      className={`overflow-hidden rounded-full bg-[rgba(146,170,200,.22)] ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full w-full origin-left"
        style={{
          background: colors[tone],
          boxShadow: glow[tone],
          transform: `scaleX(${clamped / 100})`,
          transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AnimatedCounter — số đổi bằng crossfade ngắn, không đếm từng đơn vị.

   Đếm dần từ 2 lên 3 trông như hệ thống đang do dự. Với một con số mang nghĩa
   "đã có thêm một BGK gửi điểm", crossfade dứt khoát là cách đọc đúng.
   ═══════════════════════════════════════════════════════════════════════════ */

export function AnimatedCounter({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className={`relative inline-block tnum ${className}`}>
      <span
        key={value}
        className="inline-block"
        style={{ animation: "digit-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
      >
        {value}
      </span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CheckReveal — dấu check được VẼ ra bằng stroke-dashoffset.
   ═══════════════════════════════════════════════════════════════════════════ */

export function CheckReveal({
  size = "5cqw",
  delay = 0,
}: {
  size?: string;
  delay?: number;
}) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      {/* Vòng năng lượng lan ra một lần rồi tắt hẳn */}
      <span
        aria-hidden
        data-motion-decorative="true"
        className="absolute inset-0 rounded-full border-2 border-[#34d399]"
        style={{ animation: `ring-complete 1.1s ease-out ${delay + 120}ms both` }}
      />
      <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden>
        <circle
          cx="24"
          cy="24"
          r="21"
          fill="none"
          stroke="#34d399"
          strokeWidth="2.5"
          strokeDasharray="132"
          style={
            {
              "--check-len": "132",
              animation: `draw-check 620ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
            } as React.CSSProperties
          }
        />
        <path
          d="M14 24.5 L21 31.5 L34 17.5"
          fill="none"
          stroke="#34d399"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="34"
          style={
            {
              "--check-len": "34",
              animation: `draw-check 380ms cubic-bezier(0.22,1,0.36,1) ${delay + 380}ms both`,
            } as React.CSSProperties
          }
        />
      </svg>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EnergyPulse — một nhịp năng lượng khi có BGK vừa gửi điểm.

   Chạy đúng một lần cho mỗi lần `trigger` đổi, rồi tự gỡ khỏi DOM. Không loop,
   không timer chồng nhau: `key` đổi thì React thay node mới, animation chạy
   một lượt, hết.
   ═══════════════════════════════════════════════════════════════════════════ */

export function EnergyPulse({ trigger }: { trigger: number | string }) {
  /*
    Điều chỉnh state ngay trong render khi prop đổi — cách React khuyến nghị
    cho "state dẫn xuất từ prop". Không dùng effect: effect chạy sau khi paint,
    nên nhịp sáng sẽ trễ một khung hình so với con số vừa nhảy.
  */
  const [seen, setSeen] = useState(trigger);
  const [pulseId, setPulseId] = useState(0);

  if (seen !== trigger) {
    setSeen(trigger);
    setPulseId((n) => n + 1);
  }

  // Không pulse ở lần render đầu — mở màn LED giữa chương trình không phải là
  // "vừa có người gửi điểm".
  if (pulseId === 0) return null;

  return (
    <span
      key={pulseId}
      aria-hidden
      data-motion-decorative="true"
      className="motion-layer"
    >
      <span
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 70%, rgba(53,214,240,.34) 0%, transparent 70%)",
          animation: "energy-flash 900ms ease-out both",
        }}
      />
      <span
        className="absolute bottom-[18%] left-1/2 h-[18cqw] w-[18cqw] -translate-x-1/2 rounded-full border border-[#35d6f0]"
        style={{ animation: "energy-ring 900ms cubic-bezier(0.22,1,0.36,1) both" }}
      />
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MotionSafeQR — khung QR không bao giờ bị animate.

   Panel tối đặc phía sau, không blur, không rotate, không scale lặp, không
   particle đè lên. Chỉ fade in một lần khi xuất hiện rồi đứng yên tuyệt đối.
   Một mã QR nhấp nháy là một mã QR không quét được.
   ═══════════════════════════════════════════════════════════════════════════ */

export function MotionSafeQR({
  children,
  caption,
  size = "22cqw",
}: {
  children?: ReactNode;
  caption?: string;
  size?: string;
}) {
  return (
    <div
      className="anim-enter-pop flex flex-col items-center gap-[1cqw] rounded-[1.2cqw] bg-white p-[1.4cqw]"
      style={{
        // Không box-shadow động, không filter — GPU không phải vẽ lại khung này.
        boxShadow: "0 0 0 0.5cqw rgba(4,9,20,.92), 0 1.6cqw 4cqw rgba(4,9,20,.7)",
      }}
    >
      <div
        className="grid place-items-center bg-white"
        style={{ width: size, height: size }}
      >
        {children ?? <QRPlaceholder />}
      </div>
      {caption ? (
        <span className="tnum font-mono text-[1.1cqw] tracking-[0.08em] text-[#060d1e]">
          {caption}
        </span>
      ) : null}
    </div>
  );
}

function QRPlaceholder() {
  return (
    <span className="font-mono text-[0.9cqw] tracking-[0.2em] text-[#5e7a9c] uppercase">
      QR
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Stagger — bọc danh sách để các phần tử vào lần lượt.
   ═══════════════════════════════════════════════════════════════════════════ */

export function stagger(index: number, step = 70, base = 0): React.CSSProperties {
  return { animationDelay: `${base + index * step}ms` };
}
