import "server-only";

import type { LocationCode, Performance } from "@/lib/data";
import { baseUrl } from "@/lib/baseUrl";
import { awardById, listAwards, scorecardFor } from "./awards";
import { getLiveState, type DisplayMode } from "./live";
import {
  activeSession,
  participantCount,
  sessionPerformances,
} from "./voting";
import {
  displayNameOf,
  listApproved,
  teamLabelOf,
  type PerformanceRecord,
} from "./performances";
import { averageOf, progressOfPerformance, scoresOfJudge } from "./scores";
import { assignedPerformanceIds, listJudges, type UserRow } from "./users";

/* ═══ LED ══════════════════════════════════════════════════════════════════
 *
 * `LedSnapshot` là TOÀN BỘ những gì đi xuống màn LED. Nó không có trường nào
 * chứa điểm — không total, không trung bình, không hạng, không "BGK nào chưa
 * chấm". Bất biến đó được giữ ở đây, tại một hàm, thay vì rải ra trong hai chục
 * component: muốn lộ điểm lên sân khấu thì phải sửa đúng file này.
 */

/** Chỉ những field LED cần. Ép về `Performance` để component Phase 2 dùng lại. */
export interface LedPerformance extends Performance {
  id: string;
}

/**
 * Bình chọn — phần LED được phép thấy khi phiếu còn mở.
 *
 * Có `participants` (tổng người tham gia) và KHÔNG có gì khác. Không phiếu từng
 * tiết mục, không xếp hạng, không tiết mục dẫn đầu. Kiểu dữ liệu này không có
 * chỗ nào để nhét những thứ đó vào.
 */
export interface LedVoting {
  /** Id phiên — công khai được, chỉ là khoá đối chiếu giữa LED, Admin và lá phiếu. */
  sessionId: string;
  status: "open" | "closed" | "verified";
  participants: number;
  maxSelections: number;
  /** ISO từ server — LED tự đếm ngược theo mốc này, không tin giờ máy chiếu. */
  closesAt: string | null;
  serverNow: string;
  voteUrl: string;
}

/**
 * Giải đang trình chiếu.
 *
 * `winner` chỉ khác null khi giải đã `published_at`. Chưa công bố thì trường
 * này rỗng — nên shuffle, awards_intro hay bất kỳ chế độ nào chạy trước lúc
 * Admin bấm công bố đều không có dữ liệu winner để mà lộ.
 */
export interface LedAward {
  id: string;
  nameEn: string;
  nameVi: string;
  source: "judging" | "audience_vote";
  winner: LedPerformance | null;
  /** Chỉ có ở chế độ `scorecard`, và chỉ với giải do BGK chấm. */
  scorecard: {
    rows: { label: string; weight: number; value: string }[];
    total: string;
  } | null;
}

export interface LedSnapshot {
  location: LocationCode;
  displayMode: DisplayMode;
  publicMessage: string | null;
  current: LedPerformance | null;
  next: LedPerformance | null;
  /** Số BGK đã gửi / tổng BGK được phân công cho tiết mục hiện tại. */
  progress: { submitted: number; assigned: number } | null;
  rows: { performance: LedPerformance; status: string }[];
  voting: LedVoting | null;
  award: LedAward | null;
  /** Danh sách card cho màn shuffle — thứ tự theo rundown, KHÔNG theo phiếu. */
  shuffleRows: LedPerformance[];
  /** Màn tổng kết: chỉ những giải ĐÃ công bố. */
  publishedAwards: { nameVi: string; performanceName: string }[];
  updatedAt: string;
}

function toLed(p: PerformanceRecord): LedPerformance {
  return {
    id: p.id,
    registrationCode: p.registrationCode,
    location: p.location,
    performanceOrder: p.performanceOrder,
    // Tên BTC chốt được ưu tiên; component vẫn đọc `performanceName` như cũ.
    performanceName: displayNameOf(p),
    participationType: p.participationType,
    performanceType: p.performanceType,
    durationMinutes: p.durationMinutes,
    representativeName: teamLabelOf(p),
    department: p.department,
    memberCount: p.memberCount,
    conceptDescription: null,
    transformationHighlight: null,
    costumeIdea: null,
    aiTechnologyUsage: null,
    infoIncomplete: p.infoIncomplete,
  };
}

