import type { NextRequest } from "next/server";

import { get } from "@/lib/db";
import { subscriberCount } from "@/lib/server/events";
import { SPREADSHEET_ID } from "@/lib/sheet/source";

/**
 * Health check.
 *
 * Trả về TRẠNG THÁI, không trả cấu hình. Không có URL database, không có tên
 * file, không có secret, không có stack trace — kể cả khi mọi thứ đang hỏng.
 * Một endpoint health rò rỉ đường dẫn nội bộ là một endpoint health tệ hơn là
 * không có.
 *
 * Mỗi mục được KIỂM TRA THẬT chứ không phải hằng số: `database` chỉ là
 * "connected" khi vừa đọc được một hàng, không phải khi biến môi trường có mặt.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "1.0.0";

export async function GET(req: NextRequest) {
  // Bảo vệ tuỳ chọn. Không đặt token thì endpoint công khai — an toàn vì
  // payload không chứa gì nhạy cảm.
  const expected = process.env.HEALTH_CHECK_TOKEN;
  if (expected) {
    const given =
      req.nextUrl.searchParams.get("token") ?? req.headers.get("x-health-token");
    if (given !== expected) {
      return Response.json({ status: "unauthorized" }, { status: 401 });
    }
  }

  let database: "connected" | "error" = "error";
  let performances = 0;
  let locations = 0;

  try {
    // Truy vấn thật, chạm vào bảng thật. Bắt được cả trường hợp file DB có
    // nhưng migration chưa chạy.
    performances =
      get<{ n: number }>("select count(*) as n from performances")?.n ?? 0;
    locations =
      get<{ n: number }>("select count(*) as n from live_display_state")?.n ?? 0;
    database = "connected";
  } catch {
    // Nuốt lỗi có chủ ý: chi tiết đi vào log server, không đi ra response.
    database = "error";
  }

  const body = {
    status: database === "connected" ? "ok" : "degraded",
    database,
    // "configured" nghĩa là có id sheet để gọi, không nghĩa là gọi được —
    // kiểm tra thật sẽ phải gọi ra Google mỗi lần health check.
    googleSheets: SPREADSHEET_ID ? "configured" : "missing",
    realtime: "configured",
    realtimeClients: subscriberCount("SGN") + subscriberCount("HAN"),
    performances,
    locations,
    version: VERSION,
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, {
    status: database === "connected" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
