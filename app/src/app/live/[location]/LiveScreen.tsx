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
  LEDAwardsIntro,
  LEDAwardsSummary,
  LEDFramePreview,
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
  framePreview = false,
}: {
  initial: LedSnapshot;
  debug?: boolean;
  motionDebug?: boolean;
  /** `?frame=1` ở development: bọc khung trong hộp 3008×1088 đã thu nhỏ. */
  framePreview?: boolean;
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
  //
  // `audience_vote_*` và `awards_*` đã chuyển sang bố cục neo đáy trên canvas
  // ultra-wide, nên chúng dùng scrim ĐÁY chứ không phải scrim tâm — scrim tâm
  // là một ellipse giữa khung, nó không phủ tới góc dưới-trái nơi giờ có chữ.
  const centered =
    effective === "award_reveal" ||
    effective === "scorecard" ||
    effective === "audience_award_shuffle" ||
    effective === "audience_vote_closed" ||
    effective === "audience_vote_verification";

  const stage = (
    <>
      {/*
        MỘT `LEDStage` duy nhất cho mọi state, kể cả Emergency Hide. Nếu tách
        thành hai nhánh return khác nhau, React sẽ dựng lại cả cây và KV phải
        tải lại — trên máy chiếu đó là một cú chớp đen giữa chương trình.
      */}
      <LEDStage
        quiet={effective !== "standby" && !hidden}
        bare={hidden}
        anchor={centered ? "center" : "bottom"}
        fill={framePreview}
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
                <LEDAwardsIntro location={data.location} />
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
                <LEDAwardsSummary rows={data.publishedAwards} />
              ) : null}
            </div>
          )}
        </LEDStateTransition>

        {debug && (
          <DebugBadge
            connection={connection}
            lastUpdate={lastUpdate}
            mode={effective}
          />
        )}
      </LEDStage>
    </>
  );

  return (
    <MotionRoot debug={motionDebug}>
      {framePreview ? <LEDFramePreview>{stage}</LEDFramePreview> : stage}
    </MotionRoot>
  );
}

/*
  `AwardsIntro` và `AwardsSummary` từng là hai component cục bộ ở đây, dựng cùng
  hai state mà LEDStage cũng có component cho. Hai bản thiết kế khác nhau cho
  cùng một state là cách chắc chắn nhất để màn sân khấu lệch nhau — nên giờ dùng
  `LEDAwardsIntro` và `LEDAwardsSummary` từ design system.
*/

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
