import "server-only";

import { all, get, now, run, tx, uuid } from "@/lib/db";
import type { LocationCode } from "@/lib/data";
import {
  computeTotal,
  fromColumns,
  isComplete,
  missingCriteria,
  toColumns,
  type ScoreColumns,
  type ScoreValues,
} from "@/lib/scoring";
import { publish } from "./events";

export type ScoreStatus = "draft" | "submitted" | "locked";

export interface ScoreRow extends ScoreColumns {
  id: string;
  judge_id: string;
  performance_id: string;
  location: LocationCode;
  total_score: number | null;
  highlight_comment: string | null;
  improvement_comment: string | null;
  private_note: string | null;
  status: ScoreStatus;
  submitted_at: string | null;
  locked_at: string | null;
  idempotency_key: string | null;
  updated_at: string;
}

export interface ScoreComments {
  highlight?: string | null;
  improvement?: string | null;
  privateNote?: string | null;
}

/**
 * Lỗi nghiệp vụ — phân biệt với lỗi hệ thống để UI biết nên hiện thông báo cho
 * BGK đọc hay nên hiện "thử lại".
 */
export class ScoreError extends Error {
  constructor(
    message: string,
    readonly code:
      | "locked"
      | "incomplete"
      | "not_assigned"
      | "already_submitted"
      | "invalid",
  ) {
    super(message);
    this.name = "ScoreError";
  }
}

const SELECT = `
  select id, judge_id, performance_id, location,
         creativity_score, performance_quality_score, transformation_score,
         stage_presence_score, completion_score, total_score,
         highlight_comment, improvement_comment, private_note,
         status, submitted_at, locked_at, idempotency_key, updated_at
  from scores
`;

export function findScore(
  judgeId: string,
  performanceId: string,
): ScoreRow | undefined {
  return get<ScoreRow>(
    `${SELECT} where judge_id = ? and performance_id = ?`,
    judgeId,
    performanceId,
  );
}

export function scoresOfJudge(judgeId: string): ScoreRow[] {
  return all<ScoreRow>(`${SELECT} where judge_id = ?`, judgeId);
}

export function scoresOfPerformance(performanceId: string): ScoreRow[] {
  return all<ScoreRow>(`${SELECT} where performance_id = ?`, performanceId);
}

export function isAssigned(judgeId: string, performanceId: string): boolean {
  return (
    get<{ n: number }>(
      "select count(*) as n from judge_assignments where judge_id = ? and performance_id = ?",
      judgeId,
      performanceId,
    )?.n ?? 0
  ) > 0;
}

function requireAssignment(judgeId: string, performanceId: string): {
  location: LocationCode;
} {
  const row = get<{ location: LocationCode }>(
    "select location from judge_assignments where judge_id = ? and performance_id = ?",
    judgeId,
    performanceId,
  );
  if (!row) {
    throw new ScoreError(
      "Bạn không được phân công chấm tiết mục này.",
      "not_assigned",
    );
  }
  return row;
}

/* ── Lưu nháp ────────────────────────────────────────────────────────────── */

/**
 * Autosave. Không đòi đủ 5 tiêu chí — nháp là nháp.
 *
 * Điểm đã gửi thì autosave dừng lại: sửa một điểm chính thức phải là hành động
 * có chủ ý của BGK (bấm Gửi lại), không phải hệ quả của việc chạm nhầm slider.
 */
