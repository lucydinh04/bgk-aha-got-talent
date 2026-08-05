/**
 * Đọc + normalize Google Sheet.
 *
 * Cổng vào DUY NHẤT của dữ liệu đăng ký. Chạy trên server, không bao giờ trên
 * client: spreadsheet chứa email, số điện thoại và Telegram của người tham gia.
 *
 * Đây là bản TypeScript của `scripts/fetch-sheet.mjs`. Script CLI ở repo gốc
 * import thẳng file này, nên chỉ có một bản logic — sửa ở đây là sửa cả hai.
 *
 * Vì sao không parse theo vị trí cột cứng: sheet "Đăng ký" có hàng header lệch
 * 1 cột so với dữ liệu ở các dòng đăng ký từ 29/07/2026. Chi tiết ở
 * docs/00-data-audit.md — đừng viết lại theo cách khác.
 */

export const SPREADSHEET_ID =
  process.env.GOOGLE_SHEET_ID ?? "1D-kqGPIj6N2_xv0b0PxmYU8dOe2P8wGull7dBZX3yX4";

const SHEET_REGISTRATION = "AhaTalent - Đăng ký";
const SHEET_MEMBERS = "AhaTalent - Thành viên";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEGRAM_RE = /^@[\w]{3,}$/;
const LOCATIONS = new Set(["SGN", "HAN"]);

/** Giá trị người dùng nhập nghĩa là "chưa có thông tin", không phải lỗi hệ thống. */
const PLACEHOLDER_VALUES = [
  "không áp dụng",
  "nộp sau nhé",
  "nộp sau",
  "bí mật",
  "bí mật chỉ chờ ngày bật mí!",
  "chưa có",
  "n/a",
  "-",
];

export type IssueLevel = "info" | "warning" | "error";

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
}

export interface RegistrationRecord {
  registration_code: string;
  source_submitted_at: string | null;
  programme_context: string | null;
  location: "SGN" | "HAN" | null;
  participation_type: string | null;
  performance_name: string | null;
  performance_type: string | null;
  duration_minutes: number | null;
  representative_name: string | null;
  representative_telegram: string | null;
  department: string | null;
  representative_email: string | null;
  representative_phone: string | null;
  member_count: number | null;
  member_list_raw: string | null;
  concept_description: string | null;
  transformation_highlight: string | null;
  costume_idea: string | null;
  ai_technology_usage: string | null;
  support_required: boolean | null;
  support_description: string | null;
  registration_status: string | null;
  organiser_note: string | null;
  source_updated_at: string | null;
  member_rows_found?: number;
  _meta: {
    source_row: number;
    column_offset: 0 | 1;
    shape_confidence: "email" | "telegram" | "fallback";
    backfilled?: string[];
  };
}

export interface MemberRecord {
  registration_code: string;
  location: string | null;
  performance_name: string | null;
  full_name: string | null;
  telegram: string | null;
  department: string | null;
  is_representative: boolean;
  role: string | null;
  _meta: { source_row: number };
}

export interface Snapshot {
  fetched_at: string;
  spreadsheet_id: string;
  header_labels: string[];
  summary: {
    total_source_rows: number;
    performances: number;
    sgn: number;
    han: number;
    members: number;
    rejected: number;
    rows_with_issues: number;
    rows_new_layout: number;
    rows_legacy_layout: number;
  };
  performances: RegistrationRecord[];
  members: MemberRecord[];
  issues: Record<string, Issue[]>;
  rejected: { source_row: number; issues: Issue[]; raw_code: string }[];
}

export class SheetAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetAccessError";
  }
}

/* ── Transport ───────────────────────────────────────────────────────────── */

type Cell = string | number | boolean | null;

/**
 * Đọc một sheet qua gviz endpoint.
 *
 * Dùng được vì spreadsheet đang share "anyone with the link". Khi BTC siết
 * quyền, thay thân hàm này bằng Sheets API v4 + service account — phần còn lại
 * của file không cần biết.
 */
