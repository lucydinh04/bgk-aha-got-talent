import { notFound } from "next/navigation";

import { toLocation } from "@/lib/data";
import { listApproved } from "@/lib/server/performances";
import { MotionHarness } from "./MotionHarness";

/**
 * Harness xem motion — CHỈ CÓ Ở DEVELOPMENT.
 *
 * Lý do tồn tại: các state công bố giải (shuffle, award reveal, scorecard,
 * bình chọn) chưa có trong `live_display_state.display_mode`, nên không có
 * đường nào để xem chúng chạy trên `/live/[location]`. Harness này dựng đúng
 * component thật với dữ liệu thật để duyệt hiệu ứng trước, mà không phải nới
 * CHECK constraint và mở cửa cho LED tự vào chế độ công bố.
 *
 * Ở production route này trả 404 — không phải ẩn nút, mà là không tồn tại.
 */
export const dynamic = "force-dynamic";

export default async function MotionPreviewPage(
  props: PageProps<"/motion/[location]">,
) {
  if (process.env.NODE_ENV === "production") notFound();

  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const performances = listApproved(location);
  if (!performances.length) notFound();

  return (
    <MotionHarness
      location={location}
      performances={performances}
      serverNow={new Date().toISOString()}
    />
  );
}