export function saveDraft(input: {
  judgeId: string;
  performanceId: string;
  values: ScoreValues;
  comments?: ScoreComments;
  clientUpdatedAt?: string;
}): ScoreRow {
  const { location } = requireAssignment(input.judgeId, input.performanceId);

  return tx(() => {
    const existing = findScore(input.judgeId, input.performanceId);
    if (existing?.status === "locked") {
      throw new ScoreError("Điểm đã bị khóa, không sửa được nữa.", "locked");
    }
    if (existing?.status === "submitted") {
      throw new ScoreError(
        "Điểm đã gửi. Muốn đổi thì sửa rồi bấm Gửi lại.",
        "already_submitted",
      );
    }

    const cols = toColumns(input.values);
    const total = computeTotal(input.values);
    const t = now();

    if (existing) {
      run(
        `update scores set
           creativity_score = ?, performance_quality_score = ?, transformation_score = ?,
           stage_presence_score = ?, completion_score = ?, total_score = ?,
           highlight_comment = ?, improvement_comment = ?, private_note = ?,
           client_updated_at = ?, updated_at = ?
         where id = ?`,
        cols.creativity_score,
        cols.performance_quality_score,
        cols.transformation_score,
        cols.stage_presence_score,
        cols.completion_score,
        total,
        input.comments?.highlight ?? existing.highlight_comment,
        input.comments?.improvement ?? existing.improvement_comment,
        input.comments?.privateNote ?? existing.private_note,
        input.clientUpdatedAt ?? t,
        t,
        existing.id,
      );
    } else {
      run(
        `insert into scores
           (id, judge_id, performance_id, location,
            creativity_score, performance_quality_score, transformation_score,
            stage_presence_score, completion_score, total_score,
            highlight_comment, improvement_comment, private_note,
            status, client_updated_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        uuid(),
        input.judgeId,
        input.performanceId,
        location,
        cols.creativity_score,
        cols.performance_quality_score,
        cols.transformation_score,
        cols.stage_presence_score,
        cols.completion_score,
        total,
        input.comments?.highlight ?? null,
        input.comments?.improvement ?? null,
        input.comments?.privateNote ?? null,
        input.clientUpdatedAt ?? t,
        t,
        t,
      );
    }

    refreshJudgingStatus(input.performanceId);
    const saved = findScore(input.judgeId, input.performanceId)!;

    publish({
      type: "score_draft_saved",
      location,
      performanceId: input.performanceId,
      judgeId: input.judgeId,
    });
    publish({ type: "judging_progress_updated", location, performanceId: input.performanceId });

    return saved;
  });
}

/* ── Gửi chính thức ──────────────────────────────────────────────────────── */

/**
 * Gửi điểm. `idempotencyKey` do client sinh MỘT lần cho mỗi lần bấm nút: gửi
 * lại cùng key (mạng chập chờn, user bấm hai lần, offline queue replay) trả về
 * đúng bản ghi cũ thay vì tạo bản ghi thứ hai.
 */
export function submitScore(input: {
  judgeId: string;
  performanceId: string;
  values: ScoreValues;
  comments?: ScoreComments;
  idempotencyKey: string;
}): { score: ScoreRow; duplicate: boolean } {
  const { location } = requireAssignment(input.judgeId, input.performanceId);

  if (!isComplete(input.values)) {
    throw new ScoreError(
      `Còn thiếu tiêu chí: ${missingCriteria(input.values).join(", ")}.`,
      "incomplete",
    );
  }

  return tx(() => {
    const replay = get<ScoreRow>(
      `${SELECT} where idempotency_key = ?`,
      input.idempotencyKey,
    );
    if (replay) return { score: replay, duplicate: true };

    const existing = findScore(input.judgeId, input.performanceId);
    if (existing?.status === "locked") {
      throw new ScoreError("Điểm đã bị khóa, không sửa được nữa.", "locked");
    }

    const cols = toColumns(input.values);
    const total = computeTotal(input.values);
    if (total === null) {
      throw new ScoreError("Không tính được tổng điểm.", "invalid");
    }
    const t = now();

    if (existing) {
      run(
        `update scores set
           creativity_score = ?, performance_quality_score = ?, transformation_score = ?,
           stage_presence_score = ?, completion_score = ?, total_score = ?,
           highlight_comment = ?, improvement_comment = ?, private_note = ?,
           status = 'submitted', submitted_at = ?, idempotency_key = ?, updated_at = ?
         where id = ?`,
        cols.creativity_score,
        cols.performance_quality_score,
        cols.transformation_score,
        cols.stage_presence_score,
        cols.completion_score,
        total,
        input.comments?.highlight ?? existing.highlight_comment,
        input.comments?.improvement ?? existing.improvement_comment,
        input.comments?.privateNote ?? existing.private_note,
        existing.submitted_at ?? t,
        input.idempotencyKey,
        t,
        existing.id,
      );
    } else {
      run(
        `insert into scores
           (id, judge_id, performance_id, location,
            creativity_score, performance_quality_score, transformation_score,
            stage_presence_score, completion_score, total_score,
            highlight_comment, improvement_comment, private_note,
            status, submitted_at, idempotency_key, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?)`,
        uuid(),
        input.judgeId,
        input.performanceId,
        location,
        cols.creativity_score,
        cols.performance_quality_score,
        cols.transformation_score,
        cols.stage_presence_score,
        cols.completion_score,
        total,
        input.comments?.highlight ?? null,
        input.comments?.improvement ?? null,
        input.comments?.privateNote ?? null,
        t,
        input.idempotencyKey,
        t,
        t,
      );
    }

    const completed = refreshJudgingStatus(input.performanceId);
    const score = findScore(input.judgeId, input.performanceId)!;

    publish({
      type: "score_submitted",
      location,
      performanceId: input.performanceId,
      judgeId: input.judgeId,
    });
    publish({ type: "judging_progress_updated", location, performanceId: input.performanceId });
    if (completed) {
      publish({
        type: "performance_judging_completed",
        location,
        performanceId: input.performanceId,
      });
    }

    return { score, duplicate: false };
  });
}

/* ── Khóa ────────────────────────────────────────────────────────────────── */

export function lockPerformanceScores(performanceId: string): number {
  return tx(() => {
    const t = now();
    const rows = scoresOfPerformance(performanceId).filter(
      (s) => s.status === "submitted",
    );
    for (const s of rows) {
      run(
        "update scores set status = 'locked', locked_at = ?, updated_at = ? where id = ?",
        t,
        t,
        s.id,
      );
    }
    if (rows.length) {
      publish({
        type: "score_locked",
        location: rows[0].location,
        performanceId,
      });
      publish({
        type: "judging_progress_updated",
        location: rows[0].location,
        performanceId,
      });
    }
    return rows.length;
  });
}

export function lockLocation(location: LocationCode): number {
  return tx(() => {
    const t = now();
    const rows = all<{ id: string }>(
      "select id from scores where location = ? and status = 'submitted'",
      location,
    );
    for (const r of rows) {
      run(
        "update scores set status = 'locked', locked_at = ?, updated_at = ? where id = ?",
        t,
        t,
        r.id,
      );
    }
    if (rows.length) {
      publish({ type: "score_locked", location });
      publish({ type: "judging_progress_updated", location });
    }
    return rows.length;
  });
}

/* ── Tiến độ ─────────────────────────────────────────────────────────────── */

export interface PerformanceProgress {
  performanceId: string;
  assigned: number;
  submitted: number;
  drafts: number;
  missing: number;
  complete: boolean;
}

export function progressOfPerformance(performanceId: string): PerformanceProgress {
  const assigned =
    get<{ n: number }>(
      "select count(*) as n from judge_assignments where performance_id = ?",
      performanceId,
    )?.n ?? 0;
  const submitted =
    get<{ n: number }>(
      "select count(*) as n from scores where performance_id = ? and status in ('submitted','locked')",
      performanceId,
    )?.n ?? 0;
  const drafts =
    get<{ n: number }>(
      "select count(*) as n from scores where performance_id = ? and status = 'draft'",
      performanceId,
    )?.n ?? 0;

  return {
    performanceId,
    assigned,
    submitted,
    drafts,
    missing: Math.max(0, assigned - submitted),
    complete: assigned > 0 && submitted >= assigned,
  };
}

/**
 * Đồng bộ `performances.judging_status` theo số điểm thực tế.
 *
 * Trạng thái này là dẫn xuất, không phải thứ ai đó set bằng tay — nên nó được
 * tính lại sau mỗi lần điểm thay đổi, và không có API nào cho phép ghi thẳng.
 * Trả về true nếu tiết mục vừa chuyển sang 'completed'.
 */
export function refreshJudgingStatus(performanceId: string): boolean {
  const p = progressOfPerformance(performanceId);
  const previous = get<{ judging_status: string }>(
    "select judging_status from performances where id = ?",
    performanceId,
  )?.judging_status;

  const next = p.complete
    ? "completed"
    : p.submitted > 0 || p.drafts > 0
      ? "in_progress"
      : "not_started";

  if (next !== previous) {
    run(
      "update performances set judging_status = ?, updated_at = ? where id = ?",
      next,
      now(),
      performanceId,
    );
  }
  return next === "completed" && previous !== "completed";
}

/** Điểm trung bình tạm tính — CHỈ Admin. Không có đường nào xuống LED. */
export function averageOf(performanceId: string): {
  avg: number | null;
  counted: number;
} {
  const row = get<{ avg: number | null; n: number }>(
    "select avg(total_score) as avg, count(*) as n from scores " +
      "where performance_id = ? and status in ('submitted','locked') and total_score is not null",
    performanceId,
  );
  return {
    avg: row?.avg != null ? Math.round(row.avg * 100) / 100 : null,
    counted: row?.n ?? 0,
  };
}

export function valuesOf(row: ScoreRow | undefined): ScoreValues {
  return fromColumns(row);
}
