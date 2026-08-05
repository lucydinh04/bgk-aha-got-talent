import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { get, now, run, settingOrCreate } from "@/lib/db";
import type { LocationCode } from "@/lib/data";

/**
 * Session ký bằng HMAC, đựng trong một cookie httpOnly.
 *
 * Không có bảng session: không cần thu hồi từng phiên trong một sự kiện kéo dài
 * ba tiếng, và một truy vấn DB cho mỗi request là cái giá không đáng trả. Muốn
 * đá toàn bộ mọi người ra thì đổi secret trong bảng `settings`.
 */

const COOKIE = "aha_session";
const TTL_HOURS = 12; // dài hơn một đêm diễn, ngắn hơn một ngày

export type Role = "judge" | "admin" | "super_admin";

export interface Session {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  /** NULL với Admin toàn hệ thống; BGK luôn có giá trị. */
  location: LocationCode | null;
  expiresAt: number;
}

function secret(): string {
  return (
    process.env.SESSION_SECRET ??
    settingOrCreate("session_secret", () => randomBytes(32).toString("hex"))
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Session;
    if (typeof session.expiresAt !== "number" || session.expiresAt < Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/* ── API ─────────────────────────────────────────────────────────────────── */

export async function readSession(): Promise<Session | null> {
  const store = await cookies();
  return decode(store.get(COOKIE)?.value);
}

export async function startSession(user: {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  location: LocationCode | null;
}): Promise<Session> {
  const session: Session = {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    location: user.location,
    expiresAt: Date.now() + TTL_HOURS * 3_600_000,
  };

  const store = await cookies();
  store.set(COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_HOURS * 3600,
  });

  run("update users set last_login_at = ?, updated_at = ? where id = ?", now(), now(), user.id);
  return session;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/* ── Kiểm tra quyền ──────────────────────────────────────────────────────── */

/**
 * BGK của đúng đầu cầu đó. Trả `null` thay vì ném lỗi: caller quyết định là
 * redirect về trang đăng nhập hay trả 401, hai chỗ cần hai cách khác nhau.
 */
export async function requireJudge(location: LocationCode): Promise<Session | null> {
  const session = await readSession();
  if (!session || session.role !== "judge") return null;
  if (session.location !== location) return null;
  if (!isActive(session.userId)) return null;
  return session;
}

export async function requireAdmin(
  location?: LocationCode,
): Promise<Session | null> {
  const session = await readSession();
  if (!session) return null;
  if (session.role !== "admin" && session.role !== "super_admin") return null;
  // Admin có `location` = null thì quản cả hai đầu cầu.
  if (location && session.location && session.location !== location) return null;
  if (!isActive(session.userId)) return null;
  return session;
}

function isActive(userId: string): boolean {
  return (
    get<{ status: string }>("select status from users where id = ?", userId)?.status ===
    "active"
  );
}
