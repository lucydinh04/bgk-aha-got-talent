"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { toLocation, type LocationCode } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { listApproved } from "@/lib/server/performances";
import { setLiveState } from "@/lib/server/live";
import {
  VotingError,
  activeSession,
  closeSession,
  createAudienceSnapshot,
  createSession,
  hasVoted,
  isAcceptingBallots,
  newVoterToken,
  openSession,
  participantCount,
  sessionById,
  sessionPerformances,
  submitBallot,
} from "@/lib/server/voting";

/**
 * Bình chọn khán giả.
 *
 * Hai nhóm action tách bạch: nhóm Admin có kiểm tra quyền, nhóm công khai thì
 * không — nhưng nhóm công khai chỉ làm được đúng một việc là gửi một lá phiếu
 * hợp lệ vào một phiên đang mở, và mọi điều kiện đều kiểm lại ở server.
 */

const VOTER_COOKIE = "aha_voter";

/* ═══ Công khai ═══════════════════════════════════════════════════════════ */

/**
 * Đọc token thiết bị. KHÔNG ghi cookie.
 *
 * Bắt buộc phải tách khỏi hàm ghi: `readVoteStateAction` được gọi cả lúc render
 * trang, mà Next không cho set cookie trong Server Component — chỉ Server
 * Action và Route Handler mới được. Chưa có cookie nghĩa là thiết bị này chưa
 * bình chọn, đó là câu trả lời đúng cho lúc render.
 */
async function readVoterToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(VOTER_COOKIE)?.value ?? null;
}

/** Lấy hoặc tạo token. CHỈ gọi từ Server Action — hàm này có ghi cookie. */
async function ensureVoterToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(VOTER_COOKIE)?.value;
  if (existing) return existing;

  const token = newVoterToken();
  store.set(VOTER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return token;
}

export interface VoteState {
  status: "open" | "closed" | "none";
  sessionId: string | null;
  maxSelections: number;
  closesAt: string | null;
  serverNow: string;
  alreadyVoted: boolean;
  participants: number;
  performances: { code: string; id: string }[];
}

export async function readVoteStateAction(slug: string): Promise<VoteState> {
  const location = toLocation(slug);
  const empty: VoteState = {
    status: "none",
    sessionId: null,
    maxSelections: 2,
    closesAt: null,
    serverNow: new Date().toISOString(),
    alreadyVoted: false,
    participants: 0,
    performances: [],
  };
  if (!location) return empty;

  const session = activeSession(location);
  if (!session || session.status === "draft") return empty;

  // Chưa có cookie → chắc chắn chưa bình chọn. Không tạo cookie ở đây.
  const token = await readVoterToken();
  return {
    status: isAcceptingBallots(session) ? "open" : "closed",
    sessionId: session.id,
    maxSelections: session.maxSelections,
    closesAt: session.closesAt,
    serverNow: new Date().toISOString(),
    alreadyVoted: token ? hasVoted(session.id, token) : false,
    participants: participantCount(session.id),
    performances: sessionPerformances(session.id).map((p) => ({
      code: p.registrationCode,
      id: p.id,
    })),
  };
}

export async function submitBallotAction(input: {
  slug: string;
  sessionId: string;
  performanceCodes: string[];
  idempotencyKey: string;
}): Promise<{ ok: true; participants: number } | { ok: false; error: string }> {
  const location = toLocation(input.slug);
  if (!location) return { ok: false, error: "Đường link không hợp lệ." };

  const session = sessionById(input.sessionId);
  if (!session || session.location !== location) {
    return { ok: false, error: "Phiên bình chọn không tồn tại." };
  }

  // Client gửi mã đăng ký; id nội bộ do server tra ra. Không tin id từ client.
  const byCode = new Map(listApproved(location).map((p) => [p.registrationCode, p.id]));
  const ids = input.performanceCodes
    .map((c) => byCode.get(c))
    .filter((id): id is string => Boolean(id));

  try {
    const { participants } = submitBallot({
      sessionId: input.sessionId,
      voterToken: await ensureVoterToken(),
      performanceIds: ids,
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true, participants };
  } catch (err) {
    if (err instanceof VotingError) return { ok: false, error: err.message };
    return { ok: false, error: "Không gửi được phiếu. Thử lại giúp mình." };
  }
}

/* ═══ Admin ═══════════════════════════════════════════════════════════════ */

async function guard(slug: string) {
  const location = toLocation(slug);
  if (!location) return { error: "Đầu cầu không hợp lệ." as const };
  const session = await requireAdmin(location);
  if (!session) return { error: "Phiên Admin đã hết hạn." as const };
  return { location, session };
}

export async function createVotingSessionAction(
  slug: string,
  durationSeconds: number,
  maxSelections: number,
): Promise<{ ok: boolean; error?: string; sessionId?: string }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const existing = activeSession(ctx.location);
  if (existing && existing.status === "open") {
    return { ok: false, error: "Đang có một phiên bình chọn mở." };
  }

  const performances = listApproved(ctx.location);
  if (!performances.length) {
    return { ok: false, error: "Chưa có tiết mục nào được duyệt." };
  }

  const created = createSession({
    location: ctx.location,
    durationSeconds: Math.max(30, Math.min(1800, durationSeconds)),
    maxSelections: Math.max(1, Math.min(5, maxSelections)),
    performanceIds: performances.map((p) => p.id),
    createdBy: ctx.session.userId,
  });
  revalidatePath(`/admin/${slug}/voting`);
  return { ok: true, sessionId: created.id };
}

export async function openVotingAction(
  slug: string,
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  try {
    openSession(sessionId);
    // Mở phiếu thì LED sang màn bình chọn — một thao tác, không phải hai.
    setLiveState(ctx.location, { displayMode: "audience_vote_live" }, ctx.session.userId);
    revalidatePath(`/admin/${slug}/voting`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof VotingError ? err.message : "Không mở được phiếu.",
    };
  }
}

export async function closeVotingAction(
  slug: string,
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  try {
    closeSession(sessionId);
    setLiveState(
      ctx.location,
      { displayMode: "audience_vote_closed" },
      ctx.session.userId,
    );
    revalidatePath(`/admin/${slug}/voting`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof VotingError ? err.message : "Không đóng được phiếu.",
    };
  }
}

/**
 * Xác minh và CHỐT kết quả. Sau bước này con số không đổi nữa.
 * Trả về `tied` để Admin biết hệ thống đang chờ BTC quyết chứ không tự chọn.
 */
export async function verifyVotingAction(
  slug: string,
  sessionId: string,
): Promise<{ ok: boolean; error?: string; tied?: boolean; participants?: number }> {
  const ctx = await guard(slug);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const session = sessionById(sessionId);
  if (!session) return { ok: false, error: "Không tìm thấy phiên." };
  if (session.status === "open") {
    return { ok: false, error: "Đóng phiếu trước khi xác minh." };
  }

  const { payload } = createAudienceSnapshot(
    ctx.location as LocationCode,
    sessionId,
    ctx.session.userId,
  );
  setLiveState(
    ctx.location,
    { displayMode: "audience_vote_verification" },
    ctx.session.userId,
  );
  revalidatePath(`/admin/${slug}/voting`);
  return { ok: true, tied: payload.tied, participants: payload.participants };
}
