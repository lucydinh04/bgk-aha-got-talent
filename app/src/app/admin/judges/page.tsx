import { redirect } from "next/navigation";

import { Panel, PageHeader, DataTable, Row, Cell, ProgressBar } from "@/components/ui";
import { LOCATIONS, EVENT_DATE } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { buildAdminSnapshot } from "@/lib/server/views";

export const dynamic = "force-dynamic";

export default async function JudgesPage() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login?next=/admin/judges");

  const visible = session.location ? [session.location] : LOCATIONS;

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        title="Quản lý Ban Giám khảo"
        subtitle="Mỗi BGK chỉ có một bộ điểm cho mỗi tiết mục"
      />

      <div className="flex flex-col gap-4">
        {visible.map((loc) => {
          const { judges } = buildAdminSnapshot(loc);
          return (
            <Panel key={loc} title={`${loc} · ${EVENT_DATE[loc]} · ${judges.length} BGK`}>
              {judges.length === 0 ? (
                <p className="text-silver-dim text-sm">
                  Chưa có BGK nào cho đầu cầu này.
                </p>
              ) : (
                <DataTable
                  head={[
                    "Tên",
                    "Chức danh",
                    "Email",
                    "Đầu cầu",
                    "Được giao",
                    "Đã gửi",
                    "Nháp",
                    "Chưa chấm",
                    "Hoàn thành",
                    "Hoạt động gần nhất",
                  ]}
                  minWidth={1000}
                >
                  {judges.map((j) => (
                    <Row key={j.id}>
                      <Cell tone="text-chalk">{j.name}</Cell>
                      <Cell mono>{j.title}</Cell>
                      <Cell mono className="text-[0.62rem]">
                        {j.email}
                      </Cell>
                      <Cell mono tone={loc === "SGN" ? "text-brand" : "text-cyan"}>
                        {loc}
                      </Cell>
                      <Cell mono>{j.assigned}</Cell>
                      <Cell
                        mono
                        tone={
                          j.assigned > 0 && j.submitted === j.assigned
                            ? "text-ok"
                            : "text-warn"
                        }
                      >
                        {j.submitted}
                      </Cell>
                      <Cell mono tone={j.drafts ? "text-warn" : "text-silver-dim"}>
                        {j.drafts}
                      </Cell>
                      <Cell mono tone={j.pending ? "text-danger" : "text-silver-dim"}>
                        {j.pending}
                      </Cell>
                      <Cell className="w-36">
                        <ProgressBar
                          value={j.completionPct}
                          label={`Tiến độ ${j.name}`}
                        />
                      </Cell>
                      <Cell mono tone="text-silver-dim">
                        {j.lastActivityAt
                          ? new Date(j.lastActivityAt).toLocaleString("vi-VN")
                          : "chưa đăng nhập"}
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              )}
            </Panel>
          );
        })}

        <Panel title="Phân quyền">
          <p className="text-silver-dim text-xs leading-relaxed">
            BGK chỉ thấy đầu cầu và tiết mục được phân công. Muốn một BGK chấm cả
            hai đầu cầu, phân công riêng ở từng đầu cầu — hệ thống không có chế độ
            &ldquo;chấm tất cả&rdquo; ngầm định. Danh sách email BGK là allow-list
            đăng nhập: không có tên trong bảng này thì không vào được hệ thống.
          </p>
        </Panel>
      </div>
    </main>
  );
}
