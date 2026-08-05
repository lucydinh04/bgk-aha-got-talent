/**
 * Dữ liệu DEMO cho tầng giao diện.
 *
 * Toàn bộ file này biến mất khi nối Supabase ở Giai đoạn 5. Nó chỉ tồn tại để
 * các màn hình có nội dung thật mà render — KHÔNG chứa business logic, không có
 * công thức tính điểm, không có luật nghiệp vụ nào.
 *
 * Danh sách tiết mục KHÔNG nằm ở đây: nó là dữ liệu thật, lấy từ Google Sheet
 * qua `scripts/fetch-sheet.mjs` → `src/data/performances.json`.
 */

import { performancesAt, type LocationCode } from "./data";

export type JudgeCellState = "todo" | "draft" | "submitted" | "locked" | "error";

export interface DemoJudge {
  id: string;
  name: string;
  title: string;
  online: boolean;
  lastSeen: string;
  /** trạng thái theo thứ tự tiết mục của đầu cầu */
  cells: JudgeCellState[];
}

export const JUDGES: Record<LocationCode, DemoJudge[]> = {
  SGN: [
    { id: "j1", name: "BGK 01", title: "Trưởng ban giám khảo", online: true, lastSeen: "vừa xong", cells: ["locked", "submitted", "submitted", "submitted"] },
    { id: "j2", name: "BGK 02", title: "Giám khảo", online: true, lastSeen: "vừa xong", cells: ["locked", "submitted", "submitted", "draft"] },
    { id: "j3", name: "BGK 03", title: "Giám khảo", online: false, lastSeen: "20:09", cells: ["locked", "submitted", "submitted", "submitted"] },
    { id: "j4", name: "BGK 04", title: "Khách mời", online: false, lastSeen: "19:58", cells: ["locked", "submitted", "draft", "todo"] },
    { id: "j5", name: "BGK 05", title: "Khách mời", online: false, lastSeen: "offline", cells: ["locked", "error", "todo", "todo"] },
  ],
  HAN: [
    { id: "h1", name: "BGK 01", title: "Trưởng ban giám khảo", online: false, lastSeen: "chưa đăng nhập", cells: ["todo", "todo", "todo", "todo"] },
    { id: "h2", name: "BGK 02", title: "Giám khảo", online: false, lastSeen: "chưa đăng nhập", cells: ["todo", "todo", "todo", "todo"] },
    { id: "h3", name: "BGK 03", title: "Giám khảo", online: false, lastSeen: "chưa đăng nhập", cells: ["todo", "todo", "todo", "todo"] },
    { id: "h4", name: "BGK 04", title: "Khách mời", online: false, lastSeen: "chưa đăng nhập", cells: ["todo", "todo", "todo", "todo"] },
    { id: "h5", name: "BGK 05", title: "Khách mời", online: false, lastSeen: "chưa đăng nhập", cells: ["todo", "todo", "todo", "todo"] },
  ],
};

export interface DemoResultRow {
  code: string;
  rank: string;
  name: string;
  team: string;
  avgTotal: string;
  perCriterion: [string, string, string, string, string];
  judgesDone: string;
  valid: "valid" | "tied" | "insufficient";
  awardCode?: string;
}

/**
 * Bảng xếp hạng SGN. Cặp 86.05 là ví dụ đồng điểm — hệ thống dừng lại và chờ
 * BTC quyết, không tự chọn người thắng.
 */
export const RESULTS: Record<LocationCode, DemoResultRow[]> = {
  SGN: [
    { code: "AHA26-SGN-260729140552-D0CT", rank: "1", name: "Reborn Queens — New Era", team: "Business Development", avgTotal: "89.40", perCriterion: ["90.00", "88.00", "92.00", "89.00", "87.00"], judgesDone: "5/5", valid: "valid", awardCode: "breakthrough_act" },
    { code: "AHA26-SGN-260730173814-KWAY", rank: "2=", name: "Đảo Bông Hậu", team: "Supply Operations", avgTotal: "86.05", perCriterion: ["88.00", "85.00", "87.00", "84.00", "86.00"], judgesDone: "5/5", valid: "tied", awardCode: "spotlight_act" },
    { code: "AHA26-SGN-260731100442-08NQ", rank: "2=", name: "Chuyển nhịp", team: "Platform", avgTotal: "86.05", perCriterion: ["88.00", "85.00", "87.00", "84.00", "86.00"], judgesDone: "5/5", valid: "tied", awardCode: "creative_pulse" },
    { code: "AHA26-SGN-260723101722-YV2A", rank: "—", name: "Bí mật chỉ chờ ngày bật mí!", team: "Central Operations", avgTotal: "—", perCriterion: ["—", "—", "—", "—", "—"], judgesDone: "3/5", valid: "insufficient" },
  ],
  HAN: [],
};

