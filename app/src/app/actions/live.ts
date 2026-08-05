"use server";

import { revalidatePath } from "next/cache";

import { toLocation } from "@/lib/data";
import { isDisplayMode, setLiveState, type DisplayMode } from "@/lib/server/live";
import { listApproved } from "@/lib/server/performances";
import { lockLocation, lockPerformanceScores } from "@/lib/server/scores";
import { requireAdmin } from "@/lib/server/session";

/**
 * Live Control ghi vào `live_display_state`; LED nghe DB.
 *
 * Không action nào ở đây đặt được chế độ công bố giải — `isDisplayMode` chỉ
 * nhận chín giá trị của Phase 3, và bảng cũng chỉ nhận đúng chín giá trị đó.
 * Hai lớp chặn cho cùng một luật, vì đây là luật mà hỏng thì hỏng trước mặt cả
 * hội trường.
 */

export interface ControlResult {
  ok: boolean;
  error?: string;
}

async function guard(slug: string) {
  const location = toLocation(slug);
  if (!location) return { error: "Đầu cầu không hợp lệ." as const };
  const session = await requireAdmin(location);
  if (!session) return { error: "Phiên Admin đã hết hạn. Đăng nhập lại." as const };
  return { location, session };
}

export async function setDisplayModeAction(
  slug: string,
  mode: string,
): Promise<ControlResult> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  if (!isDisplayMode(mode)) {
    return { ok: false, error: `Chế độ "${mode}" không dùng được ở phase này.` };
  }

  setLiveState(ctx.location, { displayMode: mode as DisplayMode }, ctx.session.userId);
  revalidatePath(`/live/${slug}`);
  return { ok: true };
}

export async function setCurrentPerformanceAction(
  slug: string,
  performanceId: string | null,
): Promise<ControlResult> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  if (performanceId) {
    const exists = listApproved(ctx.location).some((p) => p.id === performanceId);
    if (!exists) {
      return { ok: false, error: "Tiết mục không thuộc đầu cầu này hoặc chưa được duyệt." };
    }
  }

  setLiveState(ctx.location, { currentPerformanceId: performanceId }, ctx.session.userId);
  revalidatePath(`/live/${slug}`);
  return { ok: true };
}

/** Chuyển sang tiết mục kế tiếp theo rundown, kèm chế độ LED muốn hiện. */
export async function stepPerformanceAction(
  slug: string,
  direction: "next" | "prev",
  mode?: string,
): Promise<ControlResult> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const rows = listApproved(ctx.location);
  if (!rows.length) return { ok: false, error: "Chưa có tiết mục nào được duyệt." };

  const currentIdx = rows.findIndex((p) => p.isCurrentPerformance);
  const nextIdx =
    currentIdx < 0
      ? 0
      : Math.min(rows.length - 1, Math.max(0, currentIdx + (direction === "next" ? 1 : -1)));

  setLiveState(
    ctx.location,
    {
      currentPerformanceId: rows[nextIdx].id,
      ...(mode && isDisplayMode(mode) ? { displayMode: mode as DisplayMode } : {}),
    },
    ctx.session.userId,
  );
  revalidatePath(`/live/${slug}`);
  return { ok: true };
}

export async function setPublicMessageAction(
  slug: string,
  message: string,
): Promise<ControlResult> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const trimmed = message.trim();
  setLiveState(ctx.location, { publicMessage: trimmed || null }, ctx.session.userId);
  revalidatePath(`/live/${slug}`);
  return { ok: true };
}

/**
 * Ẩn khẩn cấp. Chỉ đổi chế độ hiển thị — không đụng vào điểm, không đụng vào
 * tiết mục hiện tại, nên bấm nhầm thì bấm lại là xong.
 */
export async function emergencyHideAction(slug: string): Promise<ControlResult> {
  return setDisplayModeAction(slug, "emergency_hide");
}

/* ── Khoá điểm ───────────────────────────────────────────────────────────── */

export async function lockPerformanceAction(
  slug: string,
  performanceId: string,
): Promise<ControlResult & { locked?: number }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const exists = listApproved(ctx.location).some((p) => p.id === performanceId);
  if (!exists) return { ok: false, error: "Tiết mục không thuộc đầu cầu này." };

  return { ok: true, locked: lockPerformanceScores(performanceId) };
}

export async function lockLocationAction(
  slug: string,
): Promise<ControlResult & { locked?: number }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  return { ok: true, locked: lockLocation(ctx.location) };
}
