"use client";

import {
  LEDStage,
  LEDStandby,
  LEDInterlude,
  LEDPerformance,
  LEDJudging,
  LEDWaiting,
  LEDCompleted,
  LEDAllStatus,
  LEDAllCompleted,
} from "@/components/led/LEDStage";
import { MotionRoot } from "@/components/motion/MotionRoot";
import { LEDStateTransition } from "@/components/motion/primitives";
import {
  AwardRevealSequence,
  CrowdMagnetShuffle,
  ScorecardReveal,
  VoteClosedPanel,
  VoteLivePanel,
  type AwardIntensity,
} from "@/components/motion/reveal";
import { useSnapshot } from "@/lib/useSnapshot";
import type { LedSnapshot } from "@/lib/server/views";

/** Cường độ motion theo giải — giải cao nhất có cao trào lớn nhất. */
const AWARD_INTENSITY: Record<string, AwardIntensity> = {
  "The Creative Pulse": "pulse",
  "The Spotlight Act": "spotlight",
  "The Crowd Magnet": "audience",
  "The Breakthrough Act": "grand",
};

/**
 * Màn LED. Nghe `live_display_state` qua SSE và vẽ lại — không reload, không
 * polling, không state cục bộ nào ngoài snapshot vừa nhận.
 *
 * Bốn luật của màn hình này:
 *   1. Mất kết nối thì GIỮ NGUYÊN khung hình cuối. `useSnapshot` không bao giờ
 *      xoá dữ liệu cũ, nên rớt mạng giữa chừng không làm màn nhảy về trống.
 *   2. Không có chữ nào về lỗi kỹ thuật. Indicator reconnect chỉ hiện khi mở
 *      với `?debug=1` — máy chiếu ngoài hội trường không bao giờ mở kèm cờ đó.
 *   3. Không có điểm. `LedSnapshot` không có trường điểm nào để mà lỡ hiện.
 *   4. Nền nằm ngoài `LEDStateTransition`. Đổi state chỉ crossfade phần nội
 *      dung; KV, glow, particle chạy liên tục xuyên suốt và không bao giờ
 *      giật lại từ đầu.
 */
export function LiveScreen({
  initial,
  debug = false,
  motionDebug = false,
}: {
  initial: LedSnapshot;
  debug?: boolean;
  motionDebug?: boolean;
}) {
  const { data, connection, lastUpdate } = useSnapshot<LedSnapshot>(
    `/api/led/${initial.location.toLowerCase()}/stream`,
    initial,
  );

  const { displayMode: mode, current, next, progress, rows, voting, award } = data;

  /*
    Mọi chế độ đều có điều kiện dữ liệu tối thiểu. Thiếu là về standby, không
    bao giờ để LED trống hay hiện khung rỗng giữa chương trình.

    Riêng `award_reveal` và `scorecard`: thiếu `award.winner` nghĩa là giải chưa
    published — LED lùi về `awards_intro` thay vì hiện một khung trống gợi ý
    rằng sắp có gì đó. Đây là lớp phòng thủ thứ hai; lớp thứ nhất là
    `buildLedSnapshot` không trả winner khi chưa công bố.
  */
  const needsCurrent =
    mode === "performance" ||
    mode === "judging_progress" ||
    mode === "performance_waiting" ||
    mode === "performance_completed";
  const needsAward = mode === "award_reveal" || mode === "scorecard";
  const needsVoting = mode === "audience_vote_live" || mode === "audience_vote_intro";

  const effective =
    needsCurrent && !current
      ? "standby"
      : needsAward && !award?.winner
        ? "awards_intro"
        : needsVoting && !voting
          ? "standby"
          : mode;

  const hidden = effective === "emergency_hide";
  // Mọi màn đặt chữ giữa khung đều cần scrim trung tâm — chỗ đó KV đã có sẵn
  // headline trắng rất sáng, chữ trắng đè lên chữ trắng thì không ai đọc được.
  const centered =
    effective === "award_reveal" ||
    effective === "scorecard" ||
    effective === "audience_award_shuffle" ||
    effective === "audience_vote_intro" ||
    effective === "audience_vote_live" ||
    effective === "audience_vote_closed" ||
    effective === "audience_vote_verification" ||
    effective === "awards_intro" ||
    effective === "awards_summary";

  return (
    <MotionRoot debug={motionDebug}>
      {/*
        MỘT `LEDStage` duy nhất cho mọi state, kể cả Emergency Hide. Nếu tách
        thành hai nhánh return khác nhau, React sẽ dựng lại cả cây và KV phải
        tải lại — trên máy chiếu đó là một cú chớp đen giữa chương trình.
      */}
      <LEDStage
        quiet={effective !== "standby" && !hidden}
        bare={hidden}
        anchor={centered ? "center" : "bottom"}
      >
        {/* Emergency Hide đi thẳng, không crossfade: brief yêu cầu dưới 200ms. */}
        <LEDStateTransition stateKey={effective} instant={hidden}>
          {hidden ? (
            <div className="h-full" />
          ) : (
            <div className="h-full min-h-0">
              {effective === "standby" ? <LEDStandby location={data.location} /> : null}

              {effective === "interlude" && next ? (
                <LEDInterlude next={next} prepMinutes={3} />
              ) : null}

              {effective === "performance" && current ? (
                <LEDPerformance performance={current} />
              ) : null}

              {effective === "judging_progress" && current ? (
                <LEDJudging
                  performance={current}
                  done={progress?.submitted ?? 0}
                  total={progress?.assigned ?? 0}
                />
              ) : null}

              {effective === "performance_waiting" && current ? (
                <LEDWaiting performance={current} />
              ) : null}

              {effective === "performance_completed" && current ? (
                <LEDCompleted performance={current} />
              ) : null}

              {effective === "all_performances_status" ? (
                <LEDAllStatus rows={rows} />
              ) : null}

              {effective === "all_scores_completed" ? <LEDAllCompleted /> : null}

              {/* ── Bình chọn khán giả ─────────────────────────────────── */}
              {(effective === "audience_vote_live" ||
                effective === "audience_vote_intro") &&
              voting ? (
                <VoteLivePanel
                  voteUrl={voting.voteUrl}
                  participants={voting.participants}
                  endsAt={voting.closesAt ?? voting.serverNow}
                  serverNow={voting.serverNow}
                />
              ) : null}

              {effective === "audience_vote_closed" ||
              effective === "audience_vote_verification" ? (
                <VoteClosedPanel />
              ) : null}

              {/* ── Công bố giải ───────────────────────────────────────── */}
              {effective === "awards_intro" ? (
                <AwardsIntro location={data.location} />
              ) : null}

              {/* Shuffle: KHÔNG nhận award, KHÔNG nhận winner. Chỉ là các card
                  theo thứ tự rundown. */}
              {effective === "audience_award_shuffle" ? (
                <CrowdMagnetShuffle
                  performances={data.shuffleRows}
                  awardName="The Crowd Magnet"
                />
              ) : null}

              {effective === "award_reveal" && award?.winner ? (
                <AwardRevealSequence
                  awardName={award.nameEn}
                  awardSub={award.nameVi}
                  performance={award.winner}
                  intensity={AWARD_INTENSITY[award.nameEn] ?? "pulse"}
                />
              ) : null}

              {effective === "scorecard" && award?.winner && award.scorecard ? (
                <ScorecardReveal
                  awardName={`${award.nameEn} · ${award.nameVi}`}
                  performance={award.winner}
                  rows={award.scorecard.rows}
                  total={award.scorecard.total}
                />
              ) : null}

              {effective === "awards_summary" ? (
                <AwardsSummary rows={data.publishedAwards} />
              ) : null}
            </div>
          )}
        </LEDStateTransition>

        {debug ? (
          <DebugBadge
            connection={connection}
            lastUpdate={lastUpdate}
            mode={effective}
          />
        ) : null}
      </LEDStage>
    </MotionRoot>
  );
}

