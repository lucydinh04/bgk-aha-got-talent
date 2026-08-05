"use client";

import { useState } from "react";

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
import { AWARDS, CRITERIA, type LocationCode, type Performance } from "@/lib/data";

/**
 * Bàn điều khiển để duyệt hiệu ứng. Không nối vào DB, không ghi gì.
 *
 * Nhóm "vận hành" dựng đúng component đang chạy thật trên `/live/[location]`.
 * Nhóm "công bố giải" dựng component chưa được nối — xem trước để duyệt.
 */

type Group = "operational" | "awards";

interface Scene {
  key: string;
  label: string;
  group: Group;
}

const SCENES: Scene[] = [
  { key: "standby", label: "Standby", group: "operational" },
  { key: "interlude", label: "Giữa hai tiết mục", group: "operational" },
  { key: "performance", label: "Đang biểu diễn", group: "operational" },
  { key: "judging_progress", label: "BGK đang chấm", group: "operational" },
  { key: "performance_waiting", label: "Chờ hoàn tất", group: "operational" },
  { key: "performance_completed", label: "Đã chấm xong", group: "operational" },
  { key: "all_performances_status", label: "Bảng tổng", group: "operational" },
  { key: "all_scores_completed", label: "Xong toàn bộ", group: "operational" },
  { key: "emergency_hide", label: "Emergency Hide", group: "operational" },

  { key: "vote_live", label: "Bình chọn · đang mở", group: "awards" },
  { key: "vote_closed", label: "Bình chọn · đã đóng", group: "awards" },
  { key: "shuffle", label: "Crowd Magnet · shuffle", group: "awards" },
  { key: "reveal_pulse", label: "Creative Pulse", group: "awards" },
  { key: "reveal_spotlight", label: "Spotlight Act", group: "awards" },
  { key: "reveal_audience", label: "Crowd Magnet · reveal", group: "awards" },
  { key: "reveal_grand", label: "Breakthrough Act", group: "awards" },
  { key: "scorecard", label: "Scorecard", group: "awards" },
];

export function MotionHarness({
  location,
  performances,
  serverNow,
}: {
  location: LocationCode;
  performances: Performance[];
  serverNow: string;
}) {
  const [scene, setScene] = useState("standby");
  const [judgesDone, setJudgesDone] = useState(2);

  const current = performances[0];
  const next = performances[1] ?? performances[0];
  const awards = AWARDS[location];
  const slug = location.toLowerCase();

  // Countdown demo: 45 giây kể từ lúc mở harness, neo theo giờ server.
  const endsAt = new Date(new Date(serverNow).getTime() + 45_000).toISOString();

  const scorecardRows = CRITERIA.map((c, i) => ({
    label: c.label,
    weight: c.weight,
    value: ["90.00", "88.00", "86.00", "84.00", "92.00"][i],
  }));

  const hidden = scene === "emergency_hide";
  // Màn công bố đặt chữ giữa khung → cần scrim trung tâm để đọc được trên KV.
  const centered =
    scene.startsWith("reveal_") ||
    scene === "shuffle" ||
    scene === "scorecard" ||
    scene === "vote_closed";

  return (
    <div className="bg-ink min-h-dvh">
      <div className="border-navy-800 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <span className="text-brand display mr-2 text-lg">Motion preview</span>
        <span className="text-silver-dim font-mono text-[0.66rem]">
          {location} · chỉ có ở development
        </span>
        <a
          href={`/live/${slug}?debug=1&motionDebug=true`}
          className="text-cyan ml-auto font-mono text-[0.68rem] underline-offset-4 hover:underline"
        >
          Mở LED thật ↗
        </a>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {(["operational", "awards"] as Group[]).map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-1.5">
            <span className="text-silver-dim mr-1 font-mono text-[0.58rem] tracking-[0.14em] uppercase">
              {g === "operational" ? "Đang chạy thật" : "Phase 4 · chưa nối"}
            </span>
            {SCENES.filter((s) => s.group === g).map((s) => (
              <button
                key={s.key}
                onClick={() => setScene(s.key)}
                className={`rounded border px-2 py-1 font-mono text-[0.62rem] transition ${
                  scene === s.key
                    ? "border-brand text-brand"
                    : g === "awards"
                      ? "border-locked/40 text-locked/80"
                      : "border-navy-600 text-silver"
                }`}
              >
                {s.label}
              </button>
            ))}
            <span className="mx-2" />
          </div>
        ))}

        {scene === "judging_progress" ? (
          <label className="text-silver flex items-center gap-2 font-mono text-[0.66rem]">
            BGK đã gửi
            <input
              type="range"
              min={0}
              max={5}
              value={judgesDone}
              onChange={(e) => setJudgesDone(Number(e.target.value))}
              className="accent-brand"
            />
            <span className="text-brand tnum">{judgesDone}/5</span>
          </label>
        ) : null}
      </div>

      <MotionRoot debug>
        <LEDStage
          quiet={scene !== "standby" && !hidden}
          bare={hidden}
          anchor={centered ? "center" : "bottom"}
        >
          <LEDStateTransition stateKey={scene} instant={hidden}>
            <div className="h-full min-h-0">
              {scene === "standby" ? <LEDStandby location={location} /> : null}
              {scene === "interlude" ? <LEDInterlude next={next} prepMinutes={3} /> : null}
              {scene === "performance" ? <LEDPerformance performance={current} /> : null}
              {scene === "judging_progress" ? (
                <LEDJudging performance={current} done={judgesDone} total={5} />
              ) : null}
              {scene === "performance_waiting" ? <LEDWaiting performance={current} /> : null}
              {scene === "performance_completed" ? (
                <LEDCompleted performance={current} />
              ) : null}
              {scene === "all_performances_status" ? (
                <LEDAllStatus
                  rows={performances.map((p, i) => ({
                    performance: p,
                    status: ["Đã chấm xong", "BGK đang chấm", "Đang biểu diễn", "Chưa biểu diễn"][
                      i % 4
                    ],
                  }))}
                />
              ) : null}
              {scene === "all_scores_completed" ? <LEDAllCompleted /> : null}

              {scene === "vote_live" ? (
                <VoteLivePanel
                  voteUrl={`aha.vn/vote/${slug}`}
                  participants={186}
                  endsAt={endsAt}
                  serverNow={serverNow}
                />
              ) : null}
              {scene === "vote_closed" ? <VoteClosedPanel /> : null}
              {scene === "shuffle" ? (
                <CrowdMagnetShuffle
                  performances={performances}
                  awardName="The Crowd Magnet"
                />
              ) : null}

              {scene.startsWith("reveal_")
                ? (() => {
                    const intensity = scene.replace("reveal_", "") as AwardIntensity;
                    const award =
                      awards.find((a) =>
                        intensity === "grand"
                          ? a.code === "breakthrough_act"
                          : intensity === "audience"
                            ? a.code === "crowd_magnet"
                            : intensity === "spotlight"
                              ? a.code === "spotlight_act"
                              : a.code === "creative_pulse",
                      ) ?? awards[0];
                    return (
                      <AwardRevealSequence
                        awardName={award.nameEn}
                        awardSub={award.nameVi}
                        performance={current}
                        intensity={intensity}
                      />
                    );
                  })()
                : null}

              {scene === "scorecard" ? (
                <ScorecardReveal
                  awardName="The Breakthrough Act · Giải Nhất"
                  performance={current}
                  rows={scorecardRows}
                  total="89.40"
                />
              ) : null}
            </div>
          </LEDStateTransition>
        </LEDStage>
      </MotionRoot>
    </div>
  );
}
