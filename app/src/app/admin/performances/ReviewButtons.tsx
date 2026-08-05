"use client";

import { useState, useTransition } from "react";

import { setReviewStatusAction } from "@/app/actions/sync";

type Status = "pending_review" | "approved" | "rejected";

const NEXT: Record<Status, { to: Status; label: string; tone: string }[]> = {
  pending_review: [
    { to: "approved", label: "Duyệt", tone: "text-ok border-ok/45" },
    { to: "rejected", label: "Từ chối", tone: "text-danger border-danger/45" },
  ],
  approved: [
    { to: "pending_review", label: "Gỡ duyệt", tone: "text-warn border-warn/45" },
  ],
  rejected: [
    { to: "pending_review", label: "Xem lại", tone: "text-warn border-warn/45" },
  ],
};

/**
 * Công tắc duy nhất khiến một tiết mục hiện ra với BGK.
 *
 * Gỡ duyệt một tiết mục đang được chấm không xoá điểm đã có — chỉ ẩn tiết mục
 * khỏi danh sách BGK. Điểm nằm nguyên trong bảng `scores`.
 */
export function ReviewButtons({ code, status }: { code: string; status: Status }) {
  const [current, setCurrent] = useState<Status>(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {NEXT[current].map((action) => (
        <button
          key={action.to}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setReviewStatusAction(code, action.to);
              if (result.ok) {
                setCurrent(action.to);
                setError(null);
              } else {
                setError(result.error ?? "Không đổi được trạng thái.");
              }
            })
          }
          className={`rounded border px-2 py-0.5 font-mono text-[0.58rem] tracking-[0.1em] uppercase transition disabled:opacity-40 ${action.tone}`}
        >
          {action.label}
        </button>
      ))}
      {error ? <span className="text-danger text-[0.6rem]">{error}</span> : null}
    </span>
  );
}
