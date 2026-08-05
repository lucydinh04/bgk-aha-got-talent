"use server";

import { redirect } from "next/navigation";

import { toLocation, type LocationCode } from "@/lib/data";
import { endSession, startSession } from "@/lib/server/session";
import { findByEmail, normalizeEmail } from "@/lib/server/users";

/**
 * Đăng nhập bằng email, không mật khẩu, không magic link.
 *
 * Allow-list là toàn bộ cơ chế: chỉ email đã được BTC nạp vào bảng `users` mới
 * qua được. Chọn cách này thay vì magic link vì đêm diễn không chịu nổi rủi ro
 * mail vào spam — quyết định của BTC, ghi lại ở đây để sau này ai đọc cũng biết
 * đây là lựa chọn có ý thức chứ không phải chưa làm xong.
 */

export interface LoginState {
  error?: string;
  email?: string;
}

/** Thông báo giống nhau cho "không có email này" và "sai vai trò". */
const NOT_ON_LIST =
  "Email này không có trong danh sách Ban Giám khảo. Kiểm tra lại hoặc liên hệ Ban Tổ chức.";

export async function judgeLogin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const slug = String(formData.get("location") ?? "");
  const location = toLocation(slug);
  if (!location) return { error: "Đường link không hợp lệ." };

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { error: "Nhập email công ty của bạn." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: "Email không đúng định dạng.", email };
  }

  const user = findByEmail(email);
  if (!user || user.role !== "judge") return { error: NOT_ON_LIST, email };
  if (user.status !== "active") {
    return { error: "Tài khoản đang bị tạm khoá. Liên hệ Ban Tổ chức.", email };
  }

  // Đầu cầu nằm trong URL, không nằm trong session — BGK không tự đổi được, và
  // vào nhầm link thì được chỉ đúng đường thay vì bị chặn cụt.
  //
  // `location` = null là BGK chấm cả hai đầu cầu: không có đầu cầu nào để chỉ
  // sang, nên không chặn.
  if (user.location && user.location !== location) {
    return {
      error: `Bạn được phân công chấm đầu cầu ${user.location}. Mở /judge/${user.location.toLowerCase()} để đăng nhập.`,
      email,
    };
  }

  await startSession({
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    location: user.location,
  });

  redirect(`/judge/${slug}/dashboard`);
}

export async function adminLogin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { error: "Nhập email công ty của bạn." };

  const user = findByEmail(email);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return { error: "Email này không có quyền Ban Tổ chức.", email };
  }
  if (user.status !== "active") {
    return { error: "Tài khoản đang bị tạm khoá.", email };
  }

  await startSession({
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    location: user.location,
  });

  const home: LocationCode = user.location ?? "SGN";
  redirect(`/admin/${home.toLowerCase()}`);
}

export async function logout(formData: FormData): Promise<void> {
  const to = String(formData.get("redirectTo") ?? "/");
  await endSession();
  redirect(to);
}
