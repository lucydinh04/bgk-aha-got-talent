import { notFound, redirect } from "next/navigation";
import {
  Panel,
  PageHeader,
  DataTable,
  Row,
  Cell,
  Btn,
  StatusPill,
} from "@/components/ui";
import { toLocation, EVENT_DATE, orderLabel, teamLabel } from "@/lib/data";
import { listAll } from "@/lib/server/performances";
import { requireAdmin } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function RundownPage(
  props: PageProps<"/admin/[location]/rundown">,
) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireAdmin(location);
  if (!session) redirect(`/admin/login?next=/admin/${slug}/rundown`);

  const rows = listAll(location);
  const totalMinutes = rows.reduce((n, r) => n + (r.durationMinutes ?? 0), 0);

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        location={location}
        title="Thứ tự biểu diễn"
        subtitle={`${EVENT_DATE[location]} · ${rows.length} tiết mục · ${totalMinutes} phút`}
        action={<Btn variant="ghost">Khóa rundown</Btn>}
      />

      <Panel title="Rundown">
        <p className="text-silver-dim mb-3 text-xs leading-relaxed">
          Thứ tự biểu diễn do BTC quyết định, <strong className="text-silver">không</strong> lấy
          theo thứ tự dòng Google Sheet. Đồng bộ Sheet sẽ không bao giờ ghi đè cột này.
        </p>

        <DataTable
          head={["STT", "Tiết mục", "Đội thi", "Loại hình", "Thời lượng", "Trạng thái", "Sắp xếp"]}
          minWidth={760}
        >
          {rows.map((r, i) => (
            <Row key={r.registrationCode}>
              <Cell mono tone="text-brand">
                #{orderLabel(r)}
              </Cell>
              <Cell tone="text-chalk">
                {r.performanceName}
                {r.infoIncomplete ? (
                  <span className="text-warn border-warn/40 ml-2 rounded border px-1.5 py-0.5 font-mono text-[0.55rem] tracking-[0.1em] uppercase">
                    Chưa hoàn thiện
                  </span>
                ) : null}
              </Cell>
              <Cell mono>{teamLabel(r)}</Cell>
              <Cell mono>{r.performanceType ?? "—"}</Cell>
              <Cell mono tone={r.durationMinutes ? "text-silver" : "text-warn"}>
                {r.durationMinutes ? `${r.durationMinutes} phút` : "chưa có"}
              </Cell>
              <Cell>
                <StatusPill state={i === 2 ? "draft" : i < 2 ? "submitted" : "todo"} />
              </Cell>
              <Cell>
                <span className="flex gap-1">
                  <span className="border-navy-600 text-silver grid size-7 place-items-center rounded border text-xs">
                    ↑
                  </span>
                  <span className="border-navy-600 text-silver grid size-7 place-items-center rounded border text-xs">
                    ↓
                  </span>
                </span>
              </Cell>
            </Row>
          ))}
        </DataTable>

        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="ghost">Đánh dấu tiết mục hiện tại</Btn>
          <Btn variant="electric">Chuyển sang tiết mục kế tiếp</Btn>
        </div>
      </Panel>
    </main>
  );
}
