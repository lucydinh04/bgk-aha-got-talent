/**
 * Asset chính thức của campaign Sinh nhật Ahamove 11 tuổi.
 *
 * Đây là NGUỒN DUY NHẤT của đường dẫn asset. Không hard-code path ở component.
 *
 * QUY TẮC BẤT DI BẤT DỊCH
 * - Không đổi màu, không lật, không mirror, không bóp méo bất kỳ asset nào.
 * - Icon A trong KV luôn giữ đúng chiều: cấm scaleX(-1), rotateY, transform đảo hướng.
 * - Giữ nguyên aspect ratio — dùng `ratio` bên dưới thay vì đoán.
 */

export type CampaignAssetKey =
  | "ahamoveLogo"
  | "coverLandscape"
  | "kvLandscape"
  | "kvPortrait"
  | "kvLedUltrawide"
  | "anniversary11";

export interface CampaignAsset {
  src: string;
  /** width / height của file gốc */
  width: number;
  height: number;
  ratio: number;
  alt: string;
  /** KV nào đã có sẵn logo Ahamove + badge 11 năm in trong artwork */
  hasBakedInBranding: boolean;
  /** vùng KHÔNG được đặt text đè lên (mô tả cho người đọc code) */
  busyZone?: string;
}

const asset = (
  src: string,
  width: number,
  height: number,
  alt: string,
  hasBakedInBranding: boolean,
  busyZone?: string,
): CampaignAsset => ({
  src,
  width,
  height,
  ratio: width / height,
  alt,
  hasBakedInBranding,
  busyZone,
});

export const campaignAssets: Record<CampaignAssetKey, CampaignAsset> = {
  ahamoveLogo: asset(
    "/images/ahamove-logo.svg",
    520,
    89.78,
    "Ahamove",
    false,
  ),

  /** Banner ngang rất rộng. Dải light trail phía dưới là vùng yên tĩnh nhất. */
  coverLandscape: asset(
    "/images/cover-fb-internal-3.png",
    3000,
    1322,
    "Aha Got Talent 2026 — Chuyển mình bứt phá",
    true,
    "Logo, headline và icon A nằm giữa ảnh. Chỉ crop dải light trail phía dưới khi cần đặt text.",
  ),

  /** KV ngang ~16:9 — dành cho LED và preview 16:9. */
  kvLandscape: asset(
    "/images/kv-internal-3.png",
    1920,
    1072,
    "Aha Got Talent 2026 — Chuyển mình bứt phá",
    true,
    "Headline 'CHUYỂN MÌNH BỨT PHÁ' và icon A chiếm trọn vùng giữa. Không đặt text đè lên.",
  ),

  /** KV vuông 1:1 — mobile hero, judge login, vote success, sidebar card. */
  kvPortrait: asset(
    "/images/kv-internal-3-fb.png",
    1072,
    1072,
    "Aha Got Talent 2026 — Ahamove 11 năm chuyển mình",
    true,
    "Icon A chiếm gần trọn khung. Cover sang khung hẹp hơn 1:1 sẽ cắt mất chân icon A — dùng khung vuông.",
  ),

  /**
   * Nền màn LED ultra-wide — 2084×754 = 2.764:1, khớp gần như tuyệt đối canvas
   * 3008×1088 (2.765:1), nên `cover` không cắt gì.
   *
   * KHÔNG có branding in sẵn: không logo Ahamove, không badge 11 năm. Chữ
   * "AHAMOVE" trên tháp đồng hồ là chi tiết vẽ trong tranh, không phải wordmark
   * chính thức — không được coi nó là logo. Vì vậy màn LED phải tự đặt
   * `CampaignLogo` và `AnniversaryBadge` vào safe zone.
   *
   * Vùng sáng nhất là sân khấu và số 11 ở CHÍNH GIỮA khung. Chữ vận hành vì thế
   * neo xuống dải sàn phản chiếu phía dưới, không đặt giữa.
   */
  kvLedUltrawide: asset(
    "/images/kv-led-ultrawide.png",
    2084,
    754,
    "Aha Got Talent 2026 — sân khấu neon 11 năm Ahamove",
    false,
    "Sân khấu và số 11 chiếm trọn vùng giữa. Chỉ đặt chữ ở dải sàn phía dưới.",
  ),

  /** Badge 11 năm, nền trong suốt. */
  anniversary11: asset(
    "/images/anniversary-11-3d.png",
    909,
    758,
    "11 năm Ahamove",
    false,
  ),
};

/**
 * Điểm neo object-position cho từng mục đích crop.
 * KV có headline ở giữa nên khi cần chỗ trống cho text, neo xuống dải light trail.
 */
export const cropAnchor = {
  /** giữ trọn artwork — dùng khi không đặt text đè */
  full: "center",
  /** dải light trail dưới đáy — vùng yên tĩnh, an toàn để đặt text */
  lightTrail: "center 88%",
  /** sát đáy — chỉ còn light trail thành phố, không dính headline lẫn icon A */
  cityBand: "center 100%",
  /** dải skyline trên đỉnh */
  skyline: "center 12%",
} as const;

/** Fallback khi ảnh lỗi: gradient navy, không bao giờ là ảnh lạ từ internet. */
export const FALLBACK_GRADIENT =
  "linear-gradient(160deg, #0a1730 0%, #060d1e 55%, #0e2141 100%)";
