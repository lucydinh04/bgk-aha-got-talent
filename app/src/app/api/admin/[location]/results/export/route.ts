import type { NextRequest } from "next/server";

import { toLocation } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { csvFilename, overviewCsv } from "@/lib/server/results";

/**
 * Export CSV bảng tổng hợp của một đầu cầu.
 *
 * Đặt dưới `/api` chứ không phải một segment con của trang results, vì
 * `/admin/[location]/results/[performanceId]` là route động — thêm một segment
 * tĩnh `export` cạnh nó thì hai đường dẫn chỉ khác nhau nhờ thứ tự ưu tiên của
 * router, và một ngày nào đó sẽ có người đặt tên tiết mục là "export".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/admin/[location]/results/export">,
) {
  const { location: slug } = await ctx.params;
  const location = toLocation(slug);
  if (!location) return new Response("Không có đầu cầu này", { status: 404 });

  // Dữ liệu điểm — chặn BGK và Admin của đầu cầu khác.
  const session = await requireAdmin(location);
  if (!session) return new Response("Cần đăng nhập Admin", { status: 401 });

  return new Response(overviewCsv(location), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(location)}"`,
      // Không cache: file tải về phải là điểm ở thời điểm bấm, không phải lần trước.
      "cache-control": "no-store",
    },
  });
}
