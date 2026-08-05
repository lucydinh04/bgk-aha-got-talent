"use client";

import {
  Panel,
  Banner,
  DataTable,
  Row,
  Cell,
  MatrixCell,
  StatusPill,
  Btn,
  ProgressBar,
} from "@/components/ui";
import type { LocationCode } from "@/lib/data";
import { useSnapshot } from "@/lib/useSnapshot";
import type { AdminSnapshot } from "@/lib/server/views";

/**
 * Tiến độ chấm — dữ liệu thật, cập nhật realtime.
 *
 * Chỉ đầu cầu của trang này. `AdminSnapshot` được dựng theo một `location` duy
 * nhất và kênh SSE cũng chia theo `location`, nên không có đường nào để số của
 * SGN lọt sang bảng HAN.
 */

const LEGEND = [
  ["todo", "Chưa bắt đầu"],
  ["draft", "Đang chấm"],
  ["submitted", "Đã gửi"],
  ["locked", "Đã khóa"],
] as const;

export function ProgressBoard({
  location,
  slug,
  initial,
}: {
  location: LocationCode;
  slug: string;
  initial: AdminSnapshot;
}) {
  const { data, connection, lastUpdate } = useSnapshot<AdminSnapshot>(
    `/api/admin/${slug}/stream`,
    initial,
  );

  const { performances: rows, judges, totals } = data;
  const behind = judges.filter((j) => j.pending > 0);

  return (
    <>
      {/* Cảnh báo mất kết nối đứng trên mọi con số: số cũ mà tưởng mới là tệ nhất */}
      {connection !== "live" ? (
        <Banner tone="warn" label="Mất kết nối realtime">
          Đang tự nối lại. Số liệu bên dưới là lần cập nhật cuối
          {lastUpdate ? ` lúc ${new Date(lastUpdate).toLocaleTimeString("vi-VN")}` : ""}.
        </Banner>
      ) : null}

      {/* Câu trả lời cho câu hỏi duy nhất Admin đang có, đặt trên mọi số liệu */}
      {behind.length ? (
        <Banner tone="warn" label={`${behind.length} BGK chưa hoàn thành`}>
          {behind.map((j) => `${j.name} (${j.submitted}/${j.assigned})`).join(" · ")}
        </Banner>
      ) : (
        <Banner tone="ok" label="Đã đủ">
          Toàn bộ BGK đã hoàn thành phần chấm
        </Banner>
      )}

      <div className="mt-4 flex flex-col gap-4">
        <Panel title="Ma trận BGK × tiết mục">
          <DataTable
            head={[
              "BGK",
              "Chức danh",
              ...rows.map((r) => `#${String(r.order ?? 0).padStart(2, "0")}`),
              "Xong",
              "Nháp",
              "Hoạt động",
            ]}
            minWidth={760}
          >
            {judges.map((j) => {
              const complete = j.assigned > 0 && j.submitted === j.assigned;
              return (
                <Row key={j.id}>
                  <Cell tone="text-chalk">{j.name}</Cell>
                  <Cell mono>{j.title}</Cell>
                  {rows.map((r, i) => (
                    <Cell key={r.id} className="w-10">
                      {j.cells[i] ? (
                        <MatrixCell
                          state={j.cells[i]!}
                          label={`${j.name} · ${r.name}`}
                        />
                      ) : (
                        // Không được phân công: ô trống, không phải "chưa chấm"
                        <span
                          className="text-silver-dim grid size-8 place-items-center font-mono text-[0.7rem]"
                          title={`${j.name} không chấm ${r.name}`}
                        >
                          ·
                        </span>
                      )}
                    </Cell>
                  ))}
                  <Cell mono tone={complete ? "text-ok" : "text-warn"}>
                    {j.submitted}/{j.assigned}
                  </Cell>
                  <Cell mono tone={j.drafts ? "text-warn" : "text-silver-dim"}>
                    {j.drafts}
                  </Cell>
                  <Cell mono tone="text-silver-dim">
                    {j.lastActivityAt
                      ? new Date(j.lastActivityAt).toLocaleTimeString("vi-VN")
                      : "chưa đăng nhập"}
                  </Cell>
                </Row>
              );
            })}
          </DataTable>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-silver-dim font-mono text-[0.6rem] tracking-[0.12em] uppercase">
              Trạng thái
            </span>
            {LEGEND.map(([state, label]) => (
              <span key={state} className="flex items-center gap-1.5">
                <MatrixCell state={state} label={label} />
                <span className="text-silver-dim text-[0.68rem]">{label}</span>
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="Tiến độ theo tiết mục">
          <DataTable
            head={[
              "STT",
              "Tiết mục",
              "BGK đã gửi",
              "Còn thiếu",
              "Tiến độ",
              "Trạng thái",
              "TB tạm tính",
            ]}
            minWidth={720}
          >
            {rows.map((r) => {
              const full = r.assigned > 0 && r.submitted >= r.assigned;
              return (
                <Row key={r.id}>
                  <Cell mono tone="text-brand">
                    #{String(r.order ?? 0).padStart(2, "0")}
                  </Cell>
                  <Cell tone="text-chalk">{r.name}</Cell>
                  <Cell mono>
                    {r.submitted}/{r.assigned}
                  </Cell>
                  <Cell mono tone={r.missing ? "text-warn" : "text-silver-dim"}>
                    {r.missing}
                  </Cell>
                  <Cell className="w-40">
                    <ProgressBar
                      value={r.pct}
                      tone={full ? "from-ok to-ok" : "from-electric to-cyan"}
                      label={`Tiến độ ${r.name}`}
                    />
                  </Cell>
                  <Cell>
                    <StatusPill
                      state={full ? "submitted" : r.submitted ? "draft" : "todo"}
                    />
                  </Cell>
                  {/*
                    Cột duy nhất trong hệ thống hiện điểm trung bình khi chưa
                    công bố. Nó ở trang Admin, sau lớp kiểm tra quyền, và không
                    có mặt trong LedSnapshot.
                  */}
                  <Cell mono tone="text-silver">
                    {r.provisionalAvg?.toFixed(2) ?? "—"}
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
        </Panel>

        <Panel title="Thao tác">
          <div className="flex flex-wrap gap-2">
            <Btn variant="ghost" disabled>
              Nhắc tất cả BGK còn thiếu
            </Btn>
            <Btn variant="ghost" disabled>
              Khóa toàn đầu cầu {location}
            </Btn>
          </div>
          <p className="text-silver-dim mt-3 text-xs">
            Tổng tiến độ {totals.done}/{totals.needed} ({totals.pct}%) · còn{" "}
            {totals.drafts} bản nháp. Khoá điểm và nhắc BGK sẽ mở cùng luồng công
            bố kết quả ở phase sau.
          </p>
        </Panel>
      </div>
    </>
  );
}
