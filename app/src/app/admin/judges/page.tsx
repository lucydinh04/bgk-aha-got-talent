import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/server/session";
import { listJudgeAdminRows } from "@/lib/server/judges";
import { JudgeManager } from "./JudgeManager";

/**
 * Quản lý Ban Giám khảo.
 *
 * Trước đây trang này chỉ đọc — muốn thêm BGK phải mở shell trên Railway và chạy
 * seed. Giờ toàn bộ thao tác nằm ở đây, ghi thẳng vào database mà app đang dùng,
 * kể cả database production trên volume `/data`.
 *
 * `force-dynamic` vì danh sách đổi ngay sau mỗi thao tác và trang này không bao
 * giờ được phép phục vụ bản cache cũ — Admin vừa thêm người xong mà không thấy
 * họ trong bảng sẽ bấm thêm lần nữa.
 */
export const dynamic = "force-dynamic";

export default async function JudgesPage() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login?next=/admin/judges");

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        title="Quản lý Ban Giám khảo"
        subtitle="Thêm, sửa, phân công đầu cầu — không cần shell, không cần SQL"
      />
      <JudgeManager rows={listJudgeAdminRows()} />
    </main>
  );
}
