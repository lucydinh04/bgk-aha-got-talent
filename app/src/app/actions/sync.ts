"use server";

import { revalidatePath } from "next/cache";

import { SheetAccessError } from "@/lib/sheet/source";
import { setReviewStatus, byCode } from "@/lib/server/performances";
import { requireAdmin } from "@/lib/server/session";
import { commitSync, previewSync, type SyncPreview, type SyncResult } from "@/lib/server/sync";

/**
 * Google Sheet chỉ được gọi từ đây — một server action, chạy trên server.
 * Không có đường nào từ client tới `docs.google.com`, và spreadsheet ID cũng
 * không đi xuống bundle.
 */

export async function previewSyncAction(): Promise<
  { ok: true; preview: SyncPreview } | { ok: false; error: string }
> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Cần quyền Ban Tổ chức." };

  try {
    return { ok: true, preview: await previewSync(session.userId) };
  } catch (err) {
    if (err instanceof SheetAccessError) return { ok: false, error: err.message };
    return {
      ok: false,
      error: `Không đọc được Google Sheet: ${err instanceof Error ? err.message : "lỗi không rõ"}`,
    };
  }
}

export async function commitSyncAction(
  syncLogId: string,
): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Cần quyền Ban Tổ chức." };

  try {
    const result = commitSync(syncLogId);
    revalidatePath("/admin/sync");
    revalidatePath("/admin/performances");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sync thất bại." };
  }
}

/**
 * Duyệt tiết mục. Đây là cái công tắc duy nhất khiến một tiết mục hiện ra với
 * BGK — sync không bao giờ tự bật nó.
 */
export async function setReviewStatusAction(
  code: string,
  status: "pending_review" | "approved" | "rejected",
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Cần quyền Ban Tổ chức." };

  const performance = byCode(code);
  if (!performance) return { ok: false, error: "Không tìm thấy tiết mục." };
  if (session.location && session.location !== performance.location) {
    return { ok: false, error: `Bạn chỉ quản đầu cầu ${session.location}.` };
  }

  setReviewStatus(performance.id, status);
  revalidatePath("/admin/performances");
  revalidatePath(`/admin/${performance.location.toLowerCase()}`);
  return { ok: true };
}
