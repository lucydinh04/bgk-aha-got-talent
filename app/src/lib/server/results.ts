import "server-only";

import { CRITERIA, type LocationCode } from "@/lib/data";
import { get, all } from "@/lib/db";
import {
  byId,
  displayNameOf,
  listApproved,
  teamLabelOf,
  type PerformanceRecord,
} from "./performances";
import {
  averageOf,
  progressOfPerformance,
  scoresOfPerformance,
  type ScoreRow,
} from "./scores";
import { judgesAssignedTo } from "./users";

/* ═══════════════════════════════════════════════════════════════════════════
   TỔNG HỢP ĐIỂM BAN GIÁM KHẢO — chỉ Admin

   Module này KHÔNG tính điểm. Công thức trọng số nằm ở tầng ghi điểm và kết quả
   đã chốt trong cột `scores.total_score`; ở đây chỉ đọc lại. Tính lại tổng ở
   tầng đọc là cách chắc chắn nhất để một ngày nào đó bảng Admin và phiếu của BGK
   nói hai con số khác nhau.

   BA LUẬT VỀ ĐIỂM TRUNG BÌNH — cả ba đã có sẵn trong `averageOf`, ghi lại đây vì
   chúng là thứ dễ bị phá khi ai đó "sửa cho gọn":

     1. Chỉ tính `status in ('submitted','locked')`. Draft là điểm chưa gửi;
        đưa vào trung bình nghĩa là công bố một con số BGK chưa xác nhận.
     2. BGK chưa chấm KHÔNG tính là 0. Họ không có dòng trong `scores`, nên mẫu
        số là số phiếu đã gửi, không phải số BGK được phân công. 6/7 BGK gửi thì
        chia cho 6.
     3. Chưa có phiếu nào thì trả `null`, không trả 0. Màn hình phải hiện "—".
   ═══════════════════════════════════════════════════════════════════════════ */

/** Trạng thái chấm của một tiết mục. Dẫn xuất, không ai set bằng tay. */
export type ResultStatus = "not_scored" | "in_progress" | "completed" | "locked";

export interface OverviewRow {
  id: string;
  order: number | null;
  code: string;
  name: string;
  team: string;
  performanceType: string | null;
  assigned: number;
  submitted: number;
  drafts: number;
  /** 0–100, làm tròn. `assigned = 0` thì 0 chứ không phải NaN. */
  progressPct: number;
  avg: number | null;
  status: ResultStatus;
}

export interface ResultsOverview {
  location: LocationCode;
  rows: OverviewRow[];
  kpi: {
    total: number;
    completed: number;
    pending: number;
    progressPct: number;
    topAvg: number | null;
  };
  attention: {
    /** Số tiết mục còn thiếu phiếu. */
    incompletePerformances: number;
    /** Số BGK chưa gửi hết phần được phân công. */
    judgesIncomplete: number;
  };
  updatedAt: string;
}

function lockedCountOf(performanceId: string): number {
  return (
    get<{ n: number }>(
      "select count(*) as n from scores where performance_id = ? and status = 'locked'",
      performanceId,
    )?.n ?? 0
  );
}

