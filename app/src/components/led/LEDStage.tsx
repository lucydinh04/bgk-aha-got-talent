"use client";

import type { ReactNode } from "react";
import { AnimatedCampaignBackground } from "@/components/motion/AnimatedCampaignBackground";
import {
  AnimatedCounter,
  AnimatedProgress,
  CheckReveal,
  EnergyPulse,
  stagger,
} from "@/components/motion/primitives";
import type { LocationCode, Performance } from "@/lib/data";
import { EVENT_DATE, orderLabel, teamLabel, CRITERIA } from "@/lib/data";

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

/**
 * Khung LED 16:9. Mọi nội dung nằm trong safe margin 5%.
 *
 * KV ngang là 1920×1072 (≈16:9) nên dùng cover ở khung 16/9 gần như không cắt.
 * `mode="full"` giữ trọn artwork cho standby; các state có chữ dùng `quiet`
 * để neo xuống dải light trail, tránh đè lên headline in sẵn trong ảnh.
 */
export function LEDStage({
  quiet = true,
  bare = false,
  anchor = "bottom",
  children,
}: {
  quiet?: boolean;
  /** Emergency Hide: tắt mọi lớp trang trí, chỉ còn KV. */
  bare?: boolean;
  /** `center` bật scrim giữa khung cho các màn công bố. */
  anchor?: "bottom" | "center";
  children: ReactNode;
}) {
  return (
    <div className="bg-ink flex min-h-dvh items-center justify-center">
      {/*
        @container bật container-type: inline-size để mọi cỡ chữ tính bằng cqw
        co giãn theo bề rộng màn LED, không phụ thuộc viewport.
        max-w giữ khung 16:9 luôn lọt trong chiều cao màn hình.

        Nền nằm NGOÀI phần nội dung state và không nhận prop realtime nào, nên
        snapshot SSE về bao nhiêu lần cũng không làm nó remount hay chạy lại
        animation. Đây là điều kiện để "background không reset khi realtime
        update" — không phải một tối ưu, mà là kiến trúc.
      */}
      <div className="@container relative isolate aspect-video w-full max-w-[calc(100dvh*16/9)] overflow-hidden">
        <AnimatedCampaignBackground quiet={quiet} bare={bare} anchor={anchor} />
        {/* safe margin 5% — không có gì chạm mép màn */}
        <div className="relative z-10 flex h-full w-full flex-col p-[5%]">
          {children}
        </div>
      </div>
    </div>
  );
}

export function LEDStandby({ location }: { location: LocationCode }) {
  return (
    // Góc dưới trái là vùng yên tĩnh duy nhất của KV: icon A ở giữa,
    // logo và badge ở trên, DRESSCODE ở dưới phải. Text đặt ở đây không đè lên gì.
    <div className="flex h-full flex-col items-start justify-end">
      {/* KV đã in sẵn logo Ahamove, badge 11 năm và headline — không lặp lại */}
      <p
        className="anim-enter-up text-[1.5cqw] font-mono tracking-[0.3em] text-[#C6D4E6] uppercase"
        style={stagger(0, 0, 140)}
      >
        {location} · {EVENT_DATE[location]}
      </p>

      {/* Light sweep chạy qua headline. `overflow-hidden` giữ vệt sáng trong
          khung chữ; chữ nằm trên z cao hơn nên không bao giờ bị vệt che. */}
      <span
        className="anim-enter-up relative mt-[0.6cqw] inline-block overflow-hidden"
        style={stagger(0, 0, 300)}
      >
        <span className="display relative z-10 text-[2.4cqw] tracking-[0.1em] text-[#FF7F32] [text-shadow:0_2px_18px_rgba(4,9,20,.9)]">
          Unlock Your Next Move
        </span>
        <span
          aria-hidden
          data-motion-decorative="true"
          className="absolute inset-y-0 left-0 z-20 w-[24%]"
          style={{
            background:
              "linear-gradient(100deg, transparent 0%, rgba(255,255,255,.5) 50%, transparent 100%)",
            animation: "light-sweep 6.5s ease-in-out 1.4s infinite",
          }}
        />
      </span>
    </div>
  );
}

