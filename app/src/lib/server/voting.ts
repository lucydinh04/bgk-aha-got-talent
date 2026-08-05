import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { all, get, now, run, tx, uuid } from "@/lib/db";
import type { LocationCode } from "@/lib/data";
import { publish } from "./events";
import { listApproved } from "./performances";

/**
 * Bình chọn khán giả — The Crowd Magnet.
 *
 * BỐN BẤT BIẾN, giữ ở tầng này chứ không ở tầng UI:
 *
 *  1. Số phiếu từng tiết mục KHÔNG BAO GIỜ rời khỏi server trước khi Admin chốt
 *     snapshot. Hàm duy nhất đọc được con số đó là `tallyFor` — nó là private,
 *     và chỉ `createAudienceSnapshot` gọi nó.
 *  2. Giờ đóng do server quyết. Ballot gửi sau `closes_at` bị từ chối, dù đồng
 *     hồ điện thoại của khán giả nói gì.
 *  3. Một thiết bị một phiếu, cưỡng chế bằng unique constraint chứ không bằng
 *     kiểm tra ở app. Gửi lại cùng idempotency key trả về ballot cũ.
 *  4. Ballot bất biến. Không có hàm nào update `audience_ballots` hay
 *     `audience_votes`.
 */

export type VotingStatus = "draft" | "open" | "closed" | "verified";

export interface VotingSession {
  id: string;
  location: LocationCode;
  status: VotingStatus;
  opensAt: string | null;
  closesAt: string | null;
  durationSeconds: number;
  maxSelections: number;
}

interface SessionRow {
  id: string;
  location: LocationCode;
  status: VotingStatus;
  opens_at: string | null;
  closes_at: string | null;
  duration_seconds: number;
  max_selections: number;
}

export class VotingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "no_session"
      | "not_open"
      | "closed"
      | "already_voted"
      | "invalid_selection"
      | "not_allowed",
  ) {
    super(message);
    this.name = "VotingError";
  }
}

function toSession(r: SessionRow): VotingSession {
  return {
    id: r.id,
    location: r.location,
    status: r.status,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    durationSeconds: r.duration_seconds,
    maxSelections: r.max_selections,
  };
}

const SELECT =
  "select id, location, status, opens_at, closes_at, duration_seconds, max_selections from voting_sessions";

/** Phiên đang sống của một đầu cầu: ưu tiên open, rồi closed, rồi draft. */
export function activeSession(location: LocationCode): VotingSession | undefined {
  const row = get<SessionRow>(
    `${SELECT} where location = ?
     order by case status when 'open' then 0 when 'closed' then 1
                          when 'verified' then 2 else 3 end,
              created_at desc
     limit 1`,
    location,
  );
  return row ? toSession(row) : undefined;
}

export function sessionById(id: string): VotingSession | undefined {
  const row = get<SessionRow>(`${SELECT} where id = ?`, id);
  return row ? toSession(row) : undefined;
}

/** Tiết mục có mặt trên lá phiếu, đúng thứ tự rundown. */
export function sessionPerformances(sessionId: string) {
  const ids = all<{ performance_id: string }>(
    "select performance_id from voting_session_performances where voting_session_id = ? order by sort_order",
    sessionId,
  ).map((r) => r.performance_id);
  const session = sessionById(sessionId);
  if (!session) return [];
  const byId = new Map(listApproved(session.location).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p) => p !== undefined);
}

/* ── Vòng đời phiên ──────────────────────────────────────────────────────── */

export function createSession(input: {
  location: LocationCode;
  durationSeconds: number;
  maxSelections: number;
  performanceIds: string[];
  createdBy?: string | null;
}): VotingSession {
  return tx(() => {
    const id = uuid();
    const t = now();
    run(
      `insert into voting_sessions
         (id, location, status, duration_seconds, max_selections, created_by, created_at, updated_at)
       values (?, ?, 'draft', ?, ?, ?, ?, ?)`,
      id,
      input.location,
      input.durationSeconds,
      input.maxSelections,
      input.createdBy ?? null,
      t,
      t,
    );
    input.performanceIds.forEach((pid, i) => {
      run(
        "insert into voting_session_performances (id, voting_session_id, performance_id, sort_order) values (?, ?, ?, ?)",
        uuid(),
        id,
        pid,
        i,
      );
    });
    return sessionById(id)!;
  });
}

/**
 * Mở phiếu. `closes_at` được tính TẠI ĐÂY từ giờ server, không nhận từ client —
 * đó là mốc duy nhất quyết định phiếu nào hợp lệ.
 */
