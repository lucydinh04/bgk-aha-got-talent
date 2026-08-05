import "server-only";

import type { LocationCode } from "@/lib/data";
import { subscribe, type LiveEvent } from "./events";

/**
 * Đóng gói một kênh SSE.
 *
 * Mỗi lần có event, ta gửi TOÀN BỘ snapshot chứ không gửi delta. Payload chỉ
 * vài KB, và đổi lại thì không tồn tại khái niệm "client bị lệch state": chỉ có
 * state mới nhất hoặc state cũ, không có state lai. Với một màn LED đang chiếu
 * trước mặt mấy trăm người, đó là đánh đổi dễ chọn.
 */

const HEARTBEAT_MS = 15_000;

export function sseResponse<T>(options: {
  location: LocationCode;
  /** Dựng snapshot. Gọi lại sau mỗi event, nên phải rẻ. */
  snapshot: () => T;
  /** Lọc event nào đáng gửi lại snapshot. Mặc định: tất cả. */
  accepts?: (event: LiveEvent) => boolean;
}): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
      };

      // `retry` bảo trình duyệt tự kết nối lại sau 2s. Reconnect là việc của
      // EventSource, ta chỉ cần đừng cản nó.
      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      send("snapshot", options.snapshot());

      unsubscribe = subscribe(options.location, (event) => {
        if (options.accepts && !options.accepts(event)) return;
        send("snapshot", options.snapshot());
        send("event", { type: event.type, at: event.at });
      });

      // Heartbeat giữ kết nối sống qua proxy hay cắt idle connection, và cho
      // client một tín hiệu để biết đường truyền còn tốt.
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);
    },

    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx đứng trước sẽ buffer cả stream nếu không có dòng này.
      "X-Accel-Buffering": "no",
    },
  });
}
