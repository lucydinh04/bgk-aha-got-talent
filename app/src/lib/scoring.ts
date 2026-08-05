import { CRITERIA, type CriterionKey } from "./data";

/**
 * Công thức tính điểm — dùng chung cho client và server.
 *
 * Client cần nó để hiện tổng điểm realtime khi BGK kéo slider; server cần nó vì
 * không bao giờ tin con số client gửi lên. Cùng một hàm, nên hai bên không thể
 * lệch nhau.
 */

export type ScoreValues = Partial<Record<CriterionKey, number>>;

/** Tổng trọng số phải bằng 1 — kiểm ngay lúc nạp module, không đợi tới runtime. */
const WEIGHT_SUM = CRITERIA.reduce((n, c) => n + c.weight, 0);
if (Math.abs(WEIGHT_SUM - 1) > 1e-9) {
  throw new Error(
    `Tổng trọng số tiêu chí phải bằng 1, đang là ${WEIGHT_SUM}. Sửa CRITERIA trong lib/data.ts.`,
  );
}

/** Một điểm hợp lệ: số hữu hạn, 0..100. Chuỗi rỗng và NaN đều không hợp lệ. */
export function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Ép về số hợp lệ, hoặc `undefined` nếu không đọc được.
 * `undefined` nghĩa là CHƯA CHẤM — khác hẳn với 0 điểm.
 */
export function parseScore(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, n));
}

export function filledCount(values: ScoreValues): number {
  return CRITERIA.filter((c) => isValidScore(values[c.key])).length;
}

export function isComplete(values: ScoreValues): boolean {
  return filledCount(values) === CRITERIA.length;
}

/**
 * Tổng điểm có trọng số, làm tròn 2 chữ số. Trả `null` khi còn thiếu tiêu chí —
 * một tổng điểm tính từ dữ liệu thiếu là con số sai, không phải con số tạm.
 */
export function computeTotal(values: ScoreValues): number | null {
  if (!isComplete(values)) return null;
  const sum = CRITERIA.reduce((acc, c) => acc + (values[c.key] as number) * c.weight, 0);
  return Math.round(sum * 100) / 100;
}

/** Danh sách tiêu chí còn thiếu, để báo lỗi nói rõ thiếu cái gì. */
export function missingCriteria(values: ScoreValues): string[] {
  return CRITERIA.filter((c) => !isValidScore(values[c.key])).map((c) => c.label);
}

/* ── Chuyển đổi giữa key tiêu chí và tên cột trong bảng scores ────────────── */

export type ScoreColumns = {
  creativity_score: number | null;
  performance_quality_score: number | null;
  transformation_score: number | null;
  stage_presence_score: number | null;
  completion_score: number | null;
};

export function toColumns(values: ScoreValues): ScoreColumns {
  const out = {} as Record<string, number | null>;
  for (const c of CRITERIA) {
    const v = values[c.key];
    out[c.column] = isValidScore(v) ? v : null;
  }
  return out as ScoreColumns;
}

export function fromColumns(row: Partial<ScoreColumns> | null | undefined): ScoreValues {
  const out: ScoreValues = {};
  if (!row) return out;
  for (const c of CRITERIA) {
    const v = row[c.column];
    if (isValidScore(v)) out[c.key] = v;
  }
  return out;
}