/**
 * Chuỗi vào của tiết mục đang diễn: số thứ tự → tên → thông tin đội.
 * Tổng ~760ms, nằm trong khoảng 600–900ms của brief.
 */
export function LEDPerformance({ performance }: { performance: Performance }) {
  return (
    <BottomBand>
      <span
        className="anim-enter-left flex items-center gap-[0.8cqw] text-[1.7cqw] font-mono tracking-[0.24em] text-[#FF7F32]"
        style={stagger(0, 0, 60)}
      >
        <span
          aria-hidden
          data-motion-decorative="true"
          className="inline-block size-[1cqw] rounded-full bg-[#FF7F32]"
          style={{ animation: "badge-breathe 2.2s ease-in-out infinite" }}
        />
        Tiết mục {orderLabel(performance)} · Đang biểu diễn
      </span>
      <h1
        className="anim-enter-left display text-[4.6cqw] text-[#F2F7FF]"
        style={stagger(0, 0, 220)}
      >
        {performance.performanceName}
      </h1>
      <p
        className="anim-enter-up text-[1.6cqw] font-mono tracking-[0.12em] text-[#C6D4E6] uppercase"
        style={stagger(0, 0, 420)}
      >
        {[performance.performanceType, performance.department]
          .filter(Boolean)
          .join(" · ")}{" "}
        · {teamLabel(performance)}
      </p>
    </BottomBand>
  );
}

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
  return (
    <div className="relative h-full">
      {/* Mỗi lần `done` tăng: một nhịp năng lượng chạy đúng một lần rồi tắt. */}
      <EnergyPulse trigger={done} />

      <BottomBand>
        <span className="flex items-center gap-[1cqw]">
          <span
            aria-hidden
            data-motion-decorative="true"
            className="size-[1.3cqw] rounded-full bg-[#3ED8F0]"
            style={{ animation: "pulse-soft 1.8s ease-in-out infinite" }}
          />
          <span className="text-[1.5cqw] font-mono tracking-[0.26em] text-[#3ED8F0] uppercase">
            Ban Giám khảo đang chấm điểm
          </span>
        </span>
        <h1 className="display text-[3cqw] text-[#F2F7FF]">
          {performance.performanceName}
        </h1>
        {/* Chỉ con số đếm — không tên BGK nào chưa chấm, không điểm, không thứ hạng */}
        <p className="display tnum text-[5.4cqw] leading-none text-[#3ED8F0]">
          <AnimatedCounter value={done} /> / {total} BGK đã hoàn tất
        </p>
        <AnimatedProgress
          value={pct}
          tone={done >= total && total > 0 ? "ok" : "cyan"}
          className="h-[0.9cqw] w-[42%]"
          label={`${done} trên ${total} giám khảo đã gửi điểm`}
        />
      </BottomBand>
    </div>
  );
}

/**
 * Cao trào của một tiết mục: thanh tiến độ đầy, check được vẽ ra, headline vào.
 * Tổng ~1.35s rồi về ambient — đúng khoảng 1–1.5s của brief.
 */
export function LEDCompleted({ performance }: { performance: Performance }) {
  return (
    <BottomBand>
      {/* Thanh chạy nốt tới 100% để nối liền mạch từ state judging_progress */}
      <AnimatedProgress
        value={100}
        tone="ok"
        className="anim-enter-fade h-[0.9cqw] w-[42%]"
        label="Đã hoàn tất chấm điểm"
      />
      <span className="flex items-center gap-[1.2cqw]">
        <CheckReveal size="4cqw" delay={220} />
        <span
          className="anim-enter-up display text-[4cqw] text-[#F2F7FF]"
          style={stagger(0, 0, 620)}
        >
          Đã hoàn tất chấm điểm
        </span>
      </span>
      <p
        className="anim-enter-up text-[1.7cqw] font-mono tracking-[0.16em] text-[#C6D4E6] uppercase"
        style={stagger(0, 0, 860)}
      >
        {performance.performanceName}
      </p>
      <p
        className="anim-enter-up text-[1.5cqw] text-[#8FA3BC]"
        style={stagger(0, 0, 1060)}
      >
        Điểm số đã được ghi nhận và sẽ được công bố vào cuối chương trình.
      </p>
    </BottomBand>
  );
}

