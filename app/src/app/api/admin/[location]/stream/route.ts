import type { NextRequest } from "next/server";

import { toLocation } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { sseResponse } from "@/lib/server/sse";
import { buildAdminSnapshot } from "@/lib/server/views";

/**
 * Kênh realtime của Admin. Snapshot ở đây CÓ điểm trung bình tạm tính, nên
 * endpoint bắt buộc kiểm tra quyền — khác hẳn kênh LED.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/admin/[location]/stream">,
) {
  const { location: slug } = await ctx.params;
  const location = toLocation(slug);
  if (!location) return new Response("Không có đầu cầu này", { status: 404 });

  const session = await requireAdmin(location);
  if (!session) return new Response("Cần đăng nhập Admin", { status: 401 });

  return sseResponse({
    location,
    snapshot: () => buildAdminSnapshot(location),
  });
}
