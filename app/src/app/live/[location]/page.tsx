import { notFound } from "next/navigation";

import { toLocation } from "@/lib/data";
import { buildLedSnapshot } from "@/lib/server/views";
import { LiveScreen } from "./LiveScreen";

/**
 * Màn LED — `/live/sgn` và `/live/han`.
 *
 * Server render snapshot đầu tiên từ `live_display_state`, sau đó client nghe
 * SSE. Nghĩa là F5 giữa chương trình không mất state: khung hình đúng đã có
 * ngay trong HTML đầu tiên, trước cả khi JavaScript chạy.
 *
 * `?debug=1` bật indicator kết nối. Không có cờ đó thì màn hình tuyệt đối không
 * hiện chữ nào về kỹ thuật — sân khấu không phải chỗ debug.
 */
export const dynamic = "force-dynamic";

export default async function LivePage(props: PageProps<"/live/[location]">) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const search = await props.searchParams;
  const debug = search.debug === "1";
  // Panel motion debug chỉ dựng ở development — MotionRoot chặn lần nữa ở client.
  const motionDebug = search.motionDebug === "true";
  /*
    `?frame=1` dựng canvas ở đúng 3008×1088 rồi thu nhỏ để lọt màn hình — dùng
    khi cần đo cỡ chữ thật bằng devtools. Chặn ở production: máy phát LED ngoài
    hội trường phải luôn nhận khung tràn viền, và một cờ query gõ nhầm không được
    phép biến màn sân khấu thành ảnh preview có viền.
  */
  const framePreview =
    search.frame === "1" && process.env.NODE_ENV !== "production";

  return (
    <LiveScreen
      initial={buildLedSnapshot(location)}
      debug={debug}
      motionDebug={motionDebug}
      framePreview={framePreview}
    />
  );
}
