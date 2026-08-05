import raw from "@/data/performances.json";

/**
 * Dữ liệu tiết mục thật, sinh từ Google Sheet qua `scripts/fetch-sheet.mjs`.
 *
 * File JSON đã được lọc theo ALLOW-LIST: không chứa email, số điện thoại,
 * Telegram, ghi chú BTC, nhu cầu hỗ trợ nội bộ hay danh sách thành viên thô.
 * Đây là payload an toàn để gửi xuống frontend Judge và LED.
 */

export type LocationCode = "SGN" | "HAN";

export const LOCATIONS: LocationCode[] = ["SGN", "HAN"];

export const EVENT_DATE: Record<LocationCode, string> = {
  SGN: "07/08/2026",
  HAN: "14/08/2026",
};

export interface Performance {
  registrationCode: string;
  location: LocationCode;
  performanceOrder: number | null;
  performanceName: string;
  participationType: string | null;
  performanceType: string | null;
  durationMinutes: number | null;
  representativeName: string | null;
  department: string | null;
  memberCount: number | null;
  conceptDescription: string | null;
  transformationHighlight: string | null;
  costumeIdea: string | null;
  aiTechnologyUsage: string | null;
  infoIncomplete: boolean;
}

export const performances = raw as Performance[];

export function isLocation(value: string): value is Lowercase<LocationCode> {
  return value === "sgn" || value === "han";
}

export function toLocation(slug: string): LocationCode | null {
  return isLocation(slug) ? (slug.toUpperCase() as LocationCode) : null;
}

export function performancesAt(location: LocationCode): Performance[] {
  return performances.filter((p) => p.location === location);
}

export function findPerformance(code: string): Performance | undefined {
  return performances.find((p) => p.registrationCode === code);
}

/* ── Tiêu chí chấm — trọng số đọc từ đây, tổng phải bằng 1 ─────────────────*/
export const CRITERIA = [
  {
    key: "creativity",
    column: "creativity_score",
    label: "Ý tưởng & sáng tạo",
    weight: 0.25,
    description:
      "Ý tưởng mới mẻ, cách kể chuyện khác biệt và khả năng làm mới chất liệu biểu diễn.",
  },
  {
    key: "quality",
    column: "performance_quality_score",
    label: "Chất lượng biểu diễn",
    weight: 0.25,
    description:
      "Kỹ năng, cảm xúc, độ chắc chắn và khả năng truyền tải nội dung của tiết mục.",
  },
  {
    key: "transformation",
    column: "transformation_score",
    label: "Tinh thần Chuyển mình bứt phá",
    weight: 0.2,
    description:
      "Mức độ thể hiện chủ đề, sự chuyển đổi rõ ràng và thông điệp tích cực.",
  },
  {
    key: "presence",
    column: "stage_presence_score",
    label: "Sức hút & làm chủ sân khấu",
    weight: 0.2,
    description:
      "Thần thái, khả năng kết nối khán giả, sử dụng không gian và duy trì năng lượng.",
  },
  {
    key: "completion",
    column: "completion_score",
    label: "Phối hợp & mức độ hoàn thiện",
    weight: 0.1,
    description: "Sự ăn ý, bố cục, đạo cụ, kỹ thuật và mức độ chuẩn bị chỉn chu.",
  },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export function scoreBand(value: number): { label: string; tone: string } {
  if (value >= 90) return { label: "Xuất sắc", tone: "text-ok" };
  if (value >= 80) return { label: "Rất tốt", tone: "text-cyan" };
  if (value >= 70) return { label: "Tốt", tone: "text-electric" };
  if (value >= 60) return { label: "Đạt", tone: "text-warn" };
  return { label: "Cần cải thiện", tone: "text-danger" };
}

/* ── Cơ cấu giải chính thức, cấu hình theo đầu cầu ─────────────────────────*/
export interface Award {
  code: string;
  nameEn: string;
  nameVi: string;
  order: number;
  source: "judging" | "audience_vote" | "ai_result";
  enabled: boolean;
}

export const AWARDS: Record<LocationCode, Award[]> = {
  SGN: [
    { code: "creative_pulse", nameEn: "The Creative Pulse", nameVi: "Giải Ba", order: 1, source: "judging", enabled: true },
    { code: "spotlight_act", nameEn: "The Spotlight Act", nameVi: "Giải Nhì", order: 2, source: "judging", enabled: true },
    { code: "crowd_magnet", nameEn: "The Crowd Magnet", nameVi: "Giải Khán giả yêu thích", order: 3, source: "audience_vote", enabled: true },
    { code: "breakthrough_act", nameEn: "The Breakthrough Act", nameVi: "Giải Nhất", order: 4, source: "judging", enabled: true },
  ],
  HAN: [
    { code: "spotlight_act", nameEn: "The Spotlight Act", nameVi: "Giải Nhì", order: 1, source: "judging", enabled: true },
    { code: "breakthrough_act", nameEn: "The Breakthrough Act", nameVi: "Giải Nhất", order: 2, source: "judging", enabled: true },
  ],
};

export function displayName(p: Performance): string {
  return p.performanceName;
}

export function teamLabel(p: Performance): string {
  return p.representativeName ?? p.department ?? "—";
}

export function orderLabel(p: Performance): string {
  return p.performanceOrder ? String(p.performanceOrder).padStart(2, "0") : "--";
}
