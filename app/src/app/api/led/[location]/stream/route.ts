import type { NextRequest } from "next/server";

import { toLocation } from "@/lib/data";
import { sseResponse } from "@/lib/server/sse";
import { buildLedSnapshot } from "@/lib/server/views";

/**
 * Kênh realtime của màn LED. Công khai — không có phiên đăng nhập nào trên máy
 * chiếu cả. An toàn được vì `buildLedSnapshot` không trả về điểm.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/led/[location]/stream">,
) {
  const { location: slug } = await ctx.params;
  const location = toLocation(slug);
  if (!location) return new Response("Không có đầu cầu này", { status: 404 });

  return sseResponse({
    location,
    snapshot: () => buildLedSnapshot(location),
  });
}