export function LEDVoteLive({
  countdown,
  participants,
  voteUrl,
}: {
  countdown: string;
  participants: number;
  voteUrl: string;
}) {
  return (
    <BottomBand>
      <p className="text-[1.5cqw] font-mono tracking-[0.28em] text-[#3ED8F0] uppercase">
        Bình chọn đang diễn ra
      </p>
      <div className="flex items-end gap-[3cqw]">
        <p className="display tnum text-[11cqw] leading-[0.8] text-[#F2F7FF]">
          {countdown}
        </p>
        <div className="flex items-center gap-[1.6cqw] pb-[0.6cqw]">
          <QRPanel />
          <div>
            <p className="text-[1.4cqw] font-mono tracking-[0.12em] text-[#C6D4E6] uppercase">
              Quét QR và chọn
              <br />
              tối đa 2 tiết mục
            </p>
            <p className="mt-[0.6cqw] border-b border-[rgba(62,216,240,.4)] pb-[0.3cqw] text-[1.5cqw] font-mono tracking-[0.08em] text-[#3ED8F0]">
              {voteUrl}
            </p>
          </div>
        </div>
      </div>
      {/* Chỉ số ballot hợp lệ — không bao giờ là vote count từng tiết mục */}
      <p className="display tnum text-[2.8cqw] tracking-[0.06em] text-[#3ED8F0]">
        {participants} khán giả đã tham gia
      </p>
    </BottomBand>
  );
}

export function LEDShuffle({
  awardName,
  performances,
}: {
  awardName: string;
  performances: Performance[];
}) {
  return (
    <BottomBand>
      <AwardName>{awardName}</AwardName>
      {/*
        Payload KHÔNG chứa winner_performance_id ở state này.
        Shuffle là hiệu ứng thị giác thuần tuý — không có gì để lộ.
      */}
      <div className="grid w-[86%] grid-cols-4 gap-[1.2cqw]">
        {performances.map((p, i) => (
          <div
            key={p.registrationCode}
            className="display grid min-h-[6.5cqw] place-items-center rounded-[0.6cqw] border border-[rgba(62,216,240,.35)] bg-[rgba(62,216,240,.07)] px-[0.9cqw] py-[1.6cqw] text-[1.55cqw] leading-tight text-[#DCE7F5]"
            style={{
              animation: `shuffle-drift ${2.4 + i * 0.35}s ease-in-out ${i * 0.2}s infinite`,
            }}
          >
            {p.performanceName}
          </div>
        ))}
      </div>
    </BottomBand>
  );
}

export function LEDAwardReveal({
  awardName,
  awardSub,
  performance,
  total,
}: {
  awardName: string;
  awardSub?: string;
  performance: Performance;
  total?: string;
}) {
  return (
    <BottomBand>
      <AwardName>{awardName}</AwardName>
      {awardSub ? (
        <p className="text-[1.4cqw] font-mono tracking-[0.28em] text-[#3ED8F0] uppercase">
          {awardSub}
        </p>
      ) : null}
      <h1 className="display text-[4.2cqw] text-[#F2F7FF]">
        {performance.performanceName}
      </h1>
      <p className="text-[1.5cqw] font-mono tracking-[0.12em] text-[#C6D4E6] uppercase">
        {teamLabel(performance)} · {performance.department}
      </p>
      {total ? (
        <p className="display tnum text-[6.4cqw] leading-[0.9] text-[#FF7F32]">
          {total}
          <span className="ml-[1cqw] text-[2cqw] text-[#6B819C]">/ 100</span>
        </p>
      ) : null}
      <span />
    </BottomBand>
  );
}

