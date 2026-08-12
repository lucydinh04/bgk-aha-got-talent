import "server-only";

import { all, get, now, run, uuid } from "@/lib/db";
import { LOCATIONS, type LocationCode } from "@/lib/data";
import { normalizeEmail } from "./users";

/**
 * Quản lý Ban Giám khảo cho Admin.
 *
 * MÔ HÌNH ĐẦU CẦU — đọc trước khi sửa
 *
 * Một BGK có thể chấm SGN, HAN, hoặc cả hai. Cột `users.location` KHÔNG diễn tả
 * được "cả hai" vì nó là enum một giá trị: `check (location in ('SGN','HAN'))`.
 *
 * Nên nguồn sự thật về đầu cầu là bảng `judge_assignments` — mỗi dòng mang đúng
 * một `location`. Một BGK chấm cả hai đầu cầu đơn giản là có phân công ở cả hai.
 * Tuyệt đối không nhét chuỗi "SGN,HAN" vào cột enum.
 *
 * `users.location` được giữ đồng bộ như một RÀNG BUỘC đăng nhập, dẫn xuất từ tập
 * đầu cầu:
 *
 *   {SGN}       → location = 'SGN'   (mở /judge/han sẽ bị chỉ đường về SGN)
 *   {HAN}       → location = 'HAN'
 *   {SGN, HAN}  → location = NULL    (không giới hạn — xem requireJudge)
 *   {}          → location = NULL    (đăng nhập được, dashboard trống)
 *
 * Nhờ vậy BGK chỉ chấm một đầu cầu mà mở nhầm link sẽ nhận thông báo đúng, thay
 * vì vào được rồi thấy màn hình trống và tưởng hệ thống hỏng.
 */

export type Venue = LocationCode;

export interface JudgeAdminRow {
  id: string;
  email: string;
  fullName: string;
  title: string | null;
  department: string | null;
  status: "active" | "disabled";
  lastLoginAt: string | null;
  /** Đầu cầu suy ra từ phân công thật, không phải từ cột `location`. */
  venues: Venue[];
  assigned: number;
  /** Chỉ đếm `submitted` và `locked` — nháp không phải là đã chấm. */
  submitted: number;
  pending: number;
  /** Gồm cả nháp. Dùng để quyết định được xoá hay chỉ được vô hiệu hoá. */
  totalScores: number;
}

/** Tiết mục "đang active" = đã được BTC duyệt. Không đụng pending_review/rejected. */
function activePerformanceIds(venue: Venue): string[] {
  return all<{ id: string }>(
    "select id from performances where location = ? and review_status = 'approved' order by performance_order",
    venue,
  ).map((r) => r.id);
}

export function countActivePerformances(venues: Venue[]): number {
  if (venues.length === 0) return 0;
  return venues.reduce((n, v) => n + activePerformanceIds(v).length, 0);
}

/* ── Đọc ─────────────────────────────────────────────────────────────────── */

export function listJudgeAdminRows(): JudgeAdminRow[] {
  const users = all<{
    id: string;
    email: string;
    full_name: string;
    title: string | null;
    department: string | null;
    status: "active" | "disabled";
    last_login_at: string | null;
  }>(
    `select id, email, full_name, title, department, status, last_login_at
     from users where role = 'judge' order by full_name, email`,
  );

  return users.map((u) => {
    const venues = all<{ location: Venue }>(
      "select distinct location from judge_assignments where judge_id = ? order by location",
      u.id,
    ).map((r) => r.location);

    const assigned =
      get<{ n: number }>(
        "select count(*) as n from judge_assignments where judge_id = ?",
        u.id,
      )?.n ?? 0;

    const submitted =
      get<{ n: number }>(
        "select count(*) as n from scores where judge_id = ? and status in ('submitted','locked')",
        u.id,
      )?.n ?? 0;

    const totalScores =
      get<{ n: number }>("select count(*) as n from scores where judge_id = ?", u.id)
        ?.n ?? 0;

    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      title: u.title,
      department: u.department,
      status: u.status,
      lastLoginAt: u.last_login_at,
      venues,
      assigned,
      submitted,
      pending: Math.max(0, assigned - submitted),
      totalScores,
    };
  });
}

