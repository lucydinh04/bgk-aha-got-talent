import "server-only";

import { all, get, now, run, tx, uuid } from "@/lib/db";
import { buildSnapshot, SPREADSHEET_ID, type RegistrationRecord } from "@/lib/sheet/source";

/**
 * Đồng bộ Google Sheet → DB. Hai bước, không bao giờ một bước.
 *
 * `preview` đọc sheet, so từng dòng với DB rồi ghi kết quả vào `sheet_sync_staging`.
 * `commit` áp đúng những gì đã staging. Admin nhìn thấy chính xác thứ sắp xảy ra
 * trước khi nó xảy ra — với dữ liệu của một sự kiện chạy live, đó là điều kiện
 * tối thiểu.
 *
 * Ba thứ sync KHÔNG BAO GIỜ đụng tới:
 *   · điểm — không có câu UPDATE nào chạm bảng `scores`
 *   · phân công BGK — không có câu nào chạm `judge_assignments`
 *   · quyết định của BTC — thứ tự diễn, tên hiển thị chính thức, trạng thái duyệt
 *
 * Dòng biến mất khỏi sheet được đánh dấu `source_missing`, không bị xoá. Người
 * ta xoá nhầm một dòng Google Sheet dễ hơn nhiều so với việc BTC cố ý huỷ một
 * tiết mục.
 */

/** Field do Google Sheet sở hữu — chỉ những cột này bị ghi đè khi sync. */
const SHEET_OWNED = [
  "performance_name",
  "performance_type",
  "participation_type",
  "duration_minutes",
  "representative_name",
  "department",
  "member_count",
  "concept_description",
  "transformation_highlight",
  "costume_idea",
  "ai_technology_usage",
] as const;

type SheetField = (typeof SHEET_OWNED)[number];

export type DiffType = "new" | "updated" | "unchanged" | "source_missing" | "error";

export interface FieldChange {
  field: SheetField;
  from: string | number | null;
  to: string | number | null;
}

export interface SyncRow {
  registrationCode: string;
  performanceName: string;
  location: string | null;
  diff: DiffType;
  sourceRow: number | null;
  changes: FieldChange[];
  issues: string[];
}

export interface SyncPreview {
  syncLogId: string;
  fetchedAt: string;
  spreadsheetId: string;
  rows: SyncRow[];
  summary: {
    total: number;
    new: number;
    updated: number;
    unchanged: number;
    sourceMissing: number;
    error: number;
  };
}

function normalized(record: RegistrationRecord): Record<SheetField, string | number | null> {
  return {
    performance_name: record.performance_name,
    performance_type: record.performance_type,
    participation_type: record.participation_type,
    duration_minutes: record.duration_minutes,
    representative_name: record.representative_name,
    department: record.department,
    member_count: record.member_count,
    concept_description: record.concept_description,
    transformation_highlight: record.transformation_highlight,
    costume_idea: record.costume_idea,
    ai_technology_usage: record.ai_technology_usage,
  };
}

/**
 * Sheet để trống KHÔNG có nghĩa là "xoá giá trị đang có".
 *
 * Người ta hay xoá tạm một ô rồi quên điền lại. Nếu sync coi ô trống là lệnh
 * xoá thì mọi mô tả ý tưởng đều có thể bốc hơi sau một lần bấm nhầm. Chỉ giá
 * trị mới có nội dung mới được ghi đè.
 */
function isMeaningfulChange(from: unknown, to: string | number | null): boolean {
  if (to === null || to === "") return false;
  return String(from ?? "") !== String(to);
}

/* ── Preview ─────────────────────────────────────────────────────────────── */

