import "server-only";

import { all, get, run, now, toBool, tx, uuid } from "@/lib/db";
import type { LocationCode, Performance } from "@/lib/data";

/**
 * Đọc tiết mục từ DB.
 *
 * Hình dạng trả về mở rộng đúng `Performance` của `lib/data.ts`, nên mọi
 * component UI đã viết ở Phase 2 nhận được mà không phải sửa một dòng nào.
 */

export type ReviewStatus = "pending_review" | "approved" | "rejected";
export type JudgingStatus = "not_started" | "in_progress" | "completed";
export type LiveStatus = "not_started" | "performing" | "performed";

export interface PerformanceRecord extends Performance {
  id: string;
  officialDisplayName: string | null;
  teamName: string | null;
  reviewStatus: ReviewStatus;
  judgingStatus: JudgingStatus;
  liveStatus: LiveStatus;
  isCurrentPerformance: boolean;
}

interface PerformanceRow {
  id: string;
  registration_code: string;
  location: LocationCode;
  performance_order: number | null;
  performance_name: string;
  official_display_name: string | null;
  team_name: string | null;
  participation_type: string | null;
  performance_type: string | null;
  duration_minutes: number | null;
  representative_name: string | null;
  department: string | null;
  member_count: number | null;
  concept_description: string | null;
  transformation_highlight: string | null;
  costume_idea: string | null;
  ai_technology_usage: string | null;
  review_status: ReviewStatus;
  judging_status: JudgingStatus;
  live_status: LiveStatus;
  is_current_performance: number;
  info_incomplete: number;
}

const SELECT = `
  select id, registration_code, location, performance_order, performance_name,
         official_display_name, team_name, participation_type, performance_type,
         duration_minutes, representative_name, department, member_count,
         concept_description, transformation_highlight, costume_idea,
         ai_technology_usage, review_status, judging_status, live_status,
         is_current_performance, info_incomplete
  from performances
`;

/** Thứ tự biểu diễn trước, tiết mục chưa xếp lịch xuống cuối theo mã. */
const ORDER = `
  order by case when performance_order is null then 1 else 0 end,
           performance_order, registration_code
`;

export function toRecord(r: PerformanceRow): PerformanceRecord {
  return {
    id: r.id,
    registrationCode: r.registration_code,
    location: r.location,
    performanceOrder: r.performance_order,
    performanceName: r.performance_name,
    officialDisplayName: r.official_display_name,
    teamName: r.team_name,
    participationType: r.participation_type,
    performanceType: r.performance_type,
    durationMinutes: r.duration_minutes,
    representativeName: r.representative_name,
    department: r.department,
    memberCount: r.member_count,
    conceptDescription: r.concept_description,
    transformationHighlight: r.transformation_highlight,
    costumeIdea: r.costume_idea,
    aiTechnologyUsage: r.ai_technology_usage,
    reviewStatus: r.review_status,
    judgingStatus: r.judging_status,
    liveStatus: r.live_status,
    isCurrentPerformance: toBool(r.is_current_performance),
    infoIncomplete: toBool(r.info_incomplete),
  };
}

/** Mọi tiết mục của đầu cầu, kể cả chưa duyệt — chỉ Admin gọi hàm này. */
export function listAll(location: LocationCode): PerformanceRecord[] {
  return all<PerformanceRow>(
    `${SELECT} where location = ? ${ORDER}`,
    location,
  ).map(toRecord);
}

/**
 * Tiết mục BGK và LED được phép thấy. `pending_review` không lọt qua đây —
 * đó là toàn bộ cơ chế duyệt, nên nó nằm ở tầng truy vấn chứ không ở tầng UI.
 */
export function listApproved(location: LocationCode): PerformanceRecord[] {
  return all<PerformanceRow>(
    `${SELECT} where location = ? and review_status = 'approved' ${ORDER}`,
    location,
  ).map(toRecord);
}

export function byId(id: string): PerformanceRecord | undefined {
  const row = get<PerformanceRow>(`${SELECT} where id = ?`, id);
  return row ? toRecord(row) : undefined;
}

export function byCode(code: string): PerformanceRecord | undefined {
  const row = get<PerformanceRow>(`${SELECT} where registration_code = ?`, code);
  return row ? toRecord(row) : undefined;
}

export function currentOf(location: LocationCode): PerformanceRecord | undefined {
  const row = get<PerformanceRow>(
    `${SELECT} where location = ? and is_current_performance = 1`,
    location,
  );
  return row ? toRecord(row) : undefined;
}

/** Tên đưa lên LED: tên BTC chốt nếu có, không thì tên người đăng ký khai. */
export function displayNameOf(p: PerformanceRecord): string {
  return p.officialDisplayName?.trim() || p.performanceName;
}

export function teamLabelOf(p: PerformanceRecord): string {
  return p.teamName?.trim() || p.representativeName || p.department || "—";
}

/* ── Ghi ─────────────────────────────────────────────────────────────────── */

export function setReviewStatus(id: string, status: ReviewStatus): void {
  run(
    "update performances set review_status = ?, updated_at = ? where id = ?",
    status,
    now(),
    id,
  );
}

export function setLiveStatus(id: string, status: LiveStatus): void {
  run(
    "update performances set live_status = ?, updated_at = ? where id = ?",
    status,
    now(),
    id,
  );
}

/**
 * Đặt tiết mục hiện tại của một đầu cầu. Gỡ cờ cũ trước khi cắm cờ mới —
 * unique index chỉ cho một dòng `is_current_performance = 1` mỗi đầu cầu, nên
 * làm ngược thứ tự sẽ vỡ ngay lập tức chứ không âm thầm sai.
 */
export function setCurrent(location: LocationCode, id: string | null): void {
  tx(() => {
    const t = now();
    run(
      "update performances set is_current_performance = 0, updated_at = ? " +
        "where location = ? and is_current_performance = 1",
      t,
      location,
    );
    if (id) {
      run(
        "update performances set is_current_performance = 1, updated_at = ? " +
          "where id = ? and location = ?",
        t,
        id,
        location,
      );
    }
  });
}

export function insert(record: {
  registrationCode: string;
  location: LocationCode;
  performanceName: string;
  reviewStatus?: ReviewStatus;
  fields?: Record<string, string | number | null>;
}): string {
  const id = uuid();
  const t = now();
  run(
    `insert into performances
       (id, registration_code, location, performance_name, review_status,
        created_at, updated_at, last_synced_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    record.registrationCode,
    record.location,
    record.performanceName,
    record.reviewStatus ?? "pending_review",
    t,
    t,
    t,
  );
  return id;
}
