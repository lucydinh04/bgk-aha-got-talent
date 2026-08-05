/**
 * Địa chỉ gốc của ứng dụng — MỘT nguồn duy nhất.
 *
 * Mọi URL đi ra ngoài trang hiện tại phải qua đây: QR bình chọn in trên màn
 * LED, link gửi cho BGK, link Admin, callback. Nối chuỗi thủ công ở từng
 * component là cách chắc chắn nhất để có một cái QR trỏ về localhost trên máy
 * chiếu giữa hội trường.
 *
 * Thứ tự ưu tiên, dừng ở giá trị đầu tiên có mặt:
 *
 *   1. NEXT_PUBLIC_APP_URL     — cấu hình tường minh, luôn thắng
 *   2. Domain do nền tảng cấp  — Railway / Render / Vercel tự đặt biến này
 *   3. localhost               — CHỈ ở development
 *
 * Production mà không đặt được cái nào thì ném lỗi ngay lúc khởi động, thay vì
 * âm thầm in ra một QR không ai quét được.
 */

function normalize(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Nền tảng thường chỉ cấp hostname trần. Ngoài localhost, luôn là https.
  const scheme = trimmed.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${trimmed}`;
}

let cached: string | null = null;

export function baseUrl(): string {
  if (cached) return cached;

  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    // Railway
    process.env.RAILWAY_PUBLIC_DOMAIN,
    // Render
    process.env.RENDER_EXTERNAL_URL,
    // Vercel — giữ lại để đổi nền tảng không phải sửa code
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const c of candidates) {
    if (c && c.trim()) {
      cached = normalize(c);
      return cached;
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Thiếu NEXT_PUBLIC_APP_URL. Production cần biết địa chỉ công khai của mình " +
        "để in QR bình chọn và dựng link đăng nhập. Đặt biến này rồi deploy lại.",
    );
  }

  cached = `http://localhost:${process.env.PORT ?? 3000}`;
  return cached;
}

/** Ghép đường dẫn vào base URL. Luôn dùng hàm này thay vì nối chuỗi. */
export function absoluteUrl(path: string): string {
  return `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Chỉ dùng trong test — xoá cache giữa các lần đổi env. */
export function resetBaseUrlCache(): void {
  cached = null;
}
