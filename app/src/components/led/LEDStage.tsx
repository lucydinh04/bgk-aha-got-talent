"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { AnniversaryBadge, CampaignLogo } from "@/components/campaign";
import { AnimatedCampaignBackground } from "@/components/motion/AnimatedCampaignBackground";
import {
  AnimatedCounter,
  AnimatedProgress,
  CheckReveal,
  EnergyPulse,
  stagger,
} from "@/components/motion/primitives";
import type { LocationCode, Performance } from "@/lib/data";
import { EVENT_DATE, orderLabel, teamLabel } from "@/lib/data";

export type LEDMode =
  // chế độ A · theo dõi tiến độ — KHÔNG BAO GIỜ có điểm
  | "standby"
  | "interlude"
  | "performance"
  | "judging_progress"
  | "performance_waiting"
  | "performance_completed"
  | "all_performances_status"
  | "all_scores_completed"
  // bình chọn khán giả
  | "audience_vote_intro"
  | "audience_vote_qr"
  | "audience_vote_live"
  | "audience_vote_closed"
  | "audience_vote_verification"
  | "audience_vote_ready"
  // chế độ B · công bố giải
  | "awards_intro"
  | "award_reveal"
  | "scorecard"
  | "audience_award_shuffle"
  | "audience_award_reveal"
  | "audience_award_result"
  | "audience_award_celebration"
  | "grand_prize"
  | "awards_summary"
  | "full_ranking"
  | "emergency_hide";

/** Canvas LED vật lý. Một nguồn duy nhất — dùng cho aspect-ratio và frame preview. */
export const LED_CANVAS = { width: 3008, height: 1088 } as const;

/**
 * Khung màn LED — canvas 3008 × 1088, tỉ lệ 2.765:1.
 *
 * TỈ LỆ
 *
 * `aspect-ratio: 3008 / 1088` khai báo tường minh thay vì `aspect-video`. Khung
 * lấy trọn bề rộng viewport rồi canh giữa theo chiều dọc; phần dư trên và dưới
 * là gradient navy campaign, không phải đen tuyệt đối.
 *
 * `@container` đặt trên chính khung này, nên 1cqw = 1% bề rộng canvas = 30.08px
 * ở 3008. Mọi cỡ chữ và khoảng cách trong file này là cqw, nên bố cục ở
 * 1920×695 và ở 3008×1088 giống nhau tuyệt đối, chỉ khác số pixel.
 *
 * BỐ CỤC NGANG, KHÔNG PHẢI XẾP DỌC
 *
 * Đây là thay đổi lớn nhất so với bản 16:9. Canvas cao 1088 nhưng rộng 3008;
 * sau safe zone chỉ còn 944px chiều cao — chỗ cho khoảng ba đến bốn dòng chữ,
 * không hơn. Xếp dọc năm phần tử như khung 16:9 sẽ trào ra ngoài.
 *
 * Nên nội dung dàn theo chiều NGANG, đúng cách một graphic phát sóng dùng khung
 * ultra-wide: nhãn và số nằm cạnh headline chứ không nằm dưới.
 *
 * BA DẢI DỌC
 *
 *   · dải trái  15% (451px) — không khí, nhãn phụ, light trail
 *   · lõi giữa  70% (2106px) — toàn bộ chữ quan trọng
 *   · dải phải  15% (451px) — không khí, chỉ báo trạng thái, QR
 *
 * Hai dải mép tồn tại vì một lý do vật lý: mép ngoài của tường LED là chỗ dễ bị
 * khung nhôm ăn vào, bị lệch màu giữa các tấm panel, và là chỗ khán giả ngồi
 * chéo góc nhìn thấy méo nhất. Chữ quan trọng không đặt ở đó.
 */
