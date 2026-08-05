import { notFound, redirect } from "next/navigation";
import {
  Panel,
  PageHeader,
  Banner,
  DataTable,
  Row,
  Cell,
  StatusPill,
  Btn,
  EmptyState,
} from "@/components/ui";
import { requireAdmin } from "@/lib/server/session";
import { toLocation, EVENT_DATE, CRITERIA, AWARDS } from "@/lib/data";
import { RESULTS } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function ResultsPage(
  props: PageProps<"/admin/[location]/results">,
) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireAdmin(location);
  if (!session) redirect(`/admin/login?next=/admin/${slug}/results`);

  const rows = RESULTS[location];
  const tied = rows.filter((r) => r.valid === "tied");
  const insufficient = rows.filter((r) => r.valid === "insufficient");
  const awards = AWARDS[location];

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        location={location}
        title="Bảng xếp hạng"
        subtitle={`${EVENT_DATE[location]} · chỉ tiết mục ${location}`}
        action={
          <span className="text-silver-dim font-mono text-[0.66rem]">
            Không gộp với đầu cầu còn lại
          </span>
        }
      />

      {/* Phase 3 chưa nối luồng công bố kết quả. Nói thẳng ra để không ai đọc nhầm là số thật. */}
      <Banner tone="warn" label="Dữ liệu minh hoạ">
        Trang này chưa nối vào database. Số liệu bên dưới là dữ liệu mẫu của bản
        thiết kế, KHÔNG phải kết quả thật — luồng công bố kết quả sẽ được nối ở phase sau.
      </Banner>

      {rows.length === 0 ? (
        <EmptyState title="Chưa có kết quả">
          Đầu cầu {location} diễn ra ngày {EVENT_DATE[location]}. Bảng xếp hạng
          xuất hiện khi các tiết mục đã được chấm.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {tied.length >= 2 ? (
            <Banner tone="warn" label="Có tiết mục đồng điểm cần xử lý">
              {tied.map((t) => t.name).join(" và ")} cùng {tied[0].avgTotal} sau
              4 bước tie-break. Hệ thống không tự chọn người thắng.
            </Banner>
          ) : null}

          {insufficient.length ? (
            <Banner tone="danger" label="Chưa đủ điều kiện xếp hạng">
              {insufficient.map((t) => `${t.name} (${t.judgesDone})`).join(" · ")}
            </Banner>
          ) : null}

          <Panel title="Xếp hạng">
            <DataTable
              head={[
                "Hạng",
                "Tiết mục",
                "Đội thi",
                "Điểm TB",
                ...CRITERIA.map((c) => c.label.split(" ")[0]),
                "BGK",
                "Trạng thái",
              ]}
              minWidth={860}
            >
              {rows.map((r) => (
                <Row key={r.code}>
                  <Cell
                    mono
                    tone={r.valid === "insufficient" ? "text-silver-dim" : "text-brand"}
                  >
                    {r.rank}
                  </Cell>
                  <Cell tone="text-chalk">{r.name}</Cell>
                  <Cell mono>{r.team}</Cell>
                  <Cell mono tone="text-chalk">
                    {r.avgTotal}
                  </Cell>
                  {r.perCriterion.map((v, i) => (
                    <Cell key={i} mono>
                      {v}
                    </Cell>
                  ))}
                  <Cell
                    mono
                    tone={r.valid === "insufficient" ? "text-danger" : "text-silver"}
                  >
                    {r.judgesDone}
                  </Cell>
                  <Cell>
                    <StatusPill
                      state={
                        r.valid === "valid"
                          ? "submitted"
                          : r.valid === "tied"
                            ? "draft"
                            : "error"
                      }
                    />
                  </Cell>
                </Row>
              ))}
            </DataTable>
            <p className="text-silver-dim mt-3 text-xs leading-relaxed">
              Điểm TB = tổng điểm hợp lệ ÷ số BGK đã chấm hợp lệ. Bộ điểm bị loại
              không tính vào cả tử số lẫn mẫu số. Không hiển thị điểm của từng BGK.
            </p>
          </Panel>

          <Panel title="Gán giải">
            <DataTable head={["Thứ tự", "Giải", "Nguồn", "Tiết mục"]} minWidth={520}>
              {awards.map((a) => {
                const winner = rows.find((r) => r.awardCode === a.code);
                return (
                  <Row key={a.code}>
                    <Cell mono tone="text-brand">
                      {a.order}
                    </Cell>
                    <Cell tone="text-chalk">
                      {a.nameEn}
                      <span className="text-silver-dim ml-2 text-xs">
                        {a.nameVi}
                      </span>
                    </Cell>
                    <Cell mono tone={a.source === "audience_vote" ? "text-cyan" : "text-silver"}>
                      {a.source === "audience_vote" ? "Bình chọn khán giả" : "Điểm BGK"}
                    </Cell>
                    <Cell tone={winner ? "text-chalk" : "text-silver-dim"}>
                      {a.source === "audience_vote"
                        ? "Từ Voting Result Snapshot"
                        : (winner?.name ?? "Chờ BTC quyết")}
                    </Cell>
                  </Row>
                );
              })}
            </DataTable>
          </Panel>

          <Panel title="Thao tác">
            <div className="flex flex-wrap gap-2">
              <Btn variant="ghost">Xuất CSV / XLSX</Btn>
              <Btn variant="ghost">Ghi quyết định BTC cho cặp đồng điểm</Btn>
              <Btn variant="brand">Tạo Publishing Snapshot</Btn>
            </div>
            <p className="text-silver-dim mt-3 text-xs leading-relaxed">
              Tạo snapshot sẽ khóa toàn bộ điểm của đầu cầu {location} và đóng băng
              kết quả. Không tạo được khi còn đồng điểm chưa xử lý.
            </p>
          </Panel>
        </div>
      )}
    </main>
  );
}
