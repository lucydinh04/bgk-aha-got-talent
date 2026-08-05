import "server-only";

import { all, get, now, run, tx, uuid } from "@/lib/db";
import { AWARDS, CRITERIA, type LocationCode } from "@/lib/data";
import { publish } from "./events";
import { listApproved } from "./performances";
import { progressOfPerformance, scoresOfPerformance } from "./scores";
import { latestSnapshot, type AudienceSnapshotPayload } from "./voting";

/**
 * Công bố giải.
 *
 * BA BẤT BIẾN:
 *
 *  1. Winner đến từ SNAPSHOT ĐÃ KHOÁ, không bao giờ tính lại lúc reveal. Điểm
 *     về muộn, BGK sửa điểm, mạng chập chờn — không thứ nào đổi được người
 *     thắng sau khi Admin đã chốt.
 *  2. Giải chỉ có winner khi `published_at` khác null. Trước đó `performance_id`
 *     vẫn trống, nên không có đường nào để LED hay client đoán trước.
 *  3. Giải cao nhất bị chặn tới khi mọi giải khác đã công bố. Đó là luật cứng
 *     duy nhất của trình tự công bố, và nó nằm ở tầng này.
 */

export interface AwardRow {
  id: string;
  location: LocationCode;
  code: string;
  nameEn: string;
  nameVi: string;
  sortOrder: number;
  source: "judging" | "audience_vote";
  performanceId: string | null;
  publishedAt: string | null;
}

interface Row {
  id: string;
  location: LocationCode;
  code: string;
  name_en: string;
  name_vi: string;
  sort_order: number;
  source: "judging" | "audience_vote";
  performance_id: string | null;
  published_at: string | null;
}

const toAward = (r: Row): AwardRow => ({
  id: r.id,
  location: r.location,
  code: r.code,
  nameEn: r.name_en,
  nameVi: r.name_vi,
  sortOrder: r.sort_order,
  source: r.source,
  performanceId: r.performance_id,
  publishedAt: r.published_at,
});

const GRAND_CODE = "breakthrough_act";