async function fetchSheet(
  sheetName: string,
): Promise<{ labels: string[]; rows: Cell[][] }> {
  const url = new URL(
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`,
  );
  url.searchParams.set("sheet", sheetName);
  url.searchParams.set("tqx", "out:json");
  url.searchParams.set("headers", "1");

  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) {
    throw new SheetAccessError(
      `Không đọc được sheet "${sheetName}" (HTTP ${res.status}). ` +
        `Kiểm tra quyền chia sẻ của spreadsheet.`,
    );
  }

  const text = await res.text();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new SheetAccessError(
      `Phản hồi từ Google không đúng định dạng cho sheet "${sheetName}". ` +
        `Thường là do spreadsheet bị đổi sang chế độ riêng tư.`,
    );
  }

  const payload = JSON.parse(text.slice(start, end + 1));
  if (payload.status === "error") {
    const reason = payload.errors
      ?.map((e: { detailed_message?: string }) => e.detailed_message)
      .join("; ");
    throw new SheetAccessError(`Google trả về lỗi: ${reason ?? "không rõ"}`);
  }

  return {
    labels: (payload.table.cols as { label?: string }[]).map((c) =>
      (c.label ?? "").trim(),
    ),
    rows: (payload.table.rows as { c?: ({ f?: string; v?: Cell } | null)[] }[]).map(
      (r) => (r.c ?? []).map((cell) => (cell == null ? null : (cell.f ?? cell.v ?? null))),
    ),
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const str = (v: Cell | undefined): string => (v == null ? "" : String(v).trim());

function isPlaceholder(value: Cell | undefined): boolean {
  return PLACEHOLDER_VALUES.includes(str(value).toLowerCase());
}

function meaningful(value: Cell | undefined): string | null {
  const s = str(value);
  if (!s || isPlaceholder(s)) return null;
  return s;
}

function toInt(value: Cell | undefined): number | null {
  const s = str(value).replace(/[^\d]/g, "");
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** "23/07/2026 10:17:23" -> ISO string. Form ghi theo giờ VN (UTC+7). */
function toIso(value: Cell | undefined): string | null {
  const s = str(value);
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", sec = "0"] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h - 7, +mi, +sec));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const YES = new Set(["có", "yes", "true", "1"]);
function toBool(value: Cell | undefined): boolean | null {
  const s = str(value).toLowerCase();
  if (!s) return null;
  return YES.has(s);
}

/* ── Shape detection — trái tim của normalizer ───────────────────────────── */

/**
 * Header của sheet "Đăng ký" mô tả layout CŨ (24 cột). Từ 29/07/2026 có một cột
 * "thời lượng" thứ hai được chèn vào vị trí I, nhưng header không được cập
 * nhật. Hệ quả: các dòng mới lệch +1 kể từ index 8 trở đi.
 *
 * Thay vì tin header, ta định vị theo *nội dung*: cột email là mỏ neo đáng tin
 * nhất — chỉ đúng một cột trong dòng khớp email regex.
 */
function detectRowShape(row: Cell[]): {
  offset: 0 | 1;
  confidence: "email" | "telegram" | "fallback";
} {
  for (const idx of [11, 12] as const) {
    if (EMAIL_RE.test(str(row[idx]))) {
      return { offset: (idx - 11) as 0 | 1, confidence: "email" };
    }
  }
  for (const idx of [9, 10] as const) {
    if (TELEGRAM_RE.test(str(row[idx]))) {
      return { offset: (idx - 9) as 0 | 1, confidence: "telegram" };
    }
  }
  // Không định vị được: giả định layout mới (đa số dòng), đánh dấu để BTC xem lại.
  return { offset: 1, confidence: "fallback" };
}

const REGISTRATION_FIELDS = {
  registration_code: 0,
  source_submitted_at: 1,
  programme_context: 2,
  location: 3,
  participation_type: 4,
  performance_name: 5,
  performance_type: 6,
} as const;

/** index tính từ 8, sẽ được cộng thêm offset. */
const SHIFTED_FIELDS = {
  representative_name: 8,
  representative_telegram: 9,
  department: 10,
  representative_email: 11,
  representative_phone: 12,
  member_count: 13,
  member_list_raw: 14,
  concept_description: 15,
  transformation_highlight: 16,
  costume_idea: 17,
  ai_technology_usage: 18,
  support_required: 19,
  support_description: 20,
  registration_status: 21,
  organiser_note: 22,
  source_updated_at: 23,
} as const;

/* ── Normalize ───────────────────────────────────────────────────────────── */

function normalizeRegistrationRow(
  row: Cell[],
  rowNumber: number,
): { record: RegistrationRecord; issues: Issue[] } {
  const issues: Issue[] = [];
  const { offset, confidence } = detectRowShape(row);
  if (confidence === "fallback") {
    issues.push({
      level: "warning",
      code: "shape_undetermined",
      message:
        "Không xác định được cấu trúc cột của dòng này (thiếu email và telegram hợp lệ). " +
        "Đã đọc theo layout mới — BTC nên kiểm tra lại.",
    });
  }

  const raw: Record<string, Cell | undefined> = {};
  for (const [key, idx] of Object.entries(REGISTRATION_FIELDS)) raw[key] = row[idx];
  for (const [key, idx] of Object.entries(SHIFTED_FIELDS)) raw[key] = row[idx + offset];

  // Thời lượng nằm ở H (layout cũ) hoặc I (layout mới, khi H = "Không áp dụng").
  const durationCandidates = offset === 1 ? [row[7], row[8]] : [row[7]];
  const duration_minutes = durationCandidates.map(toInt).find((n) => n != null) ?? null;

  const registration_code = str(raw.registration_code);
  const location = str(raw.location).toUpperCase();

  if (!registration_code) {
    issues.push({
      level: "error",
      code: "missing_registration_code",
      message: "Dòng không có Mã đăng ký — không thể import.",
    });
  }
  if (!LOCATIONS.has(location)) {
    issues.push({
      level: "error",
      code: "invalid_location",
      message: `Đầu cầu "${str(raw.location)}" không thuộc SGN hoặc HAN.`,
    });
  }
  // Mã đăng ký đã nhúng đầu cầu — dùng để bắt lỗi lệch dữ liệu.
  const codeLocation = registration_code.split("-")[1];
  if (codeLocation && location && codeLocation !== location) {
    issues.push({
      level: "error",
      code: "location_mismatch",
      message: `Mã đăng ký chứa "${codeLocation}" nhưng cột Đầu cầu là "${location}".`,
    });
  }
  if (duration_minutes == null) {
    issues.push({
      level: "info",
      code: "missing_duration",
      message: "Chưa có thời lượng — cần bổ sung trước khi chốt rundown.",
    });
  }

  const record: RegistrationRecord = {
    registration_code,
    source_submitted_at: toIso(raw.source_submitted_at),
    programme_context: meaningful(raw.programme_context),
    location: LOCATIONS.has(location) ? (location as "SGN" | "HAN") : null,
    participation_type: meaningful(raw.participation_type),
    performance_name: str(raw.performance_name) || null,
    performance_type: meaningful(raw.performance_type),
    duration_minutes,
    representative_name: meaningful(raw.representative_name),
    representative_telegram: meaningful(raw.representative_telegram),
    department: meaningful(raw.department),
    representative_email: meaningful(raw.representative_email),
    representative_phone: meaningful(raw.representative_phone),
    member_count: toInt(raw.member_count),
    member_list_raw: meaningful(raw.member_list_raw),
    concept_description: meaningful(raw.concept_description),
    transformation_highlight: meaningful(raw.transformation_highlight),
    costume_idea: meaningful(raw.costume_idea),
    ai_technology_usage: meaningful(raw.ai_technology_usage),
    support_required: toBool(raw.support_required),
    support_description: meaningful(raw.support_description),
    registration_status: meaningful(raw.registration_status),
    organiser_note: meaningful(raw.organiser_note),
    source_updated_at: toIso(raw.source_updated_at),
    _meta: { source_row: rowNumber, column_offset: offset, shape_confidence: confidence },
  };

  return { record, issues };
}

function normalizeMemberRow(row: Cell[], rowNumber: number): MemberRecord {
  const role = str(row[3]);
  return {
    registration_code: str(row[0]),
    location: str(row[1]).toUpperCase() || null,
    performance_name: str(row[2]) || null,
    full_name: str(row[4]) || null,
    telegram: meaningful(row[5]),
    department: meaningful(row[6]),
    is_representative: role.toLowerCase() === "đại diện",
    role: role || null,
    _meta: { source_row: rowNumber },
  };
}

/**
 * Sheet "Thành viên" là nguồn đầy đủ và sạch hơn cho tên người đại diện —
 * dùng để vá các dòng đăng ký cũ bị thiếu (docs/00-data-audit.md).
 */
function backfillFromMembers(
  performances: RegistrationRecord[],
  members: MemberRecord[],
): void {
  const repByCode = new Map<string, MemberRecord>();
  for (const m of members) {
    if (m.is_representative && m.full_name) repByCode.set(m.registration_code, m);
  }

  for (const p of performances) {
    const rep = repByCode.get(p.registration_code);
    if (!rep) continue;
    if (!p.representative_name) {
      p.representative_name = rep.full_name;
      p._meta.backfilled = [...(p._meta.backfilled ?? []), "representative_name"];
    }
    if (!p.representative_telegram && rep.telegram) {
      p.representative_telegram = rep.telegram;
      p._meta.backfilled = [...(p._meta.backfilled ?? []), "representative_telegram"];
    }
    if (!p.department && rep.department) {
      p.department = rep.department;
      p._meta.backfilled = [...(p._meta.backfilled ?? []), "department"];
    }
  }
}

/** So sánh member_count khai báo với số dòng thật trong sheet Thành viên. */
function reconcileMemberCounts(
  performances: RegistrationRecord[],
  members: MemberRecord[],
  issuesByCode: Map<string, Issue[]>,
): void {
  const counted = new Map<string, number>();
  for (const m of members) {
    counted.set(m.registration_code, (counted.get(m.registration_code) ?? 0) + 1);
  }
  for (const p of performances) {
    const actual = counted.get(p.registration_code) ?? 0;
    p.member_rows_found = actual;
    if (p.member_count != null && actual > 0 && p.member_count !== actual) {
      const list = issuesByCode.get(p.registration_code) ?? [];
      list.push({
        level: "warning",
        code: "member_count_mismatch",
        message: `Khai báo ${p.member_count} thành viên nhưng sheet Thành viên có ${actual} dòng.`,
      });
      issuesByCode.set(p.registration_code, list);
    }
  }
}

/* ── Main ────────────────────────────────────────────────────────────────── */

export async function buildSnapshot(): Promise<Snapshot> {
  const [registration, memberSheet] = await Promise.all([
    fetchSheet(SHEET_REGISTRATION),
    fetchSheet(SHEET_MEMBERS),
  ]);

  const issuesByCode = new Map<string, Issue[]>();
  const performances: RegistrationRecord[] = [];
  const rejected: Snapshot["rejected"] = [];

  registration.rows.forEach((row, i) => {
    if (row.every((c) => str(c) === "")) return; // dòng trống
    const { record, issues } = normalizeRegistrationRow(row, i + 2);
    const fatal = issues.filter((x) => x.level === "error");
    if (fatal.length) {
      rejected.push({
        source_row: i + 2,
        issues: fatal,
        raw_code: record.registration_code,
      });
      return;
    }
    if (issues.length) issuesByCode.set(record.registration_code, issues);
    performances.push(record);
  });

  const members = memberSheet.rows
    .filter((row) => str(row[0]) !== "")
    .map((row, i) => normalizeMemberRow(row, i + 2));

  backfillFromMembers(performances, members);
  reconcileMemberCounts(performances, members, issuesByCode);

  // Thứ tự nguồn KHÔNG phải thứ tự biểu diễn. Sắp theo thời gian gửi cho ổn định.
  performances.sort((a, b) =>
    str(a.source_submitted_at).localeCompare(str(b.source_submitted_at)),
  );

  const byLocation = (loc: string) => performances.filter((p) => p.location === loc);

  return {
    fetched_at: new Date().toISOString(),
    spreadsheet_id: SPREADSHEET_ID,
    header_labels: registration.labels,
    summary: {
      total_source_rows: registration.rows.length,
      performances: performances.length,
      sgn: byLocation("SGN").length,
      han: byLocation("HAN").length,
      members: members.length,
      rejected: rejected.length,
      rows_with_issues: issuesByCode.size,
      rows_new_layout: performances.filter((p) => p._meta.column_offset === 1).length,
      rows_legacy_layout: performances.filter((p) => p._meta.column_offset === 0).length,
    },
    performances,
    members,
    issues: Object.fromEntries(issuesByCode),
    rejected,
  };
}
