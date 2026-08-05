"use client";

import { useEffect, useRef, useState } from "react";

export type ConnectionState = "connecting" | "live" | "reconnecting";

/**
 * Nghe một kênh SSE và giữ snapshot mới nhất.
 *
 * Quy tắc quan trọng nhất ở đây: mất kết nối KHÔNG xoá dữ liệu. `data` chỉ đổi
 * khi có snapshot mới về. Màn LED rớt mạng thì vẫn đang chiếu đúng thứ nó đang
 * chiếu, chứ không nhảy về màn trống.
 *
 * EventSource tự reconnect (server đã gửi `retry: 2000`), nên ở đây không có
 * vòng lặp retry tự viết — chỉ có việc phản ánh trạng thái kết nối ra ngoài.
 */
export function useSnapshot<T>(
  url: string,
  initial: T,
): { data: T; connection: ConnectionState; lastUpdate: number | null } {
  const [data, setData] = useState<T>(initial);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  // Đã từng kết nối được chưa — để phân biệt "đang mở lần đầu" với "đang nối lại".
  const opened = useRef(false);

  useEffect(() => {
    const source = new EventSource(url);

    source.addEventListener("open", () => {
      opened.current = true;
      setConnection("live");
    });

    source.addEventListener("snapshot", (event) => {
      try {
        setData(JSON.parse((event as MessageEvent<string>).data) as T);
        setLastUpdate(Date.now());
        setConnection("live");
      } catch {
        // Snapshot hỏng thì bỏ qua gói đó và giữ nguyên state cũ.
      }
    });

    source.addEventListener("error", () => {
      setConnection(opened.current ? "reconnecting" : "connecting");
    });

    return () => source.close();
  }, [url]);

  return { data, connection, lastUpdate };
}