function AwardsIntro({ location }: { location: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[1.2cqw]">
      <span
        className="anim-enter-fade text-[1.5cqw] font-mono tracking-[0.3em] text-[#3ED8F0] uppercase"
        style={{ animationDelay: "100ms" }}
      >
        {location} · Aha Got Talent 2026
      </span>
      <h1
        className="anim-enter-up display text-[5.2cqw] text-[#F2F7FF]"
        style={{ animationDelay: "260ms" }}
      >
        Công bố kết quả
      </h1>
      <p
        className="anim-enter-up text-[1.6cqw] text-[#8FA3BC]"
        style={{ animationDelay: "460ms" }}
      >
        Cảm ơn toàn bộ tiết mục đã mang tới một đêm bứt phá.
      </p>
    </div>
  );
}

/** Màn tổng kết. Chỉ liệt kê giải ĐÃ công bố — không có chỗ cho giải sắp tới. */
function AwardsSummary({
  rows,
}: {
  rows: { nameVi: string; performanceName: string }[];
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[1.4cqw]">
      <span className="anim-enter-fade text-[1.4cqw] font-mono tracking-[0.3em] text-[#FF7F32] uppercase">
        Tổng kết giải thưởng
      </span>
      <ul className="flex w-[62cqw] max-w-full flex-col">
        {rows.map((r, i) => (
          <li
            key={r.nameVi}
            className="anim-enter-up grid grid-cols-[36%_1fr] items-baseline gap-[1.4cqw] border-b border-[rgba(146,170,200,.2)] py-[0.9cqw]"
            style={{ animationDelay: `${200 + i * 180}ms` }}
          >
            <span className="text-[1.5cqw] font-mono tracking-[0.14em] text-[#3ED8F0] uppercase">
              {r.nameVi}
            </span>
            <span className="display text-[2.4cqw] text-[#F2F7FF]">
              {r.performanceName}
            </span>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="text-[1.5cqw] text-[#8FA3BC]">Chưa có giải nào được công bố.</p>
      ) : null}
    </div>
  );
}

/** Chỉ tồn tại khi mở LED với `?debug=1`. Không bao giờ lên máy chiếu. */
function DebugBadge({
  connection,
  lastUpdate,
  mode,
}: {
  connection: string;
  lastUpdate: number | null;
  mode: string;
}) {
  const tone =
    connection === "live"
      ? "text-[#34D399] border-[#34D399]"
      : "text-[#FBBF24] border-[#FBBF24]";
  return (
    <div
      className={`pointer-events-none absolute top-2 right-2 z-50 rounded border px-2 py-1 font-mono text-[0.7rem] ${tone}`}
    >
      {connection === "live" ? "● realtime" : "○ đang nối lại"}
      {lastUpdate ? ` · ${new Date(lastUpdate).toLocaleTimeString("vi-VN")}` : ""}
      {` · ${mode}`}
    </div>
  );
}
