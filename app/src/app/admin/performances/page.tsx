import Link from "next/link";
import { redirect } from "next/navigation";

import { Panel, PageHeader, DataTable, Row, Cell, Btn } from "@/components/ui";
import { LOCATIONS, EVENT_DATE, orderLabel } from "@/lib/data";
import { listAll, teamLabelOf } from "@/lib/server/performances";
import { requireAdmin } from "@/lib/server/session";
import { ReviewButtons } from "./ReviewButtons";

export const dynamic = "force-dynamic";

const REVIEW_LABEL = {
  pending_review: ["Chờ duyệt", "text-warn border-warn/45"],
  approved: ["Đã duyệt · BGK thấy", "text-ok border-ok/45"],
  rejected: ["Từ chối", "text-danger border-danger/45"],
} as const;

export default async function PerformancesPage() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login?next=/admin/performances");

  // Admin gắn với một đầu cầu chỉ thấy đầu cầu đó.
  const visible = session.location ? [session.location] : LOCATIONS;
  const all = visible.flatMap((loc) => listAll(loc));
  const pending = all.filter((p) => p.reviewStatus === "pending_review").length;

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        title="Quản lý tiết mục"
        subtitle={`${all.length} tiết mục · ${pending} chờ duyệt`}
        action={
          <Link href="/admin/sync">
            <Btn variant="ghost">Đồng bộ Google Sheet</Btn>
          </Link>
        }
      />

      <Panel title="Quy trình duyệt" className="mb-4">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {(["Đồng bộ từ Sheet", "Chờ duyệt", "Đã duyệt"] as const).map((s, i, arr) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={`rounded border px-2.5 py-1 font-mono text-[0.62rem] tracking-[0.1em] uppercase ${
                  i === arr.length - 1
                    ? "border-brand text-brand"
                    : "border-navy-600 text-silver-dim"
                }`}
              >
                {s}
              </span>
              {i < arr.length - 1 ? (
                <span className="text-silver-dim text-xs" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="text-silver-dim mt-3 text-xs">
          Tiết mục mới từ Google Sheet luôn vào ở trạng thái{" "}
          <strong className="text-warn">Chờ duyệt</strong>. Chỉ tiết mục{" "}
          <strong className="text-brand">Đã duyệt</strong> mới xuất hiện trong
          Judge Dashboard và trên màn LED.
        </p>
      </Panel>

      <div className="flex flex-col gap-4">
        {visible.map((loc) => {
          const rows = listAll(loc);
          return (
            <Panel key={loc} title={`${loc} · ${EVENT_DATE[loc]}`}>
              <DataTable
                head={[
                  "STT",
                  "Mã đăng ký",
                  "Tiết mục",
                  "Đại diện",
                  "Loại hình",
                  "Phút",
                  "TV",
                  "Thông tin",
                  "Trạng thái",
                  "Thao tác",
                ]}
                minWidth={1040}
              >
                {rows.map((p) => {
                  const [label, tone] = REVIEW_LABEL[p.reviewStatus];
                  return (
                    <Row key={p.registrationCode}>
                      <Cell mono tone="text-brand">
                        #{orderLabel(p)}
                      </Cell>
                      <Cell mono className="text-[0.62rem]">
                        {p.registrationCode}
                      </Cell>
                      <Cell tone="text-chalk">{p.performanceName}</Cell>
                      <Cell mono>{teamLabelOf(p)}</Cell>
                      <Cell mono>{p.performanceType ?? "—"}</Cell>
                      <Cell mono>{p.durationMinutes ?? "—"}</Cell>
                      <Cell mono>{p.memberCount ?? "—"}</Cell>
                      <Cell>
                        {p.infoIncomplete ? (
                          <span className="text-warn border-warn/40 rounded border px-1.5 py-0.5 font-mono text-[0.55rem] tracking-[0.1em] uppercase">
                            Chưa hoàn thiện
                          </span>
                        ) : (
                          <span className="text-ok font-mono text-xs">Đủ</span>
                        )}
                      </Cell>
                      <Cell>
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[0.58rem] tracking-[0.1em] uppercase ${tone}`}
                        >
                          {label}
                        </span>
                      </Cell>
                      <Cell>
                        <ReviewButtons
                          code={p.registrationCode}
                          status={p.reviewStatus}
                        />
                      </Cell>
                    </Row>
                  );
                })}
              </DataTable>
            </Panel>
          );
        })}
      </div>
    </main>
  );
}