/* ── primitives ───────────────────────────────────────────────────────────*/

/**
 * Nội dung LED luôn nằm ở dải dưới đáy, canh trái.
 *
 * Vì sao không canh giữa: vùng giữa KV đã có headline "CHUYỂN MÌNH BỨT PHÁ" và
 * icon A. Đặt chữ ở đó vừa lặp chữ vừa phải phủ overlay nặng tới mức giết sạch
 * màu campaign. Dải đáy là vùng light trail, yên tĩnh và tương phản tốt.
 */
/**
 * Panel tối đặc cho các state nhiều dữ liệu (bảng điểm, bảng trạng thái,
 * xếp hạng). Chữ nhỏ và nhiều dòng đặt thẳng lên KV sẽ chồng vào headline và
 * icon A, đọc từ cuối hội trường không nổi. Panel giữ KV sống ở xung quanh mà
 * vùng dữ liệu vẫn tương phản cao.
 */
function LEDPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col justify-end">
      <div className="w-fit max-w-full rounded-[0.9cqw] border border-[rgba(62,216,240,.28)] bg-[rgba(4,9,20,.9)] px-[2.4cqw] py-[1.8cqw] backdrop-blur-sm">
        {children}
      </div>
    </div>
  );
}

function BottomBand({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-start justify-end gap-[0.8cqw] text-left">
      {children}
    </div>
  );
}

function AwardName({ children }: { children: ReactNode }) {
  return (
    <span className="border-y border-[rgba(255,127,50,.45)] px-[2.4cqw] py-[0.8cqw] text-[1.8cqw] font-mono tracking-[0.3em] text-[#FF7F32] uppercase">
      {children}
    </span>
  );
}

function Check() {
  return (
    <span className="grid size-[4cqw] shrink-0 place-items-center rounded-full border-[0.3cqw] border-[#34D399] text-[2cqw] leading-none text-[#34D399]">
      ✓
    </span>
  );
}

/**
 * QR nằm trên một panel trắng đặc — nền KV không bao giờ được lọt vào vùng QR,
 * nếu không máy quét sẽ đọc sai.
 */