export function LEDStage({
  quiet = true,
  bare = false,
  anchor = "bottom",
  fill = false,
  children,
}: {
  quiet?: boolean;
  /** Emergency Hide: tắt mọi lớp trang trí, chỉ còn KV. */
  bare?: boolean;
  /** `center` bật scrim giữa khung cho các màn công bố. */
  anchor?: "bottom" | "center";
  /**
   * `true` khi khung nằm trong một hộp đã có kích thước cố định — dùng bởi frame
   * preview 3008×1088 ở development. Mặc định khung tự canh giữa viewport.
   */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex w-full items-center justify-center overflow-hidden ${
        fill ? "h-full" : "min-h-dvh"
      }`}
      style={{
        // Phần dư trên/dưới khung ultra-wide. Navy campaign, không phải đen:
        // trên tường LED một dải đen tuyệt đối đọc ra là panel chết.
        background:
          "radial-gradient(ellipse 80% 120% at 50% 50%, #0a1730 0%, #060d1e 55%, #040914 100%)",
      }}
    >
      <div
        className="@container relative isolate w-full max-w-full overflow-hidden"
        style={{
          aspectRatio: `${LED_CANVAS.width} / ${LED_CANVAS.height}`,
          /*
            Trần chiều cao giữ khung không tràn ra ngoài màn: trên viewport 16:9
            khung letterbox trên/dưới thay vì bị cắt hai bên.

            Trong frame preview thì trần phải là 100% của hộp 3008×1088 tổng hợp,
            KHÔNG phải `100dvh`. Viewport thật lúc đó chỉ vài trăm pixel, nên
            `100dvh` bóp canvas xuống còn tỉ lệ 5.4:1 và mọi thứ tính theo chiều
            cao đều sai.
          */
          maxHeight: fill ? "100%" : "100dvh",
        }}
      >
        <AnimatedCampaignBackground quiet={quiet} bare={bare} anchor={anchor} />
        {/* Branding đặt ở LEDStage chứ không ở StageGrid: các màn bình chọn và
            công bố giải dựng layout riêng trong reveal.tsx và không đi qua
            StageGrid, nên nếu để logo ở đó thì đúng những màn khán giả nhìn lâu
            nhất lại là những màn không có logo. */}
        {!bare ? <LEDBrand /> : null}
        <div className="led-safe relative z-10 flex h-full w-full flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Chế độ xem khung thật — CHỈ development.
 *
 * Dựng canvas ở đúng 3008 × 1088 CSS pixel rồi thu nhỏ bằng `transform: scale`
 * để lọt viewport. Khác hẳn việc mở `/live` ở cửa sổ nhỏ: ở đây mọi cỡ chữ là px
 * THẬT của canvas, nên đo trực tiếp bằng devtools và kiểm được luật "không chữ
 * nào dưới 30px".
 *
 * VÌ SAO PHẢI TÍNH BẰNG JS
 *
 * Bản đầu thử thuần CSS: `transform: scale(min((100dvw - 4rem) / 3008, …))`.
 * Không chạy. `scale()` cần một số KHÔNG đơn vị, còn `length / number` trong CSS
 * cho ra một length — và CSS không có phép chia length cho length để ra tỉ lệ.
 * Nên hệ số phải do JS tính.
 *
 * Đây là component chỉ tồn tại ở development và không nằm trên đường đi của màn
 * LED thật, nên một resize listener ở đây không ảnh hưởng gì tới đêm diễn.
 * Render đầu dùng scale 1 để server và client ra cùng một DOM; `useLayoutEffect`
 * sửa lại trước khi trình duyệt paint, nên không thấy nhảy.
 */
export function LEDFramePreview({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const fit = () =>
      setScale(
        Math.min(
          (window.innerWidth - 64) / LED_CANVAS.width,
          (window.innerHeight - 112) / LED_CANVAS.height,
// Không phóng to quá 1: xem khung ở 150% không nói lên điều gì về màn thật.
          1,
        ),
      );
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className="bg-ink flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      {/* Hộp bọc lấy kích thước ĐÃ nhân hệ số: `transform` không thu nhỏ ô layout
          mà phần tử chiếm, nên thiếu lớp này thì trang sinh scrollbar. */}
      <div
        style={{
          width: LED_CANVAS.width * scale,
          height: LED_CANVAS.height * scale,
          outline: "1px solid rgba(53,214,240,.45)",
          outlineOffset: "8px",
        }}
      >
        <div
          style={{
            width: LED_CANVAS.width,
            height: LED_CANVAS.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
      <p className="text-silver-dim font-mono text-xs tracking-[0.2em] uppercase">
        Khung LED thật · {LED_CANVAS.width} × {LED_CANVAS.height} px · tỉ lệ{" "}
        {(LED_CANVAS.width / LED_CANVAS.height).toFixed(3)}:1 · safe zone 120 × 72 ·
        thu nhỏ {(scale * 100).toFixed(1)}%
      </p>
    </div>
  );
}

/**
 * Logo Ahamove góc trên-trái, badge 11 năm góc trên-phải.
 *
 * Nền `kvLedUltrawide` KHÔNG in sẵn branding — chữ "AHAMOVE" trên tháp đồng hồ
 * là chi tiết vẽ trong tranh, không phải wordmark. Nên màn phải tự đặt asset
 * chính thức vào.
 *
 * Định vị tuyệt đối theo đúng safe zone. Containing block của phần tử absolute
 * là PADDING BOX của cha, mà cha ở đây phủ trọn canvas — nên `top: 0` sẽ nằm
 * sát mép tường. Phải đặt thẳng bằng `--led-safe-*` thì logo mới thật sự nằm
 * trong vùng an toàn 120 × 72.
 *
 * `drop-shadow` chứ không phải một tấm nền phía sau: wordmark màu trắng, và nền
 * neon có những mảng sáng đủ để nuốt nó. Bóng đổ tách được chữ khỏi nền mà không
 * phải thêm một cái hộp trông như thành phần giao diện web.
 */
function LEDBrand() {
  return (
    <div
      className="pointer-events-none absolute z-20 flex items-start justify-between"
      style={{
        top: "var(--led-safe-y)",
        left: "var(--led-safe-x)",
        right: "var(--led-safe-x)",
      }}
    >
      <CampaignLogo
        width="13cqw"
        priority
        className="drop-shadow-[0_0.15cqw_0.6cqw_rgba(4,9,20,0.98)]"
      />
      <AnniversaryBadge
        width="7cqw"
        priority
        className="drop-shadow-[0_0.15cqw_0.6cqw_rgba(4,9,20,0.9)]"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRIMITIVE BỐ CỤC ULTRA-WIDE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Khung ba dải. `left` và `right` là nhãn phụ ở hai dải mép; `children` là lõi
 * giữa 70% chứa chữ quan trọng.
 *
 * Hai dải mép canh theo trục dọc khác nhau có chủ ý: trái canh trên, phải canh
 * dưới. Đối xứng hoàn toàn trên khung 2.765:1 trông như một bảng biểu; lệch trục
 * cho ra nhịp của một graphic phát sóng.
 */
function StageGrid({
  left,
  right,
  children,
}: {
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-end">
      {/*
        Dải nội dung dưới — lower third của một graphic phát sóng.

        Vì sao xuống đáy chứ không canh giữa như bản trước: nền mới có sân khấu
        và số 11 rực nhất ở CHÍNH GIỮA khung. Đặt chữ ở đó thì phải phủ scrim đủ
        đậm để che mất đúng phần đẹp nhất của tranh. Dải sàn phản chiếu phía dưới
        vừa tối hơn vừa ít chi tiết, nên chữ đọc được mà sân khấu vẫn nguyên.
      */}
      <div className="grid w-full shrink-0 grid-cols-[15%_70%_15%] items-end">
        <div className="flex flex-col pr-[2cqw]">{left}</div>
        <div className="flex min-w-0 flex-col">{children}</div>
        <div className="flex flex-col items-end pl-[2cqw] text-right">{right}</div>
      </div>
    </div>
  );
}

/** Nhãn dọc ở dải mép — cỡ meta, mono, giãn chữ, màu nguội. */
function RailLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-led-meta font-mono tracking-[0.22em] text-[#A9BDD4] uppercase ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Vạch light trail trang trí ở dải mép. Thuần trang trí, `transform` only.
 * Đây là thứ lấp hai dải 451px mà không đặt chữ quan trọng vào đó.
 */
function RailTrail({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      data-motion-decorative="true"
      className="mt-[1.2cqw] block h-[0.18cqw] w-full overflow-hidden rounded-full bg-[rgba(53,214,240,.16)]"
    >
      <span
        className="block h-full w-[42%]"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(53,214,240,.9), transparent)",
          animation: `scan-line ${side === "left" ? "5.5s" : "7s"} ease-in-out ${
            side === "left" ? "0s" : "-2.4s"
          } infinite`,
        }}
      />
    </span>
  );
}

function Eyebrow({
  tone = "cyan",
  children,
  className = "",
  style,
}: {
  tone?: "cyan" | "brand" | "warn" | "ok";
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const color = {
    cyan: "text-[#3ED8F0]",
    brand: "text-[#FF9152]",
    warn: "text-[#FBBF24]",
    ok: "text-[#34D399]",
  }[tone];
  return (
    <span
      className={`text-led-meta flex items-center gap-[0.8cqw] font-mono tracking-[0.24em] uppercase ${color} ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}

function Headline({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <h1
      // Bóng tối hẹp, không glow rộng: trên panel LED một vệt glow lớn biến chữ
      // thành khối mờ. Việc cần là tách chữ khỏi KV, không phải phát sáng.
      className={`display text-led-display text-[#F7FAFF] [text-shadow:0_0.1cqw_0.7cqw_rgba(4,9,20,.95)] ${className}`}
      style={style}
    >
      {children}
    </h1>
  );
}

function Support({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <p className={`text-led-body text-[#B8C9DE] ${className}`} style={style}>
      {children}
    </p>
  );
}

/**
 * Dải dữ liệu cho state nhiều dòng: bảng trạng thái, tổng kết giải, xếp hạng.
 *
 * Không phải card kính. `backdrop-filter` buộc trình duyệt đọc lại pixel nền mỗi
 * khung hình, mà nền LED luôn chuyển động — một card kính ở đây là một lần blur
 * toàn vùng, 60 lần mỗi giây, ba tiếng liền. Và một hộp bo góc viền sáng đọc ra
 * là thành phần giao diện web, không phải graphic phát sóng.
 *
 * Trên canvas ultra-wide dải này chiếm trọn lõi 70%, dùng hai cột khi số dòng
 * vượt bốn — chiều cao khả dụng chỉ 944px, không đủ cho tám dòng xếp dọc ở cỡ
 * `led-row`.
 */
function DataBand({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="led-band w-full py-[1.4cqw] pr-[2cqw] pl-[1.6cqw]">
      <span className="text-led-meta mb-[1cqw] block font-mono tracking-[0.26em] text-[#3ED8F0] uppercase">
        {title}
      </span>
      {children}
    </div>
  );
}

/** Loader futuristic: một vệt quét chạy trong rãnh hẹp. Không spinner tròn. */
function ScanLoader({ tone = "#3ED8F0" }: { tone?: string }) {
  return (
    <span
      aria-hidden
      data-motion-decorative="true"
      className="inline-block h-[0.22cqw] w-[3cqw] shrink-0 overflow-hidden rounded-full bg-[rgba(146,170,200,.25)]"
    >
      <span
        className="block h-full w-[40%]"
        style={{
          background: `linear-gradient(90deg, transparent, ${tone}, transparent)`,
          animation: "scan-line 1.8s ease-in-out infinite",
        }}
      />
    </span>
  );
}

/* ═══ Chế độ A · theo dõi tiến độ ══════════════════════════════════════════ */

/** Màn chờ. Dải trái giữ đầu cầu + ngày, lõi giữa giữ tagline. */
export function LEDStandby({ location }: { location: LocationCode }) {
  return (
    <StageGrid
      left={
        <>
          <RailLabel>{location}</RailLabel>
          <RailLabel className="mt-[0.5cqw] text-[#3ED8F0]">
            {EVENT_DATE[location]}
          </RailLabel>
          <RailTrail side="left" />
        </>
      }
      right={
        <>
          <RailLabel>Aha Got Talent 2026</RailLabel>
          <RailTrail side="right" />
        </>
      }
    >
      {/* KV đã in sẵn logo Ahamove, badge 11 năm và headline — không lặp lại */}
      <div className="flex flex-col items-center text-center">
        <Eyebrow
          tone="cyan"
          className="anim-enter-up justify-center"
          style={stagger(0, 0, 140)}
        >
          Sinh nhật Ahamove 11 tuổi
        </Eyebrow>

        {/* Light sweep chạy qua tagline. `overflow-hidden` giữ vệt sáng trong khung
            chữ; chữ nằm ở z cao hơn nên không bao giờ bị vệt che.

            Đây là animation lặp duy nhất của standby, và standby là state chạy lâu
            nhất trong đêm — trước giờ mở màn có thể bốn mươi phút. */}
        <span
          className="anim-enter-up relative mt-[1cqw] inline-block overflow-hidden"
          style={stagger(0, 0, 300)}
        >
          <span className="display text-led-display relative z-10 tracking-[0.04em] text-[#FF9152] [text-shadow:0_0.1cqw_0.8cqw_rgba(4,9,20,.95)]">
            Unlock Your Next Move
          </span>
          <span
            aria-hidden
            data-motion-decorative="true"
            className="absolute inset-y-0 left-0 z-20 w-[18%]"
            style={{
              background:
                "linear-gradient(100deg, transparent 0%, rgba(255,255,255,.42) 50%, transparent 100%)",
              animation: "light-sweep 6.5s ease-in-out 1.4s infinite",
            }}
          />
        </span>
      </div>
    </StageGrid>
  );
}

export function LEDInterlude({
  next,
  prepMinutes,
}: {
  next: Performance;
  prepMinutes?: number;
}) {
  return (
    <StageGrid
      left={
        <>
          <RailLabel>Tiếp theo</RailLabel>
          <RailTrail side="left" />
        </>
      }
      right={
        prepMinutes ? (
          <>
            <RailLabel>Chuẩn bị</RailLabel>
            <span className="display tnum text-led-title mt-[0.3cqw] text-[#FF9152]">
              {prepMinutes}
              <span className="text-led-body ml-[0.5cqw]">phút</span>
            </span>
          </>
        ) : null
      }
    >
      {/* Số thứ tự nằm CẠNH tên, không nằm trên: khung ultra-wide có bề ngang để
          làm việc đó, và một dòng đọc nhanh hơn hai dòng. */}
      <div className="flex items-baseline gap-[1.6cqw]">
        <span
          className="anim-enter-left display tnum text-led-hero shrink-0 leading-none text-[#FF9152]"
          style={stagger(0, 0, 120)}
        >
          {orderLabel(next)}
        </span>
        <div className="min-w-0">
          <Eyebrow tone="cyan" className="anim-enter-left" style={stagger(0, 0, 60)}>
            Tiết mục tiếp theo
          </Eyebrow>
          <Headline
            className="anim-enter-left mt-[0.4cqw]"
            style={stagger(0, 0, 200)}
          >
            {next.performanceName}
          </Headline>
          <Support
            className="anim-enter-up mt-[0.5cqw] font-mono tracking-[0.1em] uppercase"
            style={stagger(0, 0, 380)}
          >
            {[next.performanceType, teamLabel(next)].filter(Boolean).join(" · ")}
          </Support>
        </div>
      </div>
    </StageGrid>
  );
}

/**
 * Tiết mục đang diễn. Chuỗi vào ~760ms, trong khoảng 600–900ms của brief.
 */
export function LEDPerformance({ performance }: { performance: Performance }) {
  return (
    <StageGrid
      left={
        <>
          <RailLabel className="text-[#FF9152]">Đang biểu diễn</RailLabel>
          <RailTrail side="left" />
        </>
      }
      right={
        <>
          <RailLabel>{performance.department || "Aha Got Talent"}</RailLabel>
          <RailTrail side="right" />
        </>
      }
    >
      <div className="flex items-baseline gap-[1.6cqw]">
        <span
          className="anim-enter-left display tnum text-led-hero shrink-0 leading-none text-[#FF9152]"
          style={stagger(0, 0, 120)}
        >
          {orderLabel(performance)}
        </span>
        <div className="min-w-0">
          <Eyebrow
            tone="brand"
            className="anim-enter-left"
            style={stagger(0, 0, 60)}
          >
            <span
              aria-hidden
              data-motion-decorative="true"
              className="inline-block size-[0.7cqw] shrink-0 rounded-full bg-current"
              style={{ animation: "badge-breathe 2.2s ease-in-out infinite" }}
            />
            Đang biểu diễn
          </Eyebrow>

          {/* Tên tiết mục là thông tin duy nhất khán giả cần lúc này */}
          <Headline
            className="anim-enter-left mt-[0.4cqw]"
            style={stagger(0, 0, 220)}
          >
            {performance.performanceName}
          </Headline>

          <Support
            className="anim-enter-up mt-[0.5cqw] font-mono tracking-[0.1em] uppercase"
            style={stagger(0, 0, 420)}
          >
            {[performance.performanceType, teamLabel(performance)]
              .filter(Boolean)
              .join(" · ")}
          </Support>
        </div>
      </div>
    </StageGrid>
  );
}

/**
 * Chấm điểm trực tiếp — state chạy lâu nhất trong đêm.
 *
 * Bố cục ngang: con số tiến độ nằm bên phải tên tiết mục, không nằm dưới. Trên
 * canvas 944px chiều cao khả dụng, xếp dọc bốn phần tử ở thang chữ này sẽ trào.
 */
export function LEDJudging({
  performance,
  done,
  total,
}: {
  performance: Performance;
  done: number;
  total: number;
}) {
  const pct = total ? (done / total) * 100 : 0;
  const complete = done >= total && total > 0;
  return (
    <div className="relative h-full">
      {/* Mỗi lần `done` tăng: một nhịp năng lượng chạy đúng một lần rồi tắt. */}
      <EnergyPulse trigger={done} />

      <StageGrid
        left={
          <>
            <RailLabel className="text-[#3ED8F0]">Đang chấm điểm</RailLabel>
            <RailTrail side="left" />
          </>
        }
        right={
          <>
            <RailLabel>Tiết mục {orderLabel(performance)}</RailLabel>
            <RailTrail side="right" />
          </>
        }
      >
        <div className="flex items-center gap-[2.4cqw]">
          {/* Cột chữ */}
          <div className="min-w-0 flex-1">
            <Eyebrow tone="cyan">
              <span
                aria-hidden
                data-motion-decorative="true"
                className="size-[0.8cqw] shrink-0 rounded-full bg-current"
                style={{ animation: "pulse-soft 1.8s ease-in-out infinite" }}
              />
              Ban Giám khảo đang chấm điểm
            </Eyebrow>
            {/* Hai dòng chứ không `truncate`: tên tiết mục thật dài tới 30 ký tự
                ("Mười Một Năm — Một Chặng Đường"), và cắt bằng dấu ba chấm trên
                màn sân khấu đọc ra là hệ thống lỗi, không phải thiết kế. */}
            <p className="display text-led-title mt-[0.4cqw] line-clamp-2 text-[#DCE7F5]">
              {performance.performanceName}
            </p>
            <AnimatedProgress
              value={pct}
              tone={complete ? "ok" : "cyan"}
              className="mt-[1.2cqw] h-[0.6cqw] w-full"
              label={`${done} trên ${total} giám khảo đã gửi điểm`}
            />
          </div>

          {/*
            Con số CHÍNH LÀ nội dung, nên nó được cỡ metric và đứng riêng một cột.
            Chỉ con số đếm — không tên BGK nào chưa chấm, không điểm, không thứ hạng.
          */}
          <div className="shrink-0 text-right">
            <p
              className={`display tnum text-led-metric leading-[0.82] ${
                complete ? "text-[#34D399]" : "text-[#3ED8F0]"
              }`}
            >
              <AnimatedCounter value={done} />
              <span className="text-[#6B819C]">/{total}</span>
            </p>
            <span className="text-led-meta mt-[0.3cqw] block font-mono tracking-[0.2em] text-[#B8C9DE] uppercase">
              BGK đã hoàn tất
            </span>
          </div>
        </div>
      </StageGrid>
    </div>
  );
}

/** Thiếu BGK: KHÔNG được hiện "Đã hoàn tất", và không lộ lý do thiếu. */
export function LEDWaiting({ performance }: { performance: Performance }) {
  return (
    <StageGrid
      left={
        <>
          <RailLabel className="text-[#FBBF24]">Đang chờ</RailLabel>
          <RailTrail side="left" />
        </>
      }
      right={
        <>
          <RailLabel>Tiết mục {orderLabel(performance)}</RailLabel>
          <RailTrail side="right" />
        </>
      }
    >
      <div className="flex flex-col">
        <Eyebrow tone="warn" className="anim-enter-left" style={stagger(0, 0, 60)}>
          <ScanLoader tone="#FBBF24" />
          Đang chờ hoàn tất chấm điểm
        </Eyebrow>
        <Headline className="anim-enter-left mt-[0.5cqw]" style={stagger(0, 0, 220)}>
          {performance.performanceName}
        </Headline>
        <Support className="anim-enter-up mt-[0.6cqw]" style={stagger(0, 0, 400)}>
          Ban Tổ chức đang xác nhận kết quả.
        </Support>
      </div>
    </StageGrid>
  );
}

/**
 * Cao trào của một tiết mục: check được vẽ ra, headline vào. Tổng ~1.35s.
 */
export function LEDCompleted({ performance }: { performance: Performance }) {
  return (
    <StageGrid
      left={
        <>
          <RailLabel className="text-[#34D399]">Hoàn tất</RailLabel>
          <RailTrail side="left" />
        </>
      }
      right={
        <>
          <RailLabel>Tiết mục {orderLabel(performance)}</RailLabel>
          <RailTrail side="right" />
        </>
      }
    >
      <div className="flex items-center gap-[2cqw]">
        <CheckReveal size="7cqw" delay={220} />
        <div className="min-w-0">
          <Headline className="anim-enter-up" style={stagger(0, 0, 620)}>
            Đã hoàn tất chấm điểm
          </Headline>
          <Support
            className="anim-enter-up mt-[0.5cqw] font-mono tracking-[0.12em] uppercase"
            style={stagger(0, 0, 860)}
          >
            {performance.performanceName}
          </Support>
          <Support
            className="anim-enter-up mt-[0.3cqw] text-[#8FA3BC]"
            style={stagger(0, 0, 1060)}
          >
            Điểm số đã được ghi nhận và sẽ được công bố vào cuối chương trình.
          </Support>
        </div>
      </div>
    </StageGrid>
  );
}

/**
 * Sáu nhãn trạng thái hợp lệ. Màu là kênh phân biệt chính, không phải chữ: đọc
 * từ cuối hội trường thì màu tới trước, chữ tới sau.
 */
const STATUS_TONE: Record<string, string> = {
  "Chưa biểu diễn": "text-[#7E93AE]",
  "Đang biểu diễn": "text-[#FF9152]",
  "BGK đang chấm": "text-[#3ED8F0]",
  "Đã chấm xong": "text-[#34D399]",
  "Chờ bổ sung điểm": "text-[#FBBF24]",
  "Điểm đã được BTC xác nhận": "text-[#A78BFA]",
};

/**
 * Bảng tổng trạng thái. Sáu nhãn hợp lệ, KHÔNG có điểm và KHÔNG có xếp hạng.
 *
 * HAI CỘT trên canvas ultra-wide. Chiều cao khả dụng là 944px; ở cỡ `led-row`
 * (48px) mỗi dòng chiếm ~90px, nên tám dòng xếp dọc cần 720px cộng tiêu đề —
 * vừa đủ nhưng không còn chỗ thở. Chia hai cột dùng đúng thứ khung này có nhiều:
 * bề ngang.
 */
export function LEDAllStatus({
  rows,
}: {
  rows: { performance: Performance; status: string }[];
}) {
  return (
    <DataBand title="Tiến độ chấm điểm">
      <ul
        className={`grid w-full gap-x-[3cqw] ${
          rows.length > 4 ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {rows.map(({ performance: p, status }, i) => {
          const done = status === "Đã chấm xong";
          const judging = status === "BGK đang chấm";
          return (
            <li
              key={p.registrationCode}
              // Vào lần lượt, mỗi dòng cách nhau 70ms. Sau khi vào thì đứng yên:
              // một bảng có mọi dòng chuyển động liên tục là bảng không đọc được.
              className="anim-enter-up led-rule grid grid-cols-[6%_1fr_34%] items-center gap-[1cqw] py-[0.55cqw]"
              style={stagger(i, 70, 100)}
            >
              <span className="tnum text-led-row font-mono text-[#FF9152]">
                {orderLabel(p)}
              </span>
              <span className="text-led-row truncate text-[#EAF1FB]">
                {p.performanceName}
              </span>
              <span
                className={`text-led-meta flex items-center justify-end gap-[0.5cqw] text-right ${
                  STATUS_TONE[status] ?? "text-[#B8C9DE]"
                }`}
              >
                {judging ? (
                  <span
                    aria-hidden
                    data-motion-decorative="true"
                    className="inline-block size-[0.6cqw] shrink-0 rounded-full bg-current"
                    style={{ animation: "pulse-soft 1.8s ease-in-out infinite" }}
                  />
                ) : null}
                {done ? (
                  <span aria-hidden className="inline-block shrink-0">
                    ✓
                  </span>
                ) : null}
                {status}
              </span>
            </li>
          );
        })}
      </ul>
    </DataBand>
  );
}

export function LEDAllCompleted() {
  return (
    <StageGrid
      left={
        <>
          <RailLabel className="text-[#34D399]">Hoàn tất</RailLabel>
          <RailTrail side="left" />
        </>
      }
    >
      <div className="flex items-center justify-center gap-[2cqw] text-center">
        <CheckReveal size="7cqw" delay={160} />
        <div>
          <Headline className="anim-enter-up" style={stagger(0, 0, 560)}>
            Tất cả tiết mục đã hoàn tất
          </Headline>
          <Support className="anim-enter-up mt-[0.6cqw]" style={stagger(0, 0, 820)}>
            Ban Tổ chức đang chuẩn bị công bố kết quả.
          </Support>
        </div>
      </div>
    </StageGrid>
  );
}

/* ═══ Chế độ B · công bố giải ══════════════════════════════════════════════ */

export function LEDAwardsIntro({ location }: { location: LocationCode }) {
  return (
    <StageGrid
      left={
        <>
          <RailLabel>{location}</RailLabel>
          <RailLabel className="mt-[0.5cqw] text-[#3ED8F0]">
            {EVENT_DATE[location]}
          </RailLabel>
          <RailTrail side="left" />
        </>
      }
      right={
        <>
          <RailLabel>Aha Got Talent 2026</RailLabel>
          <RailTrail side="right" />
        </>
      }
    >
      <div className="flex flex-col items-center text-center">
        <Eyebrow
          tone="cyan"
          className="anim-enter-fade justify-center"
          style={stagger(0, 0, 100)}
        >
          Lễ trao giải
        </Eyebrow>
        <h1
          className="anim-enter-up display text-led-hero mt-[0.6cqw] leading-[0.9] text-[#F7FAFF] [text-shadow:0_0.1cqw_0.9cqw_rgba(4,9,20,.95)]"
          style={stagger(0, 0, 260)}
        >
          Công bố kết quả
        </h1>
        <p
          className="anim-enter-up display text-led-title mt-[0.6cqw] tracking-[0.04em] text-[#FF9152]"
          style={stagger(0, 0, 460)}
        >
          Unlock Your Next Move
        </p>
      </div>
    </StageGrid>
  );
}

/**
 * Màn tổng kết. Chỉ liệt kê giải ĐÃ công bố — không có chỗ cho giải sắp tới.
 *
 * Bốn giải, dàn NGANG thành bốn cột: khung ultra-wide cho mỗi giải 526px bề
 * ngang trong lõi 70%, đủ cho tên giải trên nhãn và tên tiết mục dưới. Xếp dọc
 * bốn dòng ở cỡ `led-title` sẽ vượt 944px chiều cao khả dụng.
 */
export function LEDAwardsSummary({
  rows,
}: {
  rows: { nameVi: string; performanceName: string }[];
}) {
  if (rows.length === 0) {
    return (
      <StageGrid>
        <Support className="text-center">Chưa có giải nào được công bố.</Support>
      </StageGrid>
    );
  }
  return (
    <StageGrid
      left={
        <>
          <RailLabel className="text-[#FF9152]">Tổng kết</RailLabel>
          <RailTrail side="left" />
        </>
      }
    >
      <ul
        className="grid w-full items-start gap-[2cqw]"
        style={{ gridTemplateColumns: `repeat(${Math.min(rows.length, 4)}, 1fr)` }}
      >
        {rows.map((r, i) => (
          <li
            key={r.nameVi}
            className="anim-enter-up flex flex-col border-t-[0.2cqw] border-[#FF9152] pt-[1cqw]"
            style={stagger(i, 180, 200)}
          >
            <span className="text-led-meta font-mono tracking-[0.18em] text-[#FF9152] uppercase">
              {r.nameVi}
            </span>
            <span className="display text-led-title mt-[0.5cqw] text-[#F7FAFF]">
              {r.performanceName}
            </span>
          </li>
        ))}
      </ul>
    </StageGrid>
  );
}

/**
 * Bảng xếp hạng đầy đủ.
 *
 * CHƯA NỐI VÀO ADMIN: `full_ranking` có trong `LEDMode` nhưng LiveScreen không
 * dựng nó và Live Control không có nút bật. Component để ở đây vì nó thuộc design
 * system của màn LED và duyệt được qua harness `/motion`.
 *
 * Không điểm từng BGK, không email, không nhận xét.
 */
export function LEDFullRanking({
  rows,
}: {
  rows: { rank: string; name: string; total: string; award?: string }[];
}) {
  return (
    <DataBand title="Bảng xếp hạng">
      <ul
        className={`grid w-full gap-x-[3cqw] ${
          rows.length > 4 ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {rows.map((r) => (
          <li
            key={r.name}
            className="led-rule grid grid-cols-[7%_1fr_26%] items-center gap-[1cqw] py-[0.55cqw]"
          >
            <span className="tnum display text-led-row text-[#FF9152]">{r.rank}</span>
            <span className="text-led-row truncate text-[#EAF1FB]">{r.name}</span>
            <span className="tnum text-led-row text-right text-[#3ED8F0]">
              {r.total}
              {r.award ? (
                <span className="text-led-meta block font-mono tracking-[0.14em] text-[#8FA3BC] uppercase">
                  {r.award}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </DataBand>
  );
}
