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

  return (
    <LiveScreen
      initial={buildLedSnapshot(location)}
      debug={debug}
      motionDebug={motionDebug}
    />
  );
}