/** Sáu nhãn trạng thái hợp lệ trên bảng tổng — không có nhãn thứ bảy. */
function statusLabel(p: PerformanceRecord, complete: boolean): string {
  if (complete) return "Đã chấm xong";
  if (p.judgingStatus === "in_progress") return "BGK đang chấm";
  if (p.liveStatus === "performing") return "Đang biểu diễn";
  if (p.liveStatus === "performed") return "Chờ hoàn tất";
  return "Chưa biểu diễn";
}

export function buildLedSnapshot(location: LocationCode): LedSnapshot {
  const state = getLiveState(location);
  const approved = listApproved(location);
  const byId = new Map(approved.map((p) => [p.id, p]));

  const current = state.currentPerformanceId
    ? (byId.get(state.currentPerformanceId) ?? null)
    : null;

  // Tiết mục kế tiếp: Admin chọn tay, không thì lấy tiết mục sau theo rundown.
  const explicitNext = state.nextPerformanceId
    ? (byId.get(state.nextPerformanceId) ?? null)
    : null;
  const idx = current ? approved.findIndex((p) => p.id === current.id) : -1;
  const next = explicitNext ?? (idx >= 0 ? (approved[idx + 1] ?? null) : (approved[0] ?? null));

  const progress = current
    ? (() => {
        const p = progressOfPerformance(current.id);
        return { submitted: p.submitted, assigned: p.assigned };
      })()
    : null;

  /* ── Bình chọn ───────────────────────────────────────────────────────── */
  const session = activeSession(location);
  const voting: LedVoting | null =
    session && session.status !== "draft"
      ? {
          sessionId: session.id,
          status: session.status,
          participants: participantCount(session.id),
          maxSelections: session.maxSelections,
          closesAt: session.closesAt,
          serverNow: new Date().toISOString(),
          voteUrl: voteUrlFor(location),
        }
      : null;

  /* ── Giải đang trình chiếu ───────────────────────────────────────────── */
  const awardRow = state.currentAwardId ? awardById(state.currentAwardId) : undefined;
  let award: LedAward | null = null;
  if (awardRow && awardRow.location === location) {
    // CỬA DUY NHẤT để winner đi ra LED. Chưa published_at thì winner là null,
    // bất kể display_mode đang là gì.
    const published = Boolean(awardRow.publishedAt && awardRow.performanceId);
    const winner =
      published && awardRow.performanceId ? byId.get(awardRow.performanceId) : undefined;

    award = {
      id: awardRow.id,
      nameEn: awardRow.nameEn,
      nameVi: awardRow.nameVi,
      source: awardRow.source,
      winner: winner ? toLed(winner) : null,
      scorecard:
        state.displayMode === "scorecard" && published
          ? (() => {
              const card = scorecardFor(awardRow);
              return card
                ? {
                    rows: card.perCriterion.map((r) => ({
                      label: r.label,
                      weight: r.weight,
                      value: r.value,
                    })),
                    total: card.total,
                  }
                : null;
            })()
          : null,
    };
  }

  /* ── Shuffle ─────────────────────────────────────────────────────────── */
  // Thứ tự rundown, không phải thứ tự phiếu. Nếu sắp theo số phiếu thì DOM order
  // tự nó tiết lộ ai đang dẫn — đúng thứ màn shuffle sinh ra để giấu.
  const shuffleRows =
    session && state.displayMode === "audience_award_shuffle"
      ? sessionPerformances(session.id).map((p) => toLed(p))
      : [];

  const publishedAwards =
    state.displayMode === "awards_summary"
      ? listAwards(location)
          .filter((a) => a.publishedAt && a.performanceId)
          .map((a) => ({
            nameVi: a.nameVi,
            performanceName: (() => {
              const p = a.performanceId ? byId.get(a.performanceId) : undefined;
              return p ? displayNameOf(p) : "—";
            })(),
          }))
      : [];

  return {
    location,
    displayMode: state.displayMode,
    publicMessage: state.publicMessage,
    current: current ? toLed(current) : null,
    next: next ? toLed(next) : null,
    progress,
    rows: approved.map((p) => ({
      performance: toLed(p),
      status: statusLabel(p, progressOfPerformance(p.id).complete),
    })),
    voting,
    award,
    shuffleRows,
    publishedAwards,
    updatedAt: state.updatedAt,
  };
}

/** URL khán giả quét. Đi qua helper base URL nên đúng cả preview lẫn production. */
function voteUrlFor(location: LocationCode): string {
  return `${baseUrl()}/vote/${location.toLowerCase()}`;
}