function QRPanel({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box = size === "lg" ? "size-[13cqw] p-[1cqw]" : "size-[8.5cqw] p-[0.7cqw]";
  return (
    <div className={`relative shrink-0 bg-white ${box}`}>
      <div
        aria-hidden
        className="absolute inset-[1.2cqw]"
        style={{
          background:
            "conic-gradient(from 0deg, #0A1524 0 25%, transparent 0 50%, #0A1524 0 75%, transparent 0)",
          backgroundSize: "1.5cqw 1.5cqw",
          opacity: 0.9,
        }}
      />
      {["top-[1.2cqw] left-[1.2cqw]", "top-[1.2cqw] right-[1.2cqw]", "bottom-[1.2cqw] left-[1.2cqw]"].map(
        (pos) => (
          <span
            key={pos}
            aria-hidden
            className={`absolute size-[3cqw] border-[0.75cqw] border-[#0A1524] bg-white ${pos}`}
          />
        ),
      )}
    </div>
  );
}

/* ═══ Chế độ A · các state còn lại ════════════════════════════════════════ */

export function LEDInterlude({
  next,
  prepMinutes,
}: {
  next: Performance;
  prepMinutes?: number;
}) {
  return (
    <BottomBand>
      <span
        className="anim-enter-left text-[1.5cqw] font-mono tracking-[0.28em] text-[#3ED8F0] uppercase"
        style={stagger(0, 0, 60)}
      >
        Tiết mục tiếp theo
      </span>
      <h1
        className="anim-enter-left display text-[4.4cqw] text-[#F2F7FF]"
        style={stagger(0, 0, 200)}
      >
        {orderLabel(next)} · {next.performanceName}
      </h1>
      <p
        className="anim-enter-up text-[1.6cqw] font-mono tracking-[0.12em] text-[#C6D4E6] uppercase"
        style={stagger(0, 0, 380)}
      >
        {next.performanceType} · {teamLabel(next)}
      </p>
      {prepMinutes ? (
        <p
          className="anim-enter-up display tnum text-[2.4cqw] text-[#FF7F32]"
          style={stagger(0, 0, 540)}
        >
          Chuẩn bị {prepMinutes} phút
        </p>
      ) : null}
    </BottomBand>
  );
}

/** Thiếu BGK: KHÔNG được hiện "Đã hoàn tất", và không lộ lý do thiếu. */
export function LEDWaiting({ performance }: { performance: Performance }) {
  return (
    <BottomBand>
      <span
        className="anim-enter-left flex items-center gap-[0.8cqw] text-[1.5cqw] font-mono tracking-[0.26em] text-[#FBBF24] uppercase"
        style={stagger(0, 0, 60)}
      >
        <ScanLoader tone="#FBBF24" />
        Đang chờ hoàn tất chấm điểm
      </span>
      <h1
        className="anim-enter-left display text-[4cqw] text-[#F2F7FF]"
        style={stagger(0, 0, 220)}
      >
        {performance.performanceName}
      </h1>
      <p
        className="anim-enter-up text-[1.5cqw] text-[#8FA3BC]"
        style={stagger(0, 0, 400)}
      >
        Ban Tổ chức đang xác nhận kết quả.
      </p>
    </BottomBand>
  );
}

/** Loader futuristic: một vệt quét chạy trong rãnh hẹp. Không spinner tròn. */
export function ScanLoader({ tone = "#3ED8F0" }: { tone?: string }) {
  return (
    <span
      aria-hidden
      data-motion-decorative="true"
      className="inline-block h-[0.3cqw] w-[4cqw] shrink-0 overflow-hidden rounded-full bg-[rgba(146,170,200,.25)]"
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

const STATUS_TONE: Record<string, string> = {
  "Chưa biểu diễn": "text-[#6B819C]",
  "Đang biểu diễn": "text-[#FF7F32]",
  "BGK đang chấm": "text-[#3ED8F0]",
  "Đã chấm xong": "text-[#34D399]",
  "Chờ bổ sung điểm": "text-[#FBBF24]",
  "Điểm đã được BTC xác nhận": "text-[#A78BFA]",
};

/** Bảng tổng trạng thái. Sáu nhãn hợp lệ, KHÔNG có điểm và KHÔNG có xếp hạng. */
export function LEDAllStatus({
  rows,
}: {
  rows: { performance: Performance; status: string }[];
}) {
  return (
    <LEDPanel>
      <div className="flex flex-col gap-[1.2cqw]">
      <span className="text-[1.4cqw] font-mono tracking-[0.28em] text-[#3ED8F0] uppercase">
        Tiến độ chấm điểm
      </span>
      <ul className="flex w-[64cqw] max-w-full flex-col">
        {rows.map(({ performance: p, status }, i) => {
          const done = status === "Đã chấm xong";
          const judging = status === "BGK đang chấm";
          return (
            <li
              key={p.registrationCode}
              // Vào lần lượt, mỗi dòng cách nhau 70ms. Sau khi vào thì đứng yên:
              // một bảng có mọi dòng chuyển động liên tục là bảng không đọc được.
              className="anim-enter-up grid grid-cols-[8%_1fr_34%] items-baseline gap-[1cqw] border-b border-[rgba(146,170,200,.18)] py-[0.7cqw]"
              style={stagger(i, 70, 100)}
            >
              <span className="tnum font-mono text-[1.6cqw] text-[#FF7F32]">
                {orderLabel(p)}
              </span>
              <span className="truncate text-[1.6cqw] text-[#DCE7F5]">
                {p.performanceName}
              </span>
              <span
                className={`flex items-center justify-end gap-[0.6cqw] text-right font-mono text-[1.3cqw] tracking-[0.1em] uppercase ${STATUS_TONE[status] ?? "text-[#C6D4E6]"}`}
              >
                {judging ? (
                  <span
                    aria-hidden
                    data-motion-decorative="true"
                    className="inline-block size-[0.8cqw] shrink-0 rounded-full bg-current"
                    style={{ animation: "pulse-soft 1.8s ease-in-out infinite" }}
                  />
                ) : null}
                {done ? (
                  <span
                    aria-hidden
                    className="inline-block shrink-0 text-[1.2cqw] [text-shadow:0_0_10px_rgba(52,211,153,.9)]"
                  >
                    ✓
                  </span>
                ) : null}
                {status}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
    </LEDPanel>
  );
}

export function LEDAllCompleted() {
  return (
    <BottomBand>
      <span className="flex items-center gap-[1.2cqw]">
        <CheckReveal size="4cqw" delay={160} />
        <span
          className="anim-enter-up display text-[3.6cqw] text-[#F2F7FF]"
          style={stagger(0, 0, 560)}
        >
          Tất cả tiết mục đã hoàn tất chấm điểm
        </span>
      </span>
      <p
        className="anim-enter-up text-[1.6cqw] text-[#8FA3BC]"
        style={stagger(0, 0, 820)}
      >
        Ban Tổ chức đang chuẩn bị công bố kết quả.
      </p>
    </BottomBand>
  );
}

/* ═══ Bình chọn khán giả ═══════════════════════════════════════════════════ */

export function LEDVoteIntro({ awardName }: { awardName: string }) {
  return (
    <BottomBand>
      <AwardName>{awardName}</AwardName>
      <h1 className="display text-[4cqw] text-[#F2F7FF]">
        Bình chọn tiết mục bạn yêu thích
      </h1>
      <p className="text-[1.6cqw] text-[#C6D4E6]">
        Mỗi khán giả có tối đa 2 phiếu, cho hai tiết mục khác nhau.
      </p>
    </BottomBand>
  );
}

export function LEDVoteQR({ voteUrl }: { voteUrl: string }) {
  return (
    <BottomBand>
      <span className="text-[1.5cqw] font-mono tracking-[0.28em] text-[#3ED8F0] uppercase">
        Bình chọn sắp bắt đầu
      </span>
      <div className="flex items-center gap-[2.4cqw]">
        <QRPanel size="lg" />
        <div>
          <h1 className="display text-[3.4cqw] text-[#F2F7FF]">
            Quét QR và chọn
            <br />
            tối đa 2 tiết mục
          </h1>
          <p className="mt-[0.8cqw] border-b border-[rgba(62,216,240,.4)] pb-[0.4cqw] text-[1.8cqw] font-mono tracking-[0.08em] text-[#3ED8F0]">
            {voteUrl}
          </p>
        </div>
      </div>
    </BottomBand>
  );
}

export function LEDVoteClosed() {
  return (
    <BottomBand>
      <h1 className="display text-[4.4cqw] text-[#F2F7FF]">
        Bình chọn đã kết thúc
      </h1>
      <p className="text-[1.6cqw] text-[#8FA3BC]">
        Ban Tổ chức đang xác nhận kết quả.
      </p>
    </BottomBand>
  );
}

export function LEDVoteVerification() {
  return (
    <BottomBand>
      <span
        aria-hidden
        className="size-[1.6cqw] rounded-full bg-[#3ED8F0]"
        style={{ animation: "pulse-soft 1.6s ease-in-out infinite" }}
      />
      <h1 className="display text-[4cqw] text-[#F2F7FF]">
        Đang xác minh kết quả bình chọn
      </h1>
      <p className="text-[1.6cqw] text-[#8FA3BC]">
        Vui lòng chờ trong giây lát.
      </p>
    </BottomBand>
  );
}

export function LEDVoteReady() {
  return (
    <BottomBand>
      <span className="flex items-center gap-[1.2cqw]">
        <Check />
        <span className="display text-[3.8cqw] text-[#F2F7FF]">
          Kết quả đã được ghi nhận
        </span>
      </span>
      <p className="text-[1.6cqw] text-[#8FA3BC]">
        Tiết mục được khán giả yêu thích nhất sẽ sớm được công bố.
      </p>
    </BottomBand>
  );
}

/* ═══ Chế độ B · công bố giải ══════════════════════════════════════════════ */

export function LEDAwardsIntro({ location }: { location: LocationCode }) {
  return (
    <BottomBand>
      <span className="text-[1.5cqw] font-mono tracking-[0.3em] text-[#3ED8F0] uppercase">
        {location} · {EVENT_DATE[location]}
      </span>
      <h1 className="display text-[6cqw] text-[#F2F7FF]">Lễ trao giải</h1>
      <p className="display text-[2.4cqw] tracking-[0.1em] text-[#FF7F32]">
        Unlock Your Next Move
      </p>
    </BottomBand>
  );
}

/** Bảng điểm: 5 dòng, font lớn. KHÔNG tên BGK, KHÔNG điểm từng BGK. */
export function LEDScorecard({
  awardName,
  performance,
  values,
  total,
}: {
  awardName: string;
  performance: Performance;
  values: string[];
  total: string;
}) {
  return (
    <LEDPanel>
      <div className="flex flex-col gap-[1cqw]">
      <span className="text-[1.3cqw] font-mono tracking-[0.24em] text-[#FF7F32] uppercase">
        {awardName} · {performance.performanceName}
      </span>
      <ul className="flex w-[62cqw] max-w-full flex-col">
        <li className="grid grid-cols-[44%_18%_18%_20%] gap-[1cqw] border-b border-[rgba(146,170,200,.18)] py-[0.4cqw] font-mono text-[1cqw] tracking-[0.14em] text-[#7E93AE] uppercase">
          <span>Tiêu chí</span>
          <span className="text-right">Điểm TB</span>
          <span className="text-right">Trọng số</span>
          <span className="text-right">Quy đổi</span>
        </li>
        {CRITERIA.map((c, i) => (
          <li
            key={c.key}
            className="tnum grid grid-cols-[44%_18%_18%_20%] gap-[1cqw] border-b border-[rgba(146,170,200,.14)] py-[0.45cqw] text-[1.5cqw] text-[#DCE7F5]"
          >
            <span>{c.label}</span>
            <span className="text-right">{values[i]}</span>
            <span className="text-right text-[#3ED8F0]">
              {Math.round(c.weight * 100)}%
            </span>
            <span className="text-right text-[#FF7F32]">
              {(Number(values[i]) * c.weight).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline gap-[1.4cqw]">
        <span className="display text-[1.8cqw] tracking-[0.12em] text-[#8FA3BC]">
          Tổng điểm
        </span>
        <span className="display tnum text-[5cqw] leading-none text-[#FF7F32]">
          {total}
        </span>
        <span className="display text-[1.6cqw] text-[#6B819C]">/ 100</span>
      </div>
    </div>
    </LEDPanel>
  );
}

/** Voting Result Card — chỉ hiện khi Admin bật show_result_figures. */
export function LEDVoteResult({
  awardName,
  performance,
  participants,
  totalVotes,
  winnerVotes,
}: {
  awardName: string;
  performance: Performance;
  participants: number;
  totalVotes: number;
  winnerVotes: number;
}) {
  const rate = ((winnerVotes / participants) * 100).toFixed(2);
  return (
    <LEDPanel>
      <div className="flex flex-col gap-[1cqw]">
      <span className="text-[1.3cqw] font-mono tracking-[0.24em] text-[#FF7F32] uppercase">
        {awardName} · {performance.performanceName}
      </span>
      <ul className="flex w-[46cqw] max-w-full flex-col">
        {[
          ["Khán giả tham gia", String(participants)],
          ["Tổng phiếu hợp lệ", String(totalVotes)],
          ["Phiếu của tiết mục chiến thắng", String(winnerVotes)],
          ["Tỷ lệ khán giả lựa chọn", `${rate}%`],
        ].map(([k, v]) => (
          <li
            key={k}
            className="flex items-baseline justify-between gap-[1.6cqw] border-b border-[rgba(146,170,200,.16)] py-[0.6cqw] text-[1.7cqw] text-[#DCE7F5]"
          >
            <span>{k}</span>
            <span className="tnum text-[#3ED8F0]">{v}</span>
          </li>
        ))}
      </ul>
      {/* Không có danh tính người bình chọn, không có bảng điểm BGK */}
    </div>
    </LEDPanel>
  );
}

export function LEDCelebration({
  awardName,
  performance,
}: {
  awardName: string;
  performance: Performance;
}) {
  return (
    <BottomBand>
      <AwardName>{awardName}</AwardName>
      <h1 className="display text-[5.4cqw] text-[#F2F7FF]">
        Chúc mừng {performance.performanceName}
      </h1>
      <p className="text-[1.6cqw] font-mono tracking-[0.14em] text-[#C6D4E6] uppercase">
        {teamLabel(performance)} · {performance.department}
      </p>
    </BottomBand>
  );
}

export function LEDAwardsSummary({
  rows,
}: {
  rows: { award: string; performance: string; figure: string }[];
}) {
  return (
    <LEDPanel>
      <div className="flex flex-col gap-[1.2cqw]">
      <span className="text-[1.4cqw] font-mono tracking-[0.28em] text-[#3ED8F0] uppercase">
        Tổng kết giải thưởng
      </span>
      <ul className="flex w-[70cqw] max-w-full flex-col gap-[0.4cqw]">
        {rows.map((r) => (
          <li
            key={r.award}
            className="grid grid-cols-[30%_1fr_20%] items-baseline gap-[1.4cqw] border-b border-[rgba(146,170,200,.16)] pb-[0.7cqw]"
          >
            <span className="font-mono text-[1.2cqw] tracking-[0.16em] text-[#FF7F32] uppercase">
              {r.award}
            </span>
            <span className="display truncate text-[2.1cqw] text-[#EDF3FB]">
              {r.performance}
            </span>
            <span className="display tnum text-right text-[2cqw] text-[#3ED8F0]">
              {r.figure}
            </span>
          </li>
        ))}
      </ul>
    </div>
    </LEDPanel>
  );
}

export function LEDFullRanking({
  rows,
}: {
  rows: { rank: string; name: string; total: string; award?: string }[];
}) {
  return (
    <LEDPanel>
      <div className="flex flex-col gap-[1.2cqw]">
      <span className="text-[1.4cqw] font-mono tracking-[0.28em] text-[#3ED8F0] uppercase">
        Bảng xếp hạng
      </span>
      <ul className="flex w-[66cqw] max-w-full flex-col">
        {rows.map((r) => (
          <li
            key={r.name}
            className="grid grid-cols-[9%_1fr_34%] items-baseline gap-[1cqw] border-b border-[rgba(146,170,200,.16)] py-[0.6cqw]"
          >
            <span className="tnum font-mono text-[1.7cqw] text-[#FF7F32]">
              {r.rank}
            </span>
            <span className="truncate text-[1.7cqw] text-[#DCE7F5]">{r.name}</span>
            <span className="tnum text-right font-mono text-[1.4cqw] tracking-[0.08em] text-[#C6D4E6] uppercase">
              {r.total}
              {r.award ? ` · ${r.award}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {/* Không điểm từng BGK, không email, không nhận xét */}
    </div>
    </LEDPanel>
  );
}
