import type { NextRequest } from "next/server";

import { toLocation } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { byId } from "@/lib/server/performances";
import { csvFilename, performanceCsv } from "@/lib/server/results";

/** Export CSV bảng điểm chi tiết của một tiết mục. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/admin/[location]/results/[performanceId]/export">,
) {
  const { location: slug, performanceId } = await ctx.params;
  const location = toLocation(slug);
  if (!location) return new Response("Không có đầu cầu này", { status: 404 });

  const session = await requireAdmin(location);
  if (!session) return new Response("Cần đăng nhập Admin", { status: 401 });

  /*
   * Tiết mục phải thuộc đúng đầu cầu trong URL. Thiếu lớp kiểm tra này thì Admin
   * chỉ được phân công SGN vẫn tải được điểm HAN bằng cách đổi id trong đường dẫn
   * — `requireAdmin` chỉ xác thực đầu cầu của URL, không biết id trỏ vào đâu.
   */
  const performance = byId(performanceId);
  if (!performance || performance.location !== location) {
    return new Response("Không tìm thấy tiết mục", { status: 404 });
  }

  const body = performanceCsv(performanceId);
  if (!body) return new Response("Không tìm thấy tiết mục", { status: 404 });

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(
        location,
        performance.registrationCode,
      )}"`,
      "cache-control": "no-store",
    },
  });
}
