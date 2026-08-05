"use server";

import { toLocation, type CriterionKey } from "@/lib/data";
import { parseScore, type ScoreValues } from "@/lib/scoring";
import { byCode } from "@/lib/server/performances";
import {
  ScoreError,
  findScore,
  saveDraft,
  submitScore,
  type ScoreStatus,
} from "@/lib/server/scores";
import { requireJudge } from "@/lib/server/session";

/**
 * Cửa duy nhất để điểm đi vào hệ thống.
 *
 * Mỗi action tự kiểm tra phiên và tự kiểm tra phân công — không tin bất cứ thứ
 * gì client gửi lên, kể cả `judgeId`. Client không gửi `judgeId`: nó lấy từ
 * cookie đã ký.
 */

export interface SaveResult {
  ok: boolean;
  status?: ScoreStatus;
  total?: number | null;
  savedAt?: string;
  /** Thông báo đọc được cho BGK. Rỗng nghĩa là lỗi hệ thống, nên bảo thử lại. */
  error?: string;
  /** true khi server nhận ra đây là lần gửi lặp của cùng một thao tác. */
  duplicate?: boolean;
}

interface Payload {
  locationSlug: string;
  code: string;
  values: Partial<Record<CriterionKey, number | null>>;
  highlight?: string | null;
  improvement?: string | null;
  privateNote?: string | null;
}

/** Lọc payload client thành giá trị hợp lệ. Số rác bị bỏ, không bị ép về 0. */
function clean(values: Payload["values"]): ScoreValues {
  const out: ScoreValues = {};
  for (const [key, raw] of Object.entries(values)) {
    const n = parseScore(raw);
    if (n !== undefined) out[key as CriterionKey] = n;
  }
  return out;
}

async function context(locationSlug: string, code: string) {
  const location = toLocation(locationSlug);
  if (!location) return { error: "Đường link không hợp lệ." as const };

  const session = await requireJudge(location);
  if (!session) return { error: "Phiên đăng nhập đã hết hạn. Đăng nhập lại." as const };

  const performance = byCode(code);
  if (!performance || performance.location !== location) {
    return { error: "Không tìm thấy tiết mục." as const };
  }
  if (performance.reviewStatus !== "approved") {
    return { error: "Tiết mục chưa được Ban Tổ chức duyệt." as const };
  }

  return { session, performance };
}

export async function saveDraftAction(payload: Payload): Promise<SaveResult> {
  const ctx = await context(payload.locationSlug, payload.code);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  try {
    const row = saveDraft({
      judgeId: ctx.session.userId,
      performanceId: ctx.performance.id,
      values: clean(payload.values),
      comments: {
        highlight: payload.highlight ?? null,
        improvement: payload.improvement ?? null,
        privateNote: payload.privateNote ?? null,
      },
    });
    return { ok: true, status: row.status, total: row.total_score, savedAt: row.updated_at };
  } catch (err) {
    if (err instanceof ScoreError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function submitScoreAction(
  payload: Payload & { idempotencyKey: string },
): Promise<SaveResult> {
  const ctx = await context(payload.locationSlug, payload.code);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  if (!payload.idempotencyKey) {
    return { ok: false, error: "Thiếu khoá chống gửi trùng." };
  }

  try {
    const { score, duplicate } = submitScore({
      judgeId: ctx.session.userId,
      performanceId: ctx.performance.id,
      values: clean(payload.values),
      comments: {
        highlight: payload.highlight ?? null,
        improvement: payload.improvement ?? null,
        privateNote: payload.privateNote ?? null,
      },
      idempotencyKey: payload.idempotencyKey,
    });
    return {
      ok: true,
      status: score.status,
      total: score.total_score,
      savedAt: score.updated_at,
      duplicate,
    };
  } catch (err) {
    if (err instanceof ScoreError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Đọc lại điểm của chính mình — dùng khi tab khôi phục sau lúc offline. */
export async function readMyScoreAction(
  locationSlug: string,
  code: string,
): Promise<{ values: ScoreValues; status: ScoreStatus | null; updatedAt: string | null }> {
  const ctx = await context(locationSlug, code);
  if ("error" in ctx) return { values: {}, status: null, updatedAt: null };

  const row = findScore(ctx.session.userId, ctx.performance.id);
  if (!row) return { values: {}, status: null, updatedAt: null };

  return {
    values: {
      creativity: row.creativity_score ?? undefined,
      quality: row.performance_quality_score ?? undefined,
      transformation: row.transformation_score ?? undefined,
      presence: row.stage_presence_score ?? undefined,
      completion: row.completion_score ?? undefined,
    },
    status: row.status,
    updatedAt: row.updated_at,
  };
}