export async function previewSync(initiatedBy?: string | null): Promise<SyncPreview> {
  const snapshot = await buildSnapshot();
  const syncLogId = uuid();
  const startedAt = now();

  const rows: SyncRow[] = [];
  const seen = new Set<string>();

  for (const record of snapshot.performances) {
    const code = record.registration_code;
    seen.add(code);

    const existing = get<Record<string, unknown>>(
      `select id, ${SHEET_OWNED.join(", ")} from performances where registration_code = ?`,
      code,
    );
    const incoming = normalized(record);
    const issues = (snapshot.issues[code] ?? []).map((i) => i.message);

    if (!existing) {
      rows.push({
        registrationCode: code,
        performanceName: record.performance_name ?? "(chưa đặt tên)",
        location: record.location,
        diff: "new",
        sourceRow: record._meta.source_row,
        changes: SHEET_OWNED.filter((f) => incoming[f] !== null).map((f) => ({
          field: f,
          from: null,
          to: incoming[f],
        })),
        issues,
      });
      continue;
    }

    const changes: FieldChange[] = SHEET_OWNED.filter((f) =>
      isMeaningfulChange(existing[f], incoming[f]),
    ).map((f) => ({
      field: f,
      from: (existing[f] ?? null) as string | number | null,
      to: incoming[f],
    }));

    rows.push({
      registrationCode: code,
      performanceName: record.performance_name ?? "(chưa đặt tên)",
      location: record.location,
      diff: changes.length ? "updated" : "unchanged",
      sourceRow: record._meta.source_row,
      changes,
      issues,
    });
  }

  // Dòng có trong DB nhưng không còn trong sheet.
  const orphans = all<{ registration_code: string; performance_name: string; location: string }>(
    "select registration_code, performance_name, location from performances",
  ).filter((p) => !seen.has(p.registration_code));

  for (const o of orphans) {
    rows.push({
      registrationCode: o.registration_code,
      performanceName: o.performance_name,
      location: o.location,
      diff: "source_missing",
      sourceRow: null,
      changes: [],
      issues: ["Dòng không còn trong Google Sheet. Record được giữ nguyên, chỉ gắn cờ."],
    });
  }

  for (const r of snapshot.rejected) {
    rows.push({
      registrationCode: r.raw_code || `(dòng ${r.source_row})`,
      performanceName: "—",
      location: null,
      diff: "error",
      sourceRow: r.source_row,
      changes: [],
      issues: r.issues.map((i) => i.message),
    });
  }

  const summary = {
    total: rows.length,
    new: rows.filter((r) => r.diff === "new").length,
    updated: rows.filter((r) => r.diff === "updated").length,
    unchanged: rows.filter((r) => r.diff === "unchanged").length,
    sourceMissing: rows.filter((r) => r.diff === "source_missing").length,
    error: rows.filter((r) => r.diff === "error").length,
  };

  tx(() => {
    run(
      `insert into sheet_sync_logs
         (id, spreadsheet_id, initiated_by, sync_started_at, total_source_rows,
          new_records, updated_records, unchanged_records, failed_records,
          sync_status, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'previewed', ?)`,
      syncLogId,
      SPREADSHEET_ID,
      initiatedBy ?? null,
      startedAt,
      snapshot.summary.total_source_rows,
      summary.new,
      summary.updated,
      summary.unchanged,
      summary.error,
      startedAt,
    );

    const byCode = new Map(snapshot.performances.map((p) => [p.registration_code, p]));
    for (const r of rows) {
      run(
        `insert into sheet_sync_staging
           (id, sync_log_id, registration_code, source_row, diff_type,
            changed_fields, normalized, issues)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        uuid(),
        syncLogId,
        r.registrationCode,
        r.sourceRow,
        r.diff,
        JSON.stringify(r.changes),
        JSON.stringify(byCode.get(r.registrationCode) ?? null),
        JSON.stringify(r.issues),
      );
    }
  });

  return {
    syncLogId,
    fetchedAt: snapshot.fetched_at,
    spreadsheetId: SPREADSHEET_ID,
    rows,
    summary,
  };
}

/* ── Commit ──────────────────────────────────────────────────────────────── */

export interface SyncResult {
  applied: { created: number; updated: number; flagged: number };
  skipped: number;
}

export function commitSync(syncLogId: string): SyncResult {
  const log = get<{ sync_status: string }>(
    "select sync_status from sheet_sync_logs where id = ?",
    syncLogId,
  );
  if (!log) throw new Error("Không tìm thấy phiên sync này.");
  if (log.sync_status === "committed") {
    throw new Error("Phiên sync này đã được áp dụng rồi.");
  }

  const staged = all<{
    registration_code: string;
    diff_type: DiffType;
    changed_fields: string;
    normalized: string;
  }>(
    "select registration_code, diff_type, changed_fields, normalized " +
      "from sheet_sync_staging where sync_log_id = ?",
    syncLogId,
  );

  const result: SyncResult = { applied: { created: 0, updated: 0, flagged: 0 }, skipped: 0 };

  tx(() => {
    const t = now();

    for (const s of staged) {
      const record = JSON.parse(s.normalized) as RegistrationRecord | null;

      if (s.diff_type === "source_missing") {
        run(
          "update performances set source_missing = 1, updated_at = ? where registration_code = ?",
          t,
          s.registration_code,
        );
        result.applied.flagged += 1;
        continue;
      }

      if (s.diff_type === "error" || !record || !record.location) {
        result.skipped += 1;
        continue;
      }

      if (s.diff_type === "new") {
        const incoming = normalized(record);
        run(
          `insert into performances
             (id, registration_code, location, performance_name, performance_type,
              participation_type, duration_minutes, representative_name, department,
              member_count, concept_description, transformation_highlight,
              costume_idea, ai_technology_usage,
              review_status, info_incomplete, last_synced_at, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?)
           on conflict (registration_code) do nothing`,
          uuid(),
          record.registration_code,
          record.location,
          incoming.performance_name ?? "(chưa đặt tên)",
          incoming.performance_type,
          incoming.participation_type,
          incoming.duration_minutes,
          incoming.representative_name,
          incoming.department,
          incoming.member_count,
          incoming.concept_description,
          incoming.transformation_highlight,
          incoming.costume_idea,
          incoming.ai_technology_usage,
          incoming.concept_description && incoming.duration_minutes ? 0 : 1,
          t,
          t,
          t,
        );
        result.applied.created += 1;
        continue;
      }

      const changes = JSON.parse(s.changed_fields) as FieldChange[];
      if (!changes.length) {
        run(
          "update performances set last_synced_at = ?, source_missing = 0 where registration_code = ?",
          t,
          s.registration_code,
        );
        continue;
      }

      // Chỉ những cột thật sự đổi mới được ghi — và chỉ trong SHEET_OWNED.
      const sets = changes
        .filter((c) => (SHEET_OWNED as readonly string[]).includes(c.field))
        .map((c) => `${c.field} = ?`);
      const values = changes
        .filter((c) => (SHEET_OWNED as readonly string[]).includes(c.field))
        .map((c) => c.to);

      run(
        `update performances set ${sets.join(", ")}, source_missing = 0,
           last_synced_at = ?, updated_at = ? where registration_code = ?`,
        ...values,
        t,
        t,
        s.registration_code,
      );
      result.applied.updated += 1;
    }

    run(
      "update sheet_sync_logs set sync_status = 'committed', sync_completed_at = ? where id = ?",
      t,
      syncLogId,
    );
  });

  return result;
}

/* ── Lịch sử ─────────────────────────────────────────────────────────────── */

export interface SyncLogEntry {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  initiatedByEmail: string | null;
  newRecords: number;
  updatedRecords: number;
  unchangedRecords: number;
  failedRecords: number;
}

export function syncHistory(limit = 20): SyncLogEntry[] {
  return all<{
    id: string;
    sync_started_at: string;
    sync_completed_at: string | null;
    sync_status: string;
    email: string | null;
    new_records: number;
    updated_records: number;
    unchanged_records: number;
    failed_records: number;
  }>(
    `select l.id, l.sync_started_at, l.sync_completed_at, l.sync_status,
            u.email, l.new_records, l.updated_records, l.unchanged_records, l.failed_records
     from sheet_sync_logs l
     left join users u on u.id = l.initiated_by
     order by l.sync_started_at desc
     limit ?`,
    limit,
  ).map((r) => ({
    id: r.id,
    startedAt: r.sync_started_at,
    completedAt: r.sync_completed_at,
    status: r.sync_status,
    initiatedByEmail: r.email,
    newRecords: r.new_records,
    updatedRecords: r.updated_records,
    unchangedRecords: r.unchanged_records,
    failedRecords: r.failed_records,
  }));
}