export function findJudgeByEmail(email: string): JudgeAdminRow | undefined {
  const e = normalizeEmail(email);
  return listJudgeAdminRows().find((j) => j.email === e);
}

export function judgeById(id: string): JudgeAdminRow | undefined {
  return listJudgeAdminRows().find((j) => j.id === id);
}

/** Đếm BGK theo đầu cầu — dùng cho báo cáo và cho header của trang. */
export function judgeCountByVenue(): Record<Venue, number> {
  const out = {} as Record<Venue, number>;
  for (const v of LOCATIONS) {
    out[v] =
      get<{ n: number }>(
        `select count(distinct a.judge_id) as n
         from judge_assignments a join users u on u.id = a.judge_id
         where a.location = ? and u.role = 'judge' and u.status = 'active'`,
        v,
      )?.n ?? 0;
  }
  return out;
}

/* ── Ghi ─────────────────────────────────────────────────────────────────── */

/**
 * Gán BGK vào toàn bộ tiết mục đã duyệt của một đầu cầu.
 *
 * `on conflict do nothing` dựa vào ràng buộc `unique (judge_id, performance_id)`
 * — bấm hai lần không sinh bản trùng. Trả về số dòng THỰC SỰ được thêm.
 */
function assignVenue(judgeId: string, venue: Venue): number {
  let added = 0;
  const t = now();
  for (const performanceId of activePerformanceIds(venue)) {
    const before =
      get<{ n: number }>(
        "select count(*) as n from judge_assignments where judge_id = ? and performance_id = ?",
        judgeId,
        performanceId,
      )?.n ?? 0;
    if (before) continue;
    run(
      "insert into judge_assignments (id, judge_id, performance_id, location, assigned_at) values (?, ?, ?, ?, ?)",
      uuid(),
      judgeId,
      performanceId,
      venue,
      t,
    );
    added += 1;
  }
  return added;
}

/**
 * Gỡ phân công của một đầu cầu.
 *
 * KHÔNG đụng tới bảng `scores`. Nếu BGK đã chấm tiết mục ở đầu cầu đó thì điểm
 * vẫn còn nguyên trong DB và vẫn tính vào trung bình — gỡ phân công chỉ có nghĩa
 * là tiết mục biến khỏi dashboard của họ, không phải là xoá việc họ đã làm.
 */
function unassignVenue(judgeId: string, venue: Venue): number {
  // `run()` của lớp db trả về void, nên đếm trước rồi mới xoá.
  const n =
    get<{ n: number }>(
      "select count(*) as n from judge_assignments where judge_id = ? and location = ?",
      judgeId,
      venue,
    )?.n ?? 0;
  if (n > 0) {
    run(
      "delete from judge_assignments where judge_id = ? and location = ?",
      judgeId,
      venue,
    );
  }
  return n;
}

/** Đầu cầu suy ra từ phân công → giá trị cho cột `users.location`. */
function locationColumnFor(venues: Venue[]): Venue | null {
  return venues.length === 1 ? venues[0] : null;
}

export interface ProvisionInput {
  email: string;
  fullName?: string | null;
  title?: string | null;
  venues: Venue[];
  /** false = tạo tài khoản nhưng chưa phân công tiết mục nào. */
  autoAssign: boolean;
}

export interface ProvisionResult {
  judgeId: string;
  email: string;
  /** `created` khi tài khoản mới; `updated` khi email đã tồn tại từ trước. */
  outcome: "created" | "updated";
  venues: Venue[];
  assignmentsAdded: number;
  assignmentsRemoved: number;
  totalAssignments: number;
}

