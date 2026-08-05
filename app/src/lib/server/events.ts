import "server-only";

import type { LocationCode } from "@/lib/data";

/**
 * Kênh realtime in-process.
 *
 * Không có Supabase Realtime ở đây vì không có Supabase: cả hệ thống chạy trong
 * một tiến trình Node duy nhất, nên một EventEmitter là đủ và có ít thứ hỏng
 * hơn hẳn. Nếu sau này chuyển sang nhiều instance, chỗ cần thay là đúng file
 * này — `publish` đổi thành LISTEN/NOTIFY hoặc Supabase channel, phần còn lại
 * của app không biết gì.
 *
 * SGN và HAN là hai kênh tách rời. Không có subscriber nào nhận được cả hai.
 */

export type LiveEventType =
  | "score_draft_saved"
  | "score_submitted"
  | "score_locked"
  | "judging_progress_updated"
  | "performance_judging_completed"
  | "live_display_state_changed"
  // bình chọn khán giả
  | "voting_opened"
  | "vote_submitted"
  | "voting_closed"
  | "voting_verified"
  // công bố giải
  | "awards_ready"
  | "award_published";

export interface LiveEvent {
  type: LiveEventType;
  location: LocationCode;
  performanceId?: string;
  judgeId?: string;
  at: string;
}

type Listener = (event: LiveEvent) => void;

const KEY = Symbol.for("aha.talent.bus");

interface Bus {
  listeners: Map<LocationCode, Set<Listener>>;
  /** Tăng mỗi lần publish. Client dùng để biết mình có bỏ lỡ event nào không. */
  seq: number;
}

function bus(): Bus {
  const g = globalThis as unknown as Record<symbol, Bus | undefined>;
  return (g[KEY] ??= { listeners: new Map(), seq: 0 });
}

export function publish(event: Omit<LiveEvent, "at">): void {
  const b = bus();
  b.seq += 1;
  const full: LiveEvent = { ...event, at: new Date().toISOString() };
  const set = b.listeners.get(event.location);
  if (!set) return;
  for (const fn of set) {
    // Một subscriber chết không được kéo theo cả hệ thống: lỗi ở đây thường là
    // stream đã đóng mà chưa kịp gỡ listener.
    try {
      fn(full);
    } catch {
      set.delete(fn);
    }
  }
}

export function subscribe(location: LocationCode, fn: Listener): () => void {
  const b = bus();
  const set = b.listeners.get(location) ?? new Set<Listener>();
  set.add(fn);
  b.listeners.set(location, set);
  return () => {
    set.delete(fn);
  };
}

export function subscriberCount(location: LocationCode): number {
  return bus().listeners.get(location)?.size ?? 0;
}

export function currentSeq(): number {
  return bus().seq;
}