function statusOf(
  assigned: number,
  submitted: number,
  locked: number,
): ResultStatus {
  // Khoá là trạng thái cuối: mọi phiếu hợp lệ đã locked và không còn ai thiếu.
  if (assigned > 0 && locked >= assigned) return "locked";
  if (submitted === 0) return "not_scored";
  if (submitted < assigned) return "in_progress";
  return "completed";
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function overviewRowOf(p: PerformanceRecord): OverviewRow {
  const prog = progressOfPerformance(p.id);
  const { avg } = averageOf(p.id);
  const locked = lockedCountOf(p.id);
  return {
    id: p.id,
    order: p.performanceOrder,
    code: p.registrationCode,
    name: displayNameOf(p),
    team: teamLabelOf(p),
    performanceType: p.performanceType,
    assigned: prog.assigned,
    submitted: prog.submitted,
    drafts: prog.drafts,
    progressPct: pct(prog.submitted, prog.assigned),
    avg,
    status: statusOf(prog.assigned, prog.submitted, locked),
  };
}

export function buildResultsOverview(location: LocationCode): ResultsOverview {
  // `listApproved` — tiết mục chưa duyệt hoặc bị từ chối không vào bảng tổng hợp.
  const rows = listApproved(location).map(overviewRowOf);

  const totalAssigned = rows.reduce((n, r) => n + r.assigned, 0);
  const totalSubmitted = rows.reduce((n, r) => n + r.submitted, 0);
  const averages = rows.map((r) => r.avg).filter((v): v is number => v != null);

  /*
   * BGK chưa hoàn tất: đếm theo người, không theo phiếu. Một BGK được phân công
   * 4 tiết mục mà gửi 3 thì tính là một người chưa xong, không phải một phiếu
   * thiếu — đó là con số BTC cần để biết phải đi nhắc bao nhiêu người.
   */
  const judgesIncomplete =
    get<{ n: number }>(
      `select count(*) as n from (
         select a.judge_id
         from judge_assignments a
         join performances p on p.id = a.performance_id
         left join scores s
           on s.judge_id = a.judge_id and s.performance_id = a.performance_id
              and s.status in ('submitted','locked')
         where a.location = ? and p.review_status = 'approved'
         group by a.judge_id
         having count(s.id) < count(a.id)
       )`,
      location,
    )?.n ?? 0;

  return {
    location,
    rows,
    kpi: {
      total: rows.length,
      completed: rows.filter(
        (r) => r.status === "completed" || r.status === "locked",
      ).length,
      pending: rows.filter(
        (r) => r.status === "not_scored" || r.status === "in_progress",
      ).length,
      progressPct: pct(totalSubmitted, totalAssigned),
      topAvg: averages.length ? Math.max(...averages) : null,
    },
    attention: {
      incompletePerformances: rows.filter(
        (r) => r.status === "not_scored" || r.status === "in_progress",
      ).length,
      judgesIncomplete,
    },
    updatedAt: new Date().toISOString(),
  };
}

/* ── Tầng 2 · chi tiết một tiết mục ─────────────────────────────────────── */

export type JudgeScoreStatus = "not_scored" | "draft" | "submitted" | "locked";

export interface JudgeScoreRow {
  judgeId: string;
  name: string;
  title: string | null;
  /** Cùng thứ tự với `CRITERIA`. `null` = BGK chưa nhập tiêu chí đó. */
  values: (number | null)[];
  total: number | null;
  status: JudgeScoreStatus;
  submittedAt: string | null;
  comments: {
    highlight: string | null;
    improvement: string | null;
    privateNote: string | null;
  } | null;
}

export interface PerformanceResult {
  performance: PerformanceRecord;
  name: string;
  team: string;
  judges: JudgeScoreRow[];
  kpi: {
    assigned: number;
    submitted: number;
    progressPct: number;
    avg: number | null;
    max: number | null;
    min: number | null;
    /** max − min. `null` khi có ít hơn hai phiếu — một phiếu không có độ chênh. */
    spread: number | null;
  };
  /** Trung bình từng tiêu chí, cùng thứ tự `CRITERIA`. `null` = chưa đủ dữ liệu. */
  criteriaAverages: (number | null)[];
  status: ResultStatus;
  updatedAt: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function judgeStatusOf(row: ScoreRow | undefined): JudgeScoreStatus {
  if (!row) return "not_scored";
  return row.status;
}

/**
 * Chi tiết một tiết mục.
 *
 * Danh sách BGK lấy từ `judge_assignments`, KHÔNG từ `scores`. Nghĩa là BGK được
 * phân công mà chưa chấm vẫn có một dòng trong bảng với toàn dấu "—". Nếu lấy từ
 * `scores` thì người chưa chấm biến mất khỏi bảng, và đó chính là thông tin BTC
 * cần thấy nhất.
 */
export function buildPerformanceResult(
  performanceId: string,
): PerformanceResult | undefined {
  const performance = byId(performanceId);
  if (!performance) return undefined;

  const scores = scoresOfPerformance(performanceId);
  const byJudge = new Map(scores.map((s) => [s.judge_id, s]));

  const judges: JudgeScoreRow[] = judgesAssignedTo(performanceId).map((j) => {
    const row = byJudge.get(j.id);
    const counted = row?.status === "submitted" || row?.status === "locked";
    return {
      judgeId: j.id,
      name: j.full_name,
      title: j.title,
      values: CRITERIA.map((c) => {
        const v = row?.[c.column as keyof ScoreRow];
        return typeof v === "number" ? v : null;
      }),
      total: row?.total_score ?? null,
      status: judgeStatusOf(row),
      submittedAt: row?.submitted_at ?? null,
      // Nhận xét chỉ hiện khi phiếu đã gửi. Draft là bản nháp của BGK; đọc nó
      // trước khi họ bấm Gửi là đọc thứ chưa được đồng ý công bố.
      comments: counted
        ? {
            highlight: row?.highlight_comment ?? null,
            improvement: row?.improvement_comment ?? null,
            privateNote: row?.private_note ?? null,
          }
        : null,
    };
  });

  const prog = progressOfPerformance(performanceId);
  const { avg } = averageOf(performanceId);
  const locked = lockedCountOf(performanceId);

  // Chỉ phiếu đã gửi tham gia mọi phép tính dưới đây.
  const countedTotals = scores
    .filter((s) => s.status === "submitted" || s.status === "locked")
    .map((s) => s.total_score)
    .filter((v): v is number => v != null);

  const criteriaAverages = CRITERIA.map((c) => {
    const vals = scores
      .filter((s) => s.status === "submitted" || s.status === "locked")
      .map((s) => s[c.column as keyof ScoreRow])
      .filter((v): v is number => typeof v === "number");
    return vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  return {
    performance,
    name: displayNameOf(performance),
    team: teamLabelOf(performance),
    judges,
    kpi: {
      assigned: prog.assigned,
      submitted: prog.submitted,
      progressPct: pct(prog.submitted, prog.assigned),
      avg,
      max: countedTotals.length ? round2(Math.max(...countedTotals)) : null,
      min: countedTotals.length ? round2(Math.min(...countedTotals)) : null,
      spread:
        countedTotals.length > 1
          ? round2(Math.max(...countedTotals) - Math.min(...countedTotals))
          : null,
    },
    criteriaAverages,
    status: statusOf(prog.assigned, prog.submitted, locked),
    updatedAt: new Date().toISOString(),
  };
}

/* ── Export CSV ─────────────────────────────────────────────────────────── */

/**
 * Một ô CSV. Bọc ngoặc kép khi có dấu phẩy, ngoặc kép hoặc xuống dòng; ngoặc kép
 * bên trong nhân đôi. Đây là RFC 4180, không phải quy ước tự nghĩ.
 */
function cell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csv = (rows: (string | number | null | undefined)[][]): string =>
  // BOM UTF-8 ở đầu file: không có nó Excel trên Windows đọc tiếng Việt thành
  // ký tự rác, và BTC sẽ mở file này bằng Excel chứ không phải bằng editor.
  "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

const STATUS_TEXT: Record<ResultStatus, string> = {
  not_scored: "Chưa chấm",
  in_progress: "Đang chấm",
  completed: "Đã hoàn tất",
  locked: "Đã khoá",
};

const JUDGE_STATUS_TEXT: Record<JudgeScoreStatus, string> = {
  not_scored: "Chưa chấm",
  draft: "Đang chấm",
  submitted: "Đã gửi",
  locked: "Đã khoá",
};

export function overviewCsv(location: LocationCode): string {
  const { rows } = buildResultsOverview(location);
  return csv([
    [
      "STT",
      "Mã đăng ký",
      "Tiết mục",
      "Đầu cầu",
      "Loại hình",
      "BGK được phân công",
      "BGK đã gửi",
      "Tiến độ (%)",
      "Điểm trung bình",
      "Trạng thái",
    ],
    ...rows.map((r) => [
      r.order,
      r.code,
      r.name,
      location,
      r.performanceType,
      r.assigned,
      r.submitted,
      r.progressPct,
      r.avg,
      STATUS_TEXT[r.status],
    ]),
  ]);
}

export function performanceCsv(performanceId: string): string | undefined {
  const d = buildPerformanceResult(performanceId);
  if (!d) return undefined;
  return csv([
    [
      "Tiết mục",
      "Đầu cầu",
      "BGK",
      ...CRITERIA.map((c) => `${c.label} (${Math.round(c.weight * 100)}%)`),
      "Tổng điểm",
      "Trạng thái",
      "Thời điểm gửi",
    ],
    ...d.judges.map((j) => [
      d.name,
      d.performance.location,
      j.name,
      ...j.values,
      j.total,
      JUDGE_STATUS_TEXT[j.status],
      j.submittedAt,
    ]),
    [],
    [
      "TRUNG BÌNH BAN GIÁM KHẢO",
      d.performance.location,
      `${d.kpi.submitted}/${d.kpi.assigned} BGK đã gửi`,
      ...d.criteriaAverages,
      d.kpi.avg,
      STATUS_TEXT[d.status],
      "",
    ],
  ]);
}

/** Tên file tải về. Dùng chung cho cả hai loại export. */
export function csvFilename(location: LocationCode, suffix?: string): string {
  const base = `aha-got-talent-${location.toLowerCase()}-results`;
  return suffix ? `${base}-${suffix}.csv` : `${base}.csv`;
}

/** Nhãn tiếng Việt cho trạng thái — UI và CSV dùng cùng một nguồn. */
export const RESULT_STATUS_TEXT = STATUS_TEXT;
export const JUDGE_SCORE_STATUS_TEXT = JUDGE_STATUS_TEXT;

/** Danh sách tiêu chí kèm trọng số, để UI không phải tự ghép lại. */
export const CRITERIA_META = CRITERIA.map((c) => ({
  key: c.key,
  label: c.label,
  weightPct: Math.round(c.weight * 100),
}));

/** Dùng bởi trang tầng 1 khi cần liệt kê id hợp lệ của một đầu cầu. */
export function approvedIds(location: LocationCode): string[] {
  return all<{ id: string }>(
    "select id from performances where location = ? and review_status = 'approved' order by performance_order",
    location,
  ).map((r) => r.id);
}