/**
 * Tạo mới hoặc cập nhật một BGK, rồi đồng bộ phân công theo tập đầu cầu.
 *
 * Idempotent: gọi lại với cùng dữ liệu cho ra `assignmentsAdded = 0`. Email đã
 * tồn tại thì cập nhật chứ không tạo bản trùng — cột `email` là UNIQUE và mọi
 * so sánh đều đi qua `normalizeEmail`.
 *
 * KHÔNG tạo dòng nào trong `scores`. BGK chỉ có điểm khi họ tự chấm; tạo sẵn
 * điểm 0 sẽ kéo tụt trung bình của tiết mục ngay khi thêm người.
 */
export function provisionJudge(input: ProvisionInput): ProvisionResult {
  const email = normalizeEmail(input.email);
  const t = now();
  const venues = LOCATIONS.filter((v) => input.venues.includes(v));

  const existing = get<{ id: string; full_name: string; title: string | null }>(
    "select id, full_name, title from users where email = ?",
    email,
  );

  let judgeId: string;
  let outcome: "created" | "updated";

  if (existing) {
    judgeId = existing.id;
    outcome = "updated";
    run(
      `update users set full_name = ?, title = ?, role = 'judge', location = ?, updated_at = ?
       where id = ?`,
      // Bỏ trống tên thì giữ tên cũ, không ghi đè bằng chuỗi rỗng.
      input.fullName?.trim() || existing.full_name,
      input.title?.trim() || null,
      locationColumnFor(venues),
      t,
      judgeId,
    );
  } else {
    judgeId = uuid();
    outcome = "created";
    run(
      `insert into users (id, email, full_name, role, title, location, status, created_at, updated_at)
       values (?, ?, ?, 'judge', ?, ?, 'active', ?, ?)`,
      judgeId,
      email,
      // `full_name` là NOT NULL. Chưa có tên thì dùng chính email — hiển thị được
      // và nhìn là biết hồ sơ chưa hoàn thiện, không phải một cái tên bịa.
      input.fullName?.trim() || email,
      input.title?.trim() || null,
      locationColumnFor(venues),
      t,
      t,
    );
  }

  let added = 0;
  let removed = 0;

  if (input.autoAssign) {
    for (const v of venues) added += assignVenue(judgeId, v);
  }
  // Đầu cầu bị bỏ chọn thì gỡ phân công của đầu cầu đó — kể cả khi không
  // autoAssign, vì đây là thao tác "đặt lại tập đầu cầu", không phải "thêm".
  for (const v of LOCATIONS) {
    if (!venues.includes(v)) removed += unassignVenue(judgeId, v);
  }

  const totalAssignments =
    get<{ n: number }>(
      "select count(*) as n from judge_assignments where judge_id = ?",
      judgeId,
    )?.n ?? 0;

  return {
    judgeId,
    email,
    outcome,
    venues,
    assignmentsAdded: added,
    assignmentsRemoved: removed,
    totalAssignments,
  };
}

export function setJudgeStatus(judgeId: string, status: "active" | "disabled"): void {
  run("update users set status = ?, updated_at = ? where id = ? and role = 'judge'", status, now(), judgeId);
}

/**
 * Xoá hẳn một BGK. CHỈ cho phép khi họ chưa từng chấm gì.
 *
 * `scores.judge_id` là `on delete restrict`, nên nếu còn điểm thì SQLite sẽ từ
 * chối — nhưng ta chặn sớm ở đây để trả về thông báo đọc được thay vì một lỗi
 * ràng buộc. BGK đã chấm thì dùng "Vô hiệu hoá": điểm, lịch sử và audit log giữ
 * nguyên.
 */
export function deleteJudge(judgeId: string): { ok: boolean; error?: string } {
  const scores =
    get<{ n: number }>("select count(*) as n from scores where judge_id = ?", judgeId)
      ?.n ?? 0;
  if (scores > 0) {
    return {
      ok: false,
      error: `BGK này đã có ${scores} bản ghi điểm. Hãy dùng "Vô hiệu hoá" — xoá sẽ mất dữ liệu chấm.`,
    };
  }
  // judge_assignments là `on delete cascade`, nên phân công đi theo.
  run("delete from users where id = ? and role = 'judge'", judgeId);
  return { ok: true };
}