export function openSession(sessionId: string): VotingSession {
  return tx(() => {
    const session = sessionById(sessionId);
    if (!session) throw new VotingError("Không tìm thấy phiên bình chọn.", "no_session");
    if (session.status !== "draft") {
      throw new VotingError("Phiên này đã được mở trước đó.", "not_allowed");
    }
    const opensAt = new Date();
    const closesAt = new Date(opensAt.getTime() + session.durationSeconds * 1000);
    run(
      "update voting_sessions set status = 'open', opens_at = ?, closes_at = ?, updated_at = ? where id = ?",
      opensAt.toISOString(),
      closesAt.toISOString(),
      now(),
      sessionId,
    );
    publish({ type: "voting_opened", location: session.location });
    return sessionById(sessionId)!;
  });
}

export function closeSession(sessionId: string): VotingSession {
  return tx(() => {
    const session = sessionById(sessionId);
    if (!session) throw new VotingError("Không tìm thấy phiên bình chọn.", "no_session");
    run(
      "update voting_sessions set status = 'closed', updated_at = ? where id = ?",
      now(),
      sessionId,
    );
    publish({ type: "voting_closed", location: session.location });
    return sessionById(sessionId)!;
  });
}

/** Phiên đã quá `closes_at` thì coi như đóng, kể cả Admin chưa bấm nút. */
export function isAcceptingBallots(session: VotingSession): boolean {
  if (session.status !== "open") return false;
  if (!session.closesAt) return false;
  return Date.now() < new Date(session.closesAt).getTime();
}

/* ── Danh tính người bình chọn ───────────────────────────────────────────── */

/**
 * Sinh token thiết bị. Lưu trong cookie; DB chỉ giữ hash.
 *
 * Không lưu IP, không lưu user agent. Chống trùng phiếu ở mức "một thiết bị một
 * phiếu" là mức phù hợp cho một giải vui trong tiệc sinh nhật — chống được bấm
 * lại nhiều lần, và không biến hệ thống thành nơi lưu vết ai bầu cho ai.
 */
export function newVoterToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashVoterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/* ── Gửi phiếu ───────────────────────────────────────────────────────────── */

export interface BallotResult {
  ballotId: string;
  duplicate: boolean;
  participants: number;
}

export function submitBallot(input: {
  sessionId: string;
  voterToken: string;
  performanceIds: string[];
  idempotencyKey: string;
}): BallotResult {
  const session = sessionById(input.sessionId);
  if (!session) throw new VotingError("Phiên bình chọn không tồn tại.", "no_session");

  if (!isAcceptingBallots(session)) {
    throw new VotingError(
      session.status === "open"
        ? "Đã hết thời gian bình chọn."
        : "Bình chọn chưa mở hoặc đã kết thúc.",
      "closed",
    );
  }

  // Bỏ trùng rồi mới đếm: chọn cùng một tiết mục hai lần không thành hai phiếu.
  const picked = [...new Set(input.performanceIds)];
  if (picked.length === 0) {
    throw new VotingError("Chọn ít nhất một tiết mục.", "invalid_selection");
  }
  if (picked.length > session.maxSelections) {
    throw new VotingError(
      `Tối đa ${session.maxSelections} tiết mục.`,
      "invalid_selection",
    );
  }

  const allowed = new Set(
    all<{ performance_id: string }>(
      "select performance_id from voting_session_performances where voting_session_id = ?",
      input.sessionId,
    ).map((r) => r.performance_id),
  );
  if (picked.some((id) => !allowed.has(id))) {
    throw new VotingError("Tiết mục không có trong lá phiếu này.", "invalid_selection");
  }

  return tx(() => {
    const replay = get<{ id: string }>(
      "select id from audience_ballots where idempotency_key = ?",
      input.idempotencyKey,
    );
    if (replay) {
      return {
        ballotId: replay.id,
        duplicate: true,
        participants: participantCount(input.sessionId),
      };
    }

    const voterKey = hashVoterToken(input.voterToken);
    const t = now();

    let voter = get<{ id: string }>(
      "select id from audience_voters where voting_session_id = ? and voter_key = ?",
      input.sessionId,
      voterKey,
    );
    if (!voter) {
      const voterId = uuid();
      run(
        "insert into audience_voters (id, voting_session_id, voter_key, created_at) values (?, ?, ?, ?)",
        voterId,
        input.sessionId,
        voterKey,
        t,
      );
      voter = { id: voterId };
    }

    const existing = get<{ id: string }>(
      "select id from audience_ballots where voting_session_id = ? and voter_id = ?",
      input.sessionId,
      voter.id,
    );
    if (existing) {
      throw new VotingError(
        "Thiết bị này đã bình chọn rồi. Mỗi người chỉ bình chọn một lần.",
        "already_voted",
      );
    }

    const ballotId = uuid();
    run(
      "insert into audience_ballots (id, voting_session_id, voter_id, submitted_at, idempotency_key) values (?, ?, ?, ?, ?)",
      ballotId,
      input.sessionId,
      voter.id,
      t,
      input.idempotencyKey,
    );
    for (const pid of picked) {
      run(
        "insert into audience_votes (id, ballot_id, performance_id) values (?, ?, ?)",
        uuid(),
        ballotId,
        pid,
      );
    }

    const participants = participantCount(input.sessionId);
    publish({ type: "vote_submitted", location: session.location });
    return { ballotId, duplicate: false, participants };
  });
}

