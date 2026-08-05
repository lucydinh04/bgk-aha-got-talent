import "server-only";

import { all, get, now, run, uuid } from "@/lib/db";
import type { LocationCode } from "@/lib/data";
import type { Role } from "./session";

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  title: string | null;
  department: string | null;
  location: LocationCode | null;
  status: "active" | "disabled";
  last_login_at: string | null;
}

const SELECT =
  "select id, email, full_name, role, title, department, location, status, last_login_at from users";

/** Email luôn so sánh ở dạng lowercase đã trim — người ta gõ hoa lung tung. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function findByEmail(email: string): UserRow | undefined {
  return get<UserRow>(`${SELECT} where email = ?`, normalizeEmail(email));
}

export function findById(id: string): UserRow | undefined {
  return get<UserRow>(`${SELECT} where id = ?`, id);
}

/**
 * BGK của một đầu cầu, gồm cả người có `location` = null vì họ chấm cả hai.
 * Bảng tiến độ của Admin giao danh sách này với tiết mục đã lọc theo đầu cầu,
 * nên BGK chung không làm lẫn tiết mục giữa SGN và HAN.
 */
export function listJudges(location: LocationCode): UserRow[] {
  return all<UserRow>(
    `${SELECT} where role = 'judge' and status = 'active'
       and (location is null or location = ?)
     order by full_name`,
    location,
  );
}

export function upsertUser(input: {
  email: string;
  fullName: string;
  role: Role;
  title?: string | null;
  department?: string | null;
  location: LocationCode | null;
}): UserRow {
  const email = normalizeEmail(input.email);
  const existing = findByEmail(email);
  const t = now();

  if (existing) {
    run(
      "update users set full_name = ?, role = ?, title = ?, department = ?, location = ?, updated_at = ? where id = ?",
      input.fullName,
      input.role,
      input.title ?? null,
      input.department ?? null,
      input.location,
      t,
      existing.id,
    );
  } else {
    run(
      `insert into users (id, email, full_name, role, title, department, location, status, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      uuid(),
      email,
      input.fullName,
      input.role,
      input.title ?? null,
      input.department ?? null,
      input.location,
      t,
      t,
    );
  }
  return findByEmail(email)!;
}

/* ── Phân công ───────────────────────────────────────────────────────────── */

export function assignJudge(judgeId: string, performanceId: string, location: LocationCode): void {
  run(
    "insert into judge_assignments (id, judge_id, performance_id, location, assigned_at) " +
      "values (?, ?, ?, ?, ?) on conflict (judge_id, performance_id) do nothing",
    uuid(),
    judgeId,
    performanceId,
    location,
    now(),
  );
}

export function assignedPerformanceIds(judgeId: string): string[] {
  return all<{ performance_id: string }>(
    "select performance_id from judge_assignments where judge_id = ?",
    judgeId,
  ).map((r) => r.performance_id);
}

export function judgesAssignedTo(performanceId: string): UserRow[] {
  return all<UserRow>(
    `select u.id, u.email, u.full_name, u.role, u.title, u.department,
            u.location, u.status, u.last_login_at
     from users u
     join judge_assignments a on a.judge_id = u.id
     where a.performance_id = ?
     order by u.full_name`,
    performanceId,
  );
}
