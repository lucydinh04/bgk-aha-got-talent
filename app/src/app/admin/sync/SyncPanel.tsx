"use client";

import { useState, useTransition } from "react";

import { Panel, DataTable, Row, Cell, Btn, Banner, Stat } from "@/components/ui";
import { commitSyncAction, previewSyncAction } from "@/app/actions/sync";
import type { SyncPreview, SyncLogEntry, DiffType } from "@/lib/server/sync";

const DIFF_LABEL: Record<DiffType, readonly [string, string]> = {
  new: ["Mới", "text-cyan border-cyan/45"],
  updated: ["Thay đổi", "text-warn border-warn/45"],
  unchanged: ["Không đổi", "text-silver-dim border-silver/25"],
  source_missing: ["Mất khỏi Sheet", "text-danger border-danger/45"],
  error: ["Lỗi", "text-danger border-danger/45"],
};

/** Trường BTC sở hữu — liệt kê để đối chiếu với SHEET_OWNED trong lib/server/sync.ts */
const BTC_OWNED = [
  "performance_order",
  "official_display_name",
  "team_name",
  "review_status",
  "judging_status",
  "live_status",
  "is_current_performance",
  "judge_assignments (toàn bộ)",
  "scores (toàn bộ)",
];

export function SyncPanel({ history }: { history: SyncLogEntry[] }) {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const check = () =>
    startTransition(async () => {
      setError(null);
      setDone(null);
      const result = await previewSyncAction();
      if (result.ok) setPreview(result.preview);
      else {
        setPreview(null);
        setError(result.error);
      }
    });

  const commit = () =>
    startTransition(async () => {
      if (!preview) return;
      setError(null);
      const result = await commitSyncAction(preview.syncLogId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { created, updated, flagged } = result.result.applied;
      setDone(
        `Đã ghi: ${created} tiết mục mới (chờ duyệt), ${updated} cập nhật, ${flagged} gắn cờ mất khỏi Sheet.`,
      );
      setPreview(null);
    });

  const s = preview?.summary;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Banner tone="warn" label="Không đọc được nguồn">
          {error}
        </Banner>
      ) : done ? (
        <Banner tone="ok" label="Đã đồng bộ">
          {done} Tiết mục mới nằm ở trạng thái <strong>chờ duyệt</strong> — vào
          trang Tiết mục để duyệt trước khi BGK thấy.
        </Banner>
      ) : (
        <Banner tone="info" label="Chưa ghi vào database">
          Đây là bản xem trước. Dữ liệu chỉ được ghi sau khi Admin bấm xác nhận ở
          bước cuối.
        </Banner>
      )}

      <Panel title="Tổng quan lần kiểm tra">
        {s ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <Stat label="Tổng dòng nguồn" value={s.total} />
              <Stat label="Tiết mục mới" value={s.new} tone="text-cyan" />
              <Stat label="Có thay đổi" value={s.updated} tone="text-warn" />
              <Stat label="Không đổi" value={s.unchanged} />
              <Stat
                label="Mất khỏi Sheet"
                value={s.sourceMissing}
                tone={s.sourceMissing ? "text-danger" : "text-ok"}
              />
            </div>
            <p className="text-silver-dim mt-3 font-mono text-xs">
              Đọc lúc {new Date(preview.fetchedAt).toLocaleString("vi-VN")} ·{" "}
              {s.error} dòng lỗi
            </p>
          </>
        ) : (
          <p className="text-silver-dim text-sm">
            Bấm “Kiểm tra dữ liệu mới” để đọc Google Sheet và so sánh với
            database. Thao tác này chỉ đọc — không ghi gì.
          </p>
        )}
      </Panel>

      {preview ? (
        <Panel title="Xem trước thay đổi">
          <DataTable
            head={["Mã đăng ký", "Tiết mục", "Khác biệt", "Trường thay đổi"]}
            minWidth={720}
          >
            {preview.rows.map((r) => {
              const [label, tone] = DIFF_LABEL[r.diff];
              return (
                <Row key={`${r.registrationCode}-${r.diff}`}>
                  <Cell mono className="text-[0.62rem]">
                    {r.registrationCode}
                  </Cell>
                  <Cell tone="text-chalk">{r.performanceName}</Cell>
                  <Cell>
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[0.58rem] tracking-[0.1em] uppercase ${tone}`}
                    >
                      {label}
                    </span>
                  </Cell>
                  <Cell mono className="text-[0.66rem]">
                    {r.changes.length
                      ? r.changes
                          .map(
                            (c) =>
                              `${c.field}: ${c.from ?? "(trống)"} → ${c.to ?? "(trống)"}`,
                          )
                          .join("  ·  ")
                      : (r.issues[0] ?? "—")}
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
        </Panel>
      ) : null}

      <Panel title="Trường BTC sở hữu — sync không bao giờ ghi đè">
        <ul className="text-silver-dim grid gap-1 font-mono text-[0.68rem] sm:grid-cols-2">
          {BTC_OWNED.map((f) => (
            <li key={f}>· {f}</li>
          ))}
        </ul>
        <p className="text-silver-dim mt-3 text-xs leading-relaxed">
          Dòng biến mất khỏi Sheet được gắn cờ <code>source_missing</code>, không
          bị xoá. Ô để trống trong Sheet không xoá giá trị đang có trong database.
        </p>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Btn variant="ghost" disabled={pending} onClick={check}>
          {pending && !preview ? "Đang đọc Sheet…" : "Kiểm tra dữ liệu mới"}
        </Btn>
        <Btn variant="brand" disabled={pending || !preview} onClick={commit}>
          {preview
            ? `Xác nhận · ${s?.new ?? 0} mới, ${s?.updated ?? 0} cập nhật`
            : "Xác nhận cập nhật"}
        </Btn>
      </div>

      <Panel title="Lịch sử đồng bộ">
        {history.length === 0 ? (
          <p className="text-silver-dim text-sm">Chưa có lần đồng bộ nào.</p>
        ) : (
          <DataTable
            head={["Thời điểm", "Người thực hiện", "Trạng thái", "Mới", "Cập nhật", "Lỗi"]}
            minWidth={640}
          >
            {history.map((h) => (
              <Row key={h.id}>
                <Cell mono className="text-[0.66rem]">
                  {new Date(h.startedAt).toLocaleString("vi-VN")}
                </Cell>
                <Cell mono>{h.initiatedByEmail ?? "—"}</Cell>
                <Cell mono tone={h.status === "committed" ? "text-ok" : "text-silver-dim"}>
                  {h.status === "committed" ? "đã ghi" : h.status}
                </Cell>
                <Cell mono>{h.newRecords}</Cell>
                <Cell mono>{h.updatedRecords}</Cell>
                <Cell mono tone={h.failedRecords ? "text-danger" : "text-silver-dim"}>
                  {h.failedRecords}
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}
