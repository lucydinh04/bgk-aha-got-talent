"use server";

import { revalidatePath } from "next/cache";

import { toLocation } from "@/lib/data";
import {
  AwardError,
  createJudgingSnapshot,
  ensureAwards,
  listAwards,
  publishAward,
  publishBlockers,
} from "@/lib/server/awards";
import { setLiveState, type DisplayMode } from "@/lib/server/live";
import { requireAdmin } from "@/lib/server/session";
import { latestSnapshot } from "@/lib/server/voting";

/**
 * Công bố giải.
 *
 * Mọi action ở đây đều là hành động CÓ CHỦ Ý của Admin. Không có action nào tự
 * chạy theo sự kiện, không có timer nào gọi chúng — LED không bao giờ tự công
 * bố kết quả, kể cả khi mọi điều kiện đã đủ.
 */

async function guard(slug: string) {
  const location = toLocation(slug);
  if (!location) return { error: "Đầu cầu không hợp lệ." as const };
  const session = await requireAdmin(location);
  if (!session) return { error: "Phiên Admin đã hết hạn." as const };
  return { location, session };
}

export async function loadAwardsAction(slug: string) {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  return {
    ok: true as const,
    awards: ensureAwards(ctx.location),
    blockers: publishBlockers(ctx.location),
    hasJudgingSnapshot: Boolean(latestSnapshot(ctx.location, "judging")),
    hasAudienceSnapshot: Boolean(latestSnapshot(ctx.location, "audience")),
  };
}

/**
 * Publishing Snapshot: chốt bảng điểm và khoá toàn bộ điểm của đầu cầu.
 * Đây là điểm không quay lại được — nên nó có bước xác nhận riêng ở UI.
 */
export async function createSnapshotAction(
  slug: string,
): Promise<{ ok: boolean; error?: string; ties?: number }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const blockers = publishBlockers(ctx.location);
  if (blockers.length) {
    return { ok: false, error: `Chưa đủ điều kiện: ${blockers.join(" · ")}` };
  }

  const { payload } = createJudgingSnapshot(ctx.location, ctx.session.userId);
  revalidatePath(`/admin/${slug}/live-control`);
  return { ok: true, ties: payload.ties.length };
}

export async function publishAwardAction(
  slug: string,
  awardId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  try {
    const award = publishAward(awardId, ctx.session.userId);
    // Đưa giải vừa công bố lên LED. Winner đi ra được là vì `published_at` vừa
    // được đặt ở dòng trên — không phải vì display_mode đổi.
    setLiveState(
      ctx.location,
      {
        currentAwardId: award.id,
        displayMode: "award_reveal",
      },
      ctx.session.userId,
    );
    revalidatePath(`/admin/${slug}/live-control`);
    revalidatePath(`/live/${slug}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AwardError ? err.message : "Không công bố được giải.",
    };
  }
}

/**
 * Đưa LED sang một màn của phần công bố mà KHÔNG công bố gì thêm.
 * Dùng cho shuffle, scorecard, awards_intro, awards_summary.
 */
export async function setAwardStageAction(
  slug: string,
  mode: DisplayMode,
  awardId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const allowed: DisplayMode[] = [
    "awards_intro",
    "audience_award_shuffle",
    "award_reveal",
    "scorecard",
    "awards_summary",
  ];
  if (!allowed.includes(mode)) {
    return { ok: false, error: "Chế độ không thuộc phần công bố giải." };
  }

  // Shuffle chạy TRƯỚC khi công bố, nên nó không được mang theo award nào —
  // gán currentAwardId ở đây là mở đúng cái cửa mà shuffle sinh ra để đóng.
  if (mode === "audience_award_shuffle") {
    setLiveState(ctx.location, { displayMode: mode, currentAwardId: null }, ctx.session.userId);
    revalidatePath(`/live/${slug}`);
    return { ok: true };
  }

  if ((mode === "award_reveal" || mode === "scorecard") && awardId) {
    const award = listAwards(ctx.location).find((a) => a.id === awardId);
    if (!award) return { ok: false, error: "Không tìm thấy giải." };
    if (!award.publishedAt) {
      return { ok: false, error: "Giải này chưa được công bố." };
    }
    setLiveState(
      ctx.location,
      { displayMode: mode, currentAwardId: awardId },
      ctx.session.userId,
    );
  } else {
    setLiveState(ctx.location, { displayMode: mode }, ctx.session.userId);
  }

  revalidatePath(`/live/${slug}`);
  return { ok: true };
}