/** Kết quả bình chọn khán giả — chỉ Admin thấy, không bao giờ xuống LED khi chưa công bố. */
export const VOTING = {
  participants: 186,
  validBallots: 186,
  rejectedBallots: 4,
  totalVotes: 341,
  usedOne: 31,
  usedTwo: 155,
  winner: "AHA26-SGN-260723101722-YV2A",
  perPerformance: [
    { code: "AHA26-SGN-260723101722-YV2A", name: "Bí mật chỉ chờ ngày bật mí!", votes: 97 },
    { code: "AHA26-SGN-260729140552-D0CT", name: "Reborn Queens — New Era", votes: 92 },
    { code: "AHA26-SGN-260730173814-KWAY", name: "Đảo Bông Hậu", votes: 84 },
    { code: "AHA26-SGN-260731100442-08NQ", name: "Chuyển nhịp", votes: 68 },
  ],
  rejections: [
    { reason: "Ballot trùng người bình chọn", count: 2 },
    { reason: "Gửi sau hạn (server time)", count: 1 },
    { reason: "Mã tham dự đã dùng", count: 1 },
  ],
};

/** Bảy điều kiện mở phần công bố — hiển thị dạng checklist trên Live Control. */
export const READINESS: { label: string; done: boolean; detail?: string }[] = [
  { label: "Tất cả tiết mục đã biểu diễn", done: true },
  { label: "Tất cả tiết mục đã chấm xong", done: true },
  { label: "Không còn BGK lưu nháp", done: false, detail: "còn 1 · BGK 04 · tiết mục #04" },
  { label: "Không còn điểm chưa đồng bộ", done: true },
  { label: "Không còn điểm lỗi validation", done: true },
  { label: "Đủ BGK bắt buộc mọi tiết mục", done: false, detail: "#04 thiếu 1/5" },
  { label: "Admin xác nhận bảng kết quả cuối cùng", done: false },
];

export interface SyncRow {
  code: string;
  name: string;
  diff: "new" | "updated" | "unchanged" | "source_missing";
  changes?: string[];
}

export const SYNC_PREVIEW: SyncRow[] = [
  { code: "AHA26-SGN-260729140552-D0CT", name: "Reborn Queens — New Era", diff: "updated", changes: ["duration_minutes: — → 4", "costume_idea: (trống) → Art Director x Stylist…"] },
  { code: "AHA26-HAN-260729141247-EB0Y", name: "Nộp sau nhé", diff: "updated", changes: ["duration_minutes: — → 5"] },
  { code: "AHA26-SGN-260723101722-YV2A", name: "Bí mật chỉ chờ ngày bật mí!", diff: "unchanged" },
  { code: "AHA26-HAN-260728161931-45MW", name: "From A to AI", diff: "unchanged" },
  { code: "AHA26-SGN-260730173814-KWAY", name: "Đảo Bông Hậu", diff: "unchanged" },
  { code: "AHA26-HAN-260730102549-QG2O", name: "Mười Một Năm — Một Chặng Đường", diff: "unchanged" },
  { code: "AHA26-HAN-260731094842-EY51", name: "Xe đạp", diff: "unchanged" },
  { code: "AHA26-SGN-260731100442-08NQ", name: "Chuyển nhịp", diff: "unchanged" },
];

export function progressOf(location: LocationCode) {
  const rows = performancesAt(location);
  const judges = JUDGES[location];
  const needed = rows.length * judges.length;
  const done = judges.reduce(
    (n, j) => n + j.cells.filter((c) => c === "submitted" || c === "locked").length,
    0,
  );
  return {
    performances: rows.length,
    judges: judges.length,
    needed,
    done,
    missing: needed - done,
    pct: needed ? Math.round((done / needed) * 100) : 0,
  };
}

/** Bao nhiêu BGK đã gửi cho từng tiết mục — chỉ số đếm, không có điểm. */
export function judgesDonePerPerformance(location: LocationCode): number[] {
  const rows = performancesAt(location);
  return rows.map(
    (_, i) =>
      JUDGES[location].filter(
        (j) => j.cells[i] === "submitted" || j.cells[i] === "locked",
      ).length,
  );
}