/* ═══ Admin ════════════════════════════════════════════════════════════════
 *
 * Ngược lại hoàn toàn: Admin thấy điểm trung bình tạm tính, thấy ai đang nháp,
 * thấy ai chưa đăng nhập. Snapshot này KHÔNG BAO GIỜ đi xuống LED — hai hàm
 * khác nhau, hai endpoint khác nhau, endpoint Admin có kiểm tra quyền.
 */

export type CellState = "todo" | "draft" | "submitted" | "locked";

export interface JudgeProgressRow {
  id: string;
  name: string;
  title: string;
  email: string;
  assigned: number;
  submitted: number;
  drafts: number;
  pending: number;
  completionPct: number;
  lastActivityAt: string | null;
  /** Trạng thái theo đúng thứ tự `performances` của snapshot. */
  cells: (CellState | null)[];
}

export interface PerformanceProgressRow {
  id: string;
  code: string;
  order: number | null;
  name: string;
  assigned: number;
  submitted: number;
  missing: number;
  pct: number;
  judgingStatus: PerformanceRecord["judgingStatus"];
  liveStatus: PerformanceRecord["liveStatus"];
  reviewStatus: PerformanceRecord["reviewStatus"];
  /** Chỉ Admin. Null khi chưa đủ dữ liệu để nói gì có nghĩa. */
  provisionalAvg: number | null;
}

export interface AdminSnapshot {
  location: LocationCode;
  performances: PerformanceProgressRow[];
  judges: JudgeProgressRow[];
  totals: { needed: number; done: number; drafts: number; pct: number };
  displayMode: DisplayMode;
  currentPerformanceId: string | null;
  updatedAt: string;
}

function cellOf(
  scoreByPerformance: Map<string, { status: string }>,
  assignedSet: Set<string>,
  performanceId: string,
): CellState | null {
  if (!assignedSet.has(performanceId)) return null; // không được giao → ô trống
  const s = scoreByPerformance.get(performanceId);
  if (!s) return "todo";
  if (s.status === "locked") return "locked";
  if (s.status === "submitted") return "submitted";
  return "draft";
}

export function buildAdminSnapshot(location: LocationCode): AdminSnapshot {
  const state = getLiveState(location);
  const approved = listApproved(location);
  const judges: UserRow[] = listJudges(location);

  const performanceRows: PerformanceProgressRow[] = approved.map((p) => {
    const prog = progressOfPerformance(p.id);
    const { avg, counted } = averageOf(p.id);
    return {
      id: p.id,
      code: p.registrationCode,
      order: p.performanceOrder,
      name: displayNameOf(p),
      assigned: prog.assigned,
      submitted: prog.submitted,
      missing: prog.missing,
      pct: prog.assigned ? Math.round((prog.submitted / prog.assigned) * 100) : 0,
      judgingStatus: p.judgingStatus,
      liveStatus: p.liveStatus,
      reviewStatus: p.reviewStatus,
      provisionalAvg: counted > 0 ? avg : null,
    };
  });

  const judgeRows: JudgeProgressRow[] = judges.map((j) => {
    const scores = scoresOfJudge(j.id);
    const scoreMap = new Map(scores.map((s) => [s.performance_id, s]));
    const assignedSet = new Set(assignedPerformanceIds(j.id));

    const cells = approved.map((p) => cellOf(scoreMap, assignedSet, p.id));
    const assigned = cells.filter((c) => c !== null).length;
    const submitted = cells.filter((c) => c === "submitted" || c === "locked").length;
    const drafts = cells.filter((c) => c === "draft").length;
    const lastActivityAt =
      scores
        .map((s) => s.updated_at)
        .sort()
        .at(-1) ?? j.last_login_at;

    return {
      id: j.id,
      name: j.full_name,
      title: j.title ?? "Giám khảo",
      email: j.email,
      assigned,
      submitted,
      drafts,
      pending: Math.max(0, assigned - submitted),
      completionPct: assigned ? Math.round((submitted / assigned) * 100) : 0,
      lastActivityAt: lastActivityAt ?? null,
      cells,
    };
  });

  const needed = performanceRows.reduce((n, r) => n + r.assigned, 0);
  const done = performanceRows.reduce((n, r) => n + r.submitted, 0);
  const drafts = judgeRows.reduce((n, r) => n + r.drafts, 0);

  return {
    location,
    performances: performanceRows,
    judges: judgeRows,
    totals: { needed, done, drafts, pct: needed ? Math.round((done / needed) * 100) : 0 },
    displayMode: state.displayMode,
    currentPerformanceId: state.currentPerformanceId,
    updatedAt: new Date().toISOString(),
  };
}
