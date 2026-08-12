"use server";

import { revalidatePath } from "next/cache";

import { LOCATIONS } from "@/lib/data";
import {
  countActivePerformances,
  deleteJudge,
  findJudgeByEmail,
  provisionJudge,
  setJudgeStatus,
  type ProvisionResult,
  type Venue,
} from "@/lib/server/judges";
import { requireAdmin } from "@/lib/server/session";
import { normalizeEmail } from "@/lib/server/users";

/**
 * Quản lý BGK từ giao diện Admin.
 *
 * Mọi action ở đây đều đi qua `requireAdmin()` trước khi chạm DB — server action
 * là một endpoint HTTP, không phải một hàm nội bộ, nên thiếu guard là để ngỏ
 * đường thêm BGK cho bất kỳ ai đoán được tên action.
 *
 * Sau mỗi thay đổi phải `revalidatePath` cả trang Admin lẫn dashboard BGK: hai
 * chỗ đó render tĩnh theo request và sẽ giữ danh sách cũ nếu không xoá cache.
 * Màn LED không cần — nó đọc qua SSE và tự cập nhật mẫu số khi phân công đổi.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface JudgeActionState {
  ok: boolean;
  error?: string;
  /** Email đã tồn tại — UI hỏi Admin có muốn cập nhật đầu cầu thay vì tạo mới. */
  duplicate?: { email: string; venues: Venue[]; assigned: number };
  result?: ProvisionResult;
}

function parseVenues(raw: FormDataEntryValue[] | string[]): Venue[] {
  const wanted = new Set(raw.map(String));
  return LOCATIONS.filter((v) => wanted.has(v));
}

function refresh() {
  revalidatePath("/admin/judges");
  revalidatePath("/admin/dashboard");
  for (const loc of LOCATIONS) {
    const slug = loc.toLowerCase();
    revalidatePath(`/admin/${slug}`);
    revalidatePath(`/admin/${slug}/progress`);
    revalidatePath(`/judge/${slug}/dashboard`);
  }
}

/** Đếm trước số tiết mục sẽ được phân công — dùng cho bước xác nhận. */
export async function previewAssignmentsAction(
  venues: string[],
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Phiên Admin đã hết hạn. Đăng nhập lại." };
  return { ok: true, count: countActivePerformances(parseVenues(venues)) };
}

export async function addJudgeAction(
  _prev: JudgeActionState,
  formData: FormData,
): Promise<JudgeActionState> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Phiên Admin đã hết hạn. Đăng nhập lại." };

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { ok: false, error: "Nhập email của Ban Giám khảo." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Email không đúng định dạng." };

  const venues = parseVenues(formData.getAll("venues"));
  if (venues.length === 0) {
    return { ok: false, error: "Chọn ít nhất một đầu cầu chấm điểm." };
  }

  /*
    Email trùng: KHÔNG tạo user thứ hai. Trả về `duplicate` để UI hỏi Admin có
    muốn cập nhật đầu cầu cho tài khoản sẵn có hay không. Chỉ khi Admin bấm xác
    nhận (`allowUpdate`) thì mới ghi đè.
  */
  const existing = findJudgeByEmail(email);
  const allowUpdate = String(formData.get("allowUpdate") ?? "") === "1";
  if (existing && !allowUpdate) {
    return {
      ok: false,
      error: "Ban Giám khảo này đã tồn tại.",
      duplicate: {
        email: existing.email,
        venues: existing.venues,
        assigned: existing.assigned,
      },
    };
  }

  const result = provisionJudge({
    email,
    fullName: String(formData.get("fullName") ?? ""),
    title: String(formData.get("title") ?? ""),
    venues,
    autoAssign: String(formData.get("autoAssign") ?? "") === "1",
  });

  refresh();
  return { ok: true, result };
}

export async function updateJudgeAction(
  _prev: JudgeActionState,
  formData: FormData,
): Promise<JudgeActionState> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Phiên Admin đã hết hạn. Đăng nhập lại." };

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const existing = findJudgeByEmail(email);
  if (!existing) return { ok: false, error: "Không tìm thấy Ban Giám khảo này." };

  const venues = parseVenues(formData.getAll("venues"));

  const result = provisionJudge({
    email,
    fullName: String(formData.get("fullName") ?? ""),
    title: String(formData.get("title") ?? ""),
    venues,
    // Sửa hồ sơ thì luôn đồng bộ phân công theo tập đầu cầu vừa chọn.
    autoAssign: true,
  });

  const status = String(formData.get("status") ?? "");
  if (status === "active" || status === "disabled") {
    setJudgeStatus(existing.id, status);
  }

  refresh();
  return { ok: true, result };
}

export async function setJudgeStatusAction(
  judgeId: string,
  status: "active" | "disabled",
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Phiên Admin đã hết hạn. Đăng nhập lại." };
  setJudgeStatus(judgeId, status);
  refresh();
  return { ok: true };
}

export async function deleteJudgeAction(
  judgeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "Phiên Admin đã hết hạn. Đăng nhập lại." };
  const r = deleteJudge(judgeId);
  if (r.ok) refresh();
  return r;
}