export function hasVoted(sessionId: string, voterToken: string): boolean {
  const voterKey = hashVoterToken(voterToken);
  return (
    get<{ n: number }>(
      `select count(*) as n from audience_ballots b
       join audience_voters v on v.id = b.voter_id
       where b.voting_session_id = ? and v.voter_key = ?`,
      sessionId,
      voterKey,
    )?.n ?? 0
  ) > 0;
}

/**
 * Số người đã bình chọn.
 *
 * Đây là con số DUY NHẤT của luồng bình chọn được phép lên LED khi phiếu còn
 * mở: nó nói "đang có nhiều người tham gia", không nói ai đang dẫn đầu.
 */
export function participantCount(sessionId: string): number {
  return (
    get<{ n: number }>(
      "select count(*) as n from audience_ballots where voting_session_id = ?",
      sessionId,
    )?.n ?? 0
  );
}

/* ── Kiểm phiếu — chỉ chạy khi chốt snapshot ─────────────────────────────── */

interface Tally {
  performanceId: string;
  votes: number;
}

/**
 * KHÔNG export. Đếm phiếu từng tiết mục là dữ liệu nhạy cảm nhất của luồng này;
 * nếu nó có thể gọi được từ bên ngoài thì sớm muộn sẽ có ai đó gọi nó ở một
 * component LED.
 */
function tallyFor(sessionId: string): Tally[] {
  return all<{ performance_id: string; n: number }>(
    `select p.performance_id, count(*) as n
     from audience_votes p
     join audience_ballots b on b.id = p.ballot_id
     where b.voting_session_id = ?
     group by p.performance_id
     order by n desc`,
    sessionId,
  ).map((r) => ({ performanceId: r.performance_id, votes: r.n }));
}

export interface AudienceSnapshotPayload {
  sessionId: string;
  participants: number;
  totalVotes: number;
  results: { performanceId: string; votes: number }[];
  winnerPerformanceId: string | null;
  /** true khi có từ hai tiết mục đồng phiếu cao nhất — hệ thống KHÔNG tự chọn. */
  tied: boolean;
}

/**
 * Chốt kết quả. Sau lời gọi này, con số không đổi nữa dù có phiếu nào về muộn.
 *
 * Đồng phiếu thì `winnerPerformanceId` là null và `tied` là true: hệ thống dừng
 * lại chờ BTC quyết, không tự bốc một cái tên ra.
 */
export function createAudienceSnapshot(
  location: LocationCode,
  sessionId: string,
  createdBy?: string | null,
): { snapshotId: string; payload: AudienceSnapshotPayload } {
  return tx(() => {
    const results = tallyFor(sessionId);
    const top = results[0]?.votes ?? 0;
    const leaders = results.filter((r) => r.votes === top && top > 0);

    const payload: AudienceSnapshotPayload = {
      sessionId,
      participants: participantCount(sessionId),
      totalVotes: results.reduce((n, r) => n + r.votes, 0),
      results,
      winnerPerformanceId: leaders.length === 1 ? leaders[0].performanceId : null,
      tied: leaders.length > 1,
    };

    const id = uuid();
    run(
      "insert into result_snapshots (id, location, kind, payload, created_by, created_at) values (?, ?, 'audience', ?, ?, ?)",
      id,
      location,
      JSON.stringify(payload),
      createdBy ?? null,
      now(),
    );
    run(
      "update voting_sessions set status = 'verified', updated_at = ? where id = ?",
      now(),
      sessionId,
    );
    publish({ type: "voting_verified", location });
    return { snapshotId: id, payload };
  });
}

export function readSnapshot<T>(snapshotId: string): T | null {
  const row = get<{ payload: string }>(
    "select payload from result_snapshots where id = ?",
    snapshotId,
  );
  return row ? (JSON.parse(row.payload) as T) : null;
}

export function latestSnapshot<T>(
  location: LocationCode,
  kind: "judging" | "audience",
): { id: string; payload: T } | null {
  const row = get<{ id: string; payload: string }>(
    "select id, payload from result_snapshots where location = ? and kind = ? order by created_at desc limit 1",
    location,
    kind,
  );
  return row ? { id: row.id, payload: JSON.parse(row.payload) as T } : null;
}