/** Nạp cơ cấu giải từ cấu hình vào DB. Idempotent — gọi lại không tạo trùng. */
export function ensureAwards(location: LocationCode): AwardRow[] {
  tx(() => {
    for (const a of AWARDS[location]) {
      if (!a.enabled) continue;
      const t = now();
      run(
        `insert into awards (id, location, code, name_en, name_vi, sort_order, source, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (location, code) do update set
           name_en = excluded.name_en, name_vi = excluded.name_vi,
           sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
        uuid(),
        location,
        a.code,
        a.nameEn,
        a.nameVi,
        a.order,
        a.source === "audience_vote" ? "audience_vote" : "judging",
        t,
        t,
      );
    }
  });
  return listAwards(location);
}

export function listAwards(location: LocationCode): AwardRow[] {
  return all<Row>(
    `select id, location, code, name_en, name_vi, sort_order, source, performance_id, published_at
     from awards where location = ? order by sort_order`,
    location,
  ).map(toAward);
}

export function awardById(id: string): AwardRow | undefined {
  const row = get<Row>(
    `select id, location, code, name_en, name_vi, sort_order, source, performance_id, published_at
     from awards where id = ?`,
    id,
  );
  return row ? toAward(row) : undefined;
}

/* ── Snapshot điểm BGK ───────────────────────────────────────────────────── */

export interface JudgingSnapshotPayload {
  location: LocationCode;
  rows: {
    performanceId: string;
    avgTotal: number;
    perCriterion: Record<string, number>;
    judgeCount: number;
    rankable: boolean;
  }[];
  /** Cặp đồng điểm — BTC phải quyết, hệ thống không tự xếp. */
  ties: string[][];
}

/**
 * Bảy điều kiện mở phần công bố. Trả về danh sách chưa đạt; rỗng nghĩa là đủ.
 */
export function publishBlockers(location: LocationCode): string[] {
  const rows = listApproved(location);
  const blockers: string[] = [];

  if (rows.length === 0) return ["Chưa có tiết mục nào được duyệt."];

  const notPerformed = rows.filter((p) => p.liveStatus !== "performed");
  if (notPerformed.length) {
    blockers.push(`${notPerformed.length} tiết mục chưa biểu diễn xong`);
  }

  const incomplete = rows.filter((p) => !progressOfPerformance(p.id).complete);
  if (incomplete.length) {
    blockers.push(`${incomplete.length} tiết mục chưa đủ phiếu chấm`);
  }

  const drafts = rows.reduce(
    (n, p) => n + scoresOfPerformance(p.id).filter((s) => s.status === "draft").length,
    0,
  );
  if (drafts) blockers.push(`${drafts} bản nháp chưa gửi`);

  return blockers;
}

/**
 * Chốt bảng điểm. Gọi một lần, trước khi công bố giải đầu tiên.
 *
 * Đồng thời khoá toàn bộ điểm của đầu cầu: sau snapshot, BGK không sửa được
 * nữa. Nếu không khoá, con số trên sân khấu và con số trong DB có thể lệch nhau
 * ngay giữa lúc đang trao giải.
 */
export function createJudgingSnapshot(
  location: LocationCode,
  createdBy?: string | null,
): { snapshotId: string; payload: JudgingSnapshotPayload } {
  return tx(() => {
    const rows = listApproved(location).map((p) => {
      const scores = scoresOfPerformance(p.id).filter(
        (s) => s.status === "submitted" || s.status === "locked",
      );
      const judgeCount = scores.length;
      const avg = (pick: (s: (typeof scores)[number]) => number | null) => {
        const vals = scores.map(pick).filter((v): v is number => v != null);
        if (!vals.length) return 0;
        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      };

      const perCriterion: Record<string, number> = {};
      for (const c of CRITERIA) {
        perCriterion[c.key] = avg(
          (s) => (s as unknown as Record<string, number | null>)[c.column],
        );
      }

      return {
        performanceId: p.id,
        avgTotal: avg((s) => s.total_score),
        perCriterion,
        judgeCount,
        rankable: judgeCount > 0 && progressOfPerformance(p.id).complete,
      };
    });

    const rankable = rows.filter((r) => r.rankable).sort((a, b) => b.avgTotal - a.avgTotal);
    const byScore = new Map<number, string[]>();
    for (const r of rankable) {
      byScore.set(r.avgTotal, [...(byScore.get(r.avgTotal) ?? []), r.performanceId]);
    }
    const ties = [...byScore.values()].filter((g) => g.length > 1);

    const payload: JudgingSnapshotPayload = { location, rows, ties };
    const id = uuid();
    run(
      "insert into result_snapshots (id, location, kind, payload, created_by, created_at) values (?, ?, 'judging', ?, ?, ?)",
      id,
      location,
      JSON.stringify(payload),
      createdBy ?? null,
      now(),
    );

    // Khoá điểm cùng lúc với snapshot — hai việc này không được tách rời.
    const t = now();
    run(
      "update scores set status = 'locked', locked_at = ?, updated_at = ? where location = ? and status = 'submitted'",
      t,
      t,
      location,
    );

    publish({ type: "score_locked", location });
    publish({ type: "awards_ready", location });
    return { snapshotId: id, payload };
  });
}

/* ── Công bố ─────────────────────────────────────────────────────────────── */

export class AwardError extends Error {
  constructor(
    message: string,
    readonly code: "no_snapshot" | "blocked" | "tied" | "already" | "not_found",
  ) {
    super(message);
    this.name = "AwardError";
  }
}

/** Thứ hạng đã công bố rồi thì không lấy lại cho giải sau. */
function alreadyWon(location: LocationCode): Set<string> {
  return new Set(
    listAwards(location)
      .filter((a) => a.publishedAt && a.performanceId)
      .map((a) => a.performanceId as string),
  );
}

/**
 * Ai thắng giải này, theo snapshot đã khoá.
 *
 * Giải do BGK chấm: lấy tiết mục điểm cao nhất chưa nhận giải nào. Giải cao
 * nhất (`breakthrough_act`) lấy hạng nhất; các giải còn lại lấy dần xuống theo
 * thứ tự công bố.
 */
export function resolveWinner(
  location: LocationCode,
  award: AwardRow,
): { performanceId: string; snapshotId: string } {
  if (award.source === "audience_vote") {
    const snap = latestSnapshot<AudienceSnapshotPayload>(location, "audience");
    if (!snap) {
      throw new AwardError(
        "Chưa chốt kết quả bình chọn khán giả. Đóng phiếu và xác minh trước.",
        "no_snapshot",
      );
    }
    if (snap.payload.tied || !snap.payload.winnerPerformanceId) {
      throw new AwardError(
        "Có tiết mục đồng phiếu cao nhất. Ban Tổ chức cần quyết trước khi công bố.",
        "tied",
      );
    }
    return {
      performanceId: snap.payload.winnerPerformanceId,
      snapshotId: snap.id,
    };
  }

  const snap = latestSnapshot<JudgingSnapshotPayload>(location, "judging");
  if (!snap) {
    throw new AwardError(
      "Chưa chốt bảng điểm. Tạo Publishing Snapshot trước khi công bố.",
      "no_snapshot",
    );
  }

  const taken = alreadyWon(location);
  const ranked = snap.payload.rows
    .filter((r) => r.rankable && !taken.has(r.performanceId))
    .sort((a, b) => b.avgTotal - a.avgTotal);

  if (!ranked.length) {
    throw new AwardError("Không còn tiết mục đủ điều kiện xếp hạng.", "no_snapshot");
  }

  // Giải cao nhất lấy hạng 1 còn lại; giải thấp hơn lấy từ dưới lên trong
  // nhóm còn lại, để trao ngược từ giải nhỏ tới giải lớn vẫn ra đúng người.
  const pick =
    award.code === GRAND_CODE ? ranked[0] : ranked[ranked.length - 1];

  const tiedWith = ranked.filter((r) => r.avgTotal === pick.avgTotal);
  if (tiedWith.length > 1) {
    throw new AwardError(
      `Có ${tiedWith.length} tiết mục cùng ${pick.avgTotal.toFixed(2)} điểm. Ban Tổ chức cần quyết trước khi công bố.`,
      "tied",
    );
  }

  return { performanceId: pick.performanceId, snapshotId: snap.id };
}

export function publishAward(
  awardId: string,
  publishedBy?: string | null,
): AwardRow {
  return tx(() => {
    const award = awardById(awardId);
    if (!award) throw new AwardError("Không tìm thấy giải.", "not_found");
    if (award.publishedAt) {
      throw new AwardError("Giải này đã được công bố.", "already");
    }

    // Luật cứng: giải cao nhất đi sau cùng.
    if (award.code === GRAND_CODE) {
      const others = listAwards(award.location).filter((a) => a.code !== GRAND_CODE);
      const pending = others.filter((a) => !a.publishedAt);
      if (pending.length) {
        throw new AwardError(
          `Còn ${pending.length} giải chưa công bố. Giải cao nhất luôn đi cuối.`,
          "blocked",
        );
      }
    }

    const { performanceId, snapshotId } = resolveWinner(award.location, award);
    run(
      "update awards set performance_id = ?, snapshot_id = ?, published_at = ?, published_by = ?, updated_at = ? where id = ?",
      performanceId,
      snapshotId,
      now(),
      publishedBy ?? null,
      now(),
      awardId,
    );

    publish({ type: "award_published", location: award.location });
    return awardById(awardId)!;
  });
}

/** Điểm chi tiết của một giải — CHỈ dùng cho màn scorecard sau khi đã công bố. */
export function scorecardFor(award: AwardRow): {
  perCriterion: { key: string; label: string; weight: number; value: string }[];
  total: string;
} | null {
  if (!award.publishedAt || !award.performanceId) return null;
  if (award.source !== "judging") return null;

  const snap = latestSnapshot<JudgingSnapshotPayload>(award.location, "judging");
  const row = snap?.payload.rows.find((r) => r.performanceId === award.performanceId);
  if (!row) return null;

  return {
    perCriterion: CRITERIA.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      value: (row.perCriterion[c.key] ?? 0).toFixed(2),
    })),
    total: row.avgTotal.toFixed(2),
  };
}
