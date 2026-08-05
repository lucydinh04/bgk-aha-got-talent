import "server-only";

import { get, now, run, tx, uuid } from "@/lib/db";
import type { LocationCode } from "@/lib/data";
import { publish } from "./events";
import { setCurrent, setLiveStatus } from "./performances";

/**
 * `live_display_state` là nguồn sự thật DUY NHẤT của màn LED.
 *
 * Browser của Admin không giữ state nào cả: bấm nút là ghi DB, LED nghe DB.
 * Admin đóng laptop, mở máy khác, LED vẫn đang chiếu đúng thứ đang chiếu.
 */

/**
 * Allow-list chế độ hiển thị. Danh sách này phải TRÙNG KHỚP với CHECK
 * constraint của `live_display_state` (migration 002) — hai lớp cho cùng một
 * luật, vì đây là luật mà hỏng thì hỏng trước mặt cả hội trường.
 *
 * Nhóm công bố giải nằm cuối. Chúng chỉ hiển thị được winner khi giải tương
 * ứng đã `published_at`; xem `buildLedSnapshot` trong views.ts.
 */
export const DISPLAY_MODES = [
  // vận hành
  "standby",
  "interlude",
  "performance",
  "judging_progress",
  "performance_waiting",
  "performance_completed",
  "all_performances_status",
  "all_scores_completed",
  "emergency_hide",
  // bình chọn khán giả
  "audience_vote_intro",
  "audience_vote_live",
  "audience_vote_closed",
  "audience_vote_verification",
  // công bố giải
  "awards_intro",
  "audience_award_shuffle",
  "award_reveal",
  "scorecard",
  "awards_summary",
] as const;

export type DisplayMode = (typeof DISPLAY_MODES)[number];

export function isDisplayMode(v: unknown): v is DisplayMode {
  return typeof v === "string" && (DISPLAY_MODES as readonly string[]).includes(v);
}

export interface LiveState {
  id: string;
  location: LocationCode;
  currentPerformanceId: string | null;
  nextPerformanceId: string | null;
  displayMode: DisplayMode;
  publicMessage: string | null;
  /** Giải đang trình chiếu. Chỉ có nghĩa ở các chế độ công bố. */
  currentAwardId: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

interface StateRow {
  id: string;
  location: LocationCode;
  current_performance_id: string | null;
  next_performance_id: string | null;
  display_mode: DisplayMode;
  public_message: string | null;
  current_award_id: string | null;
  updated_by: string | null;
  updated_at: string;
}

function toState(r: StateRow): LiveState {
  return {
    id: r.id,
    location: r.location,
    currentPerformanceId: r.current_performance_id,
    nextPerformanceId: r.next_performance_id,
    displayMode: r.display_mode,
    publicMessage: r.public_message,
    currentAwardId: r.current_award_id,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

/** Đọc state, tự tạo dòng standby nếu đầu cầu chưa có. */
export function getLiveState(location: LocationCode): LiveState {
  const existing = get<StateRow>(
    "select * from live_display_state where location = ?",
    location,
  );
  if (existing) return toState(existing);

  const t = now();
  run(
    "insert into live_display_state (id, location, display_mode, updated_at) " +
      "values (?, ?, 'standby', ?) on conflict (location) do nothing",
    uuid(),
    location,
    t,
  );
  return toState(
    get<StateRow>("select * from live_display_state where location = ?", location)!,
  );
}

export interface LiveStatePatch {
  displayMode?: DisplayMode;
  currentPerformanceId?: string | null;
  nextPerformanceId?: string | null;
  publicMessage?: string | null;
  currentAwardId?: string | null;
}

/**
 * Ghi state rồi báo cho LED.
 *
 * Đặt `currentPerformanceId` ở đây cũng đồng thời cập nhật cờ
 * `is_current_performance` trên `performances`, để hai chỗ không bao giờ nói
 * hai chuyện khác nhau về việc tiết mục nào đang diễn.
 */
export function setLiveState(
  location: LocationCode,
  patch: LiveStatePatch,
  updatedBy?: string | null,
): LiveState {
  return tx(() => {
    const current = getLiveState(location);
    const next: LiveState = {
      ...current,
      displayMode: patch.displayMode ?? current.displayMode,
      currentPerformanceId:
        patch.currentPerformanceId !== undefined
          ? patch.currentPerformanceId
          : current.currentPerformanceId,
      nextPerformanceId:
        patch.nextPerformanceId !== undefined
          ? patch.nextPerformanceId
          : current.nextPerformanceId,
      publicMessage:
        patch.publicMessage !== undefined ? patch.publicMessage : current.publicMessage,
      currentAwardId:
        patch.currentAwardId !== undefined
          ? patch.currentAwardId
          : current.currentAwardId,
    };

    const t = now();
    run(
      `update live_display_state set
         display_mode = ?, current_performance_id = ?, next_performance_id = ?,
         public_message = ?, current_award_id = ?, updated_by = ?, updated_at = ?
       where location = ?`,
      next.displayMode,
      next.currentPerformanceId,
      next.nextPerformanceId,
      next.publicMessage,
      next.currentAwardId,
      updatedBy ?? null,
      t,
      location,
    );

    if (patch.currentPerformanceId !== undefined) {
      setCurrent(location, patch.currentPerformanceId);
    }

    // `live_status` của tiết mục đi theo chế độ đang chiếu: Admin bấm một nút,
    // không phải hai.
    const target = next.currentPerformanceId;
    if (target) {
      if (next.displayMode === "performance") setLiveStatus(target, "performing");
      else if (
        next.displayMode === "judging_progress" ||
        next.displayMode === "performance_waiting" ||
        next.displayMode === "performance_completed"
      ) {
        setLiveStatus(target, "performed");
      }
    }

    publish({ type: "live_display_state_changed", location });
    return next;
  });
}
