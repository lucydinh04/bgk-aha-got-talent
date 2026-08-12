"use client";

import { useMemo, useState, useTransition } from "react";

import { Banner, Btn, Cell, DataTable, EmptyState, Panel, Row } from "@/components/ui";
import { LOCATIONS, type LocationCode } from "@/lib/data";
import type { JudgeAdminRow } from "@/lib/server/judges";
import {
  addJudgeAction,
  deleteJudgeAction,
  previewAssignmentsAction,
  setJudgeStatusAction,
  updateJudgeAction,
  type JudgeActionState,
} from "@/app/actions/judges";

/**
 * Quản lý Ban Giám khảo — toàn bộ thao tác bằng giao diện.
 *
 * Trang này tồn tại để không ai phải mở Railway Shell hay gõ SQL nữa. Mọi thay
 * đổi đi qua server action có guard `requireAdmin`, và ghi vào đúng cùng một
 * database mà app đang chạy — kể cả trên production, nơi file DB nằm trên volume
 * `/data` và không ai chạm tới được từ bên ngoài.
 *
 * ĐẦU CẦU LƯU Ở ĐÂU: trong `judge_assignments`, không phải trong một chuỗi
 * "SGN,HAN". Xem ghi chú đầu file `lib/server/judges.ts`.
 */

type Filter = "all" | "SGN" | "HAN" | "both" | "active" | "disabled";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "SGN", label: "SGN" },
  { key: "HAN", label: "HAN" },
  { key: "both", label: "Cả SGN & HAN" },
  { key: "active", label: "Đang hoạt động" },
  { key: "disabled", label: "Đã vô hiệu hoá" },
];

function venueLabel(venues: LocationCode[]): string {
  if (venues.length === 0) return "Chưa phân công";
  return venues.join(" + ");
}

const EMPTY: JudgeActionState = { ok: false };

export function JudgeManager({ rows }: { rows: JudgeAdminRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<JudgeAdminRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(
    () =>
      rows.filter((j) => {
        switch (filter) {
          case "SGN":
          case "HAN":
            return j.venues.includes(filter);
          case "both":
            return j.venues.length === LOCATIONS.length;
          case "active":
            return j.status === "active";
          case "disabled":
            return j.status === "disabled";
          default:
            return true;
        }
      }),
    [rows, filter],
  );

  const perVenue = LOCATIONS.map((v) => ({
    venue: v,
    n: rows.filter((j) => j.status === "active" && j.venues.includes(v)).length,
  }));

  function toggleStatus(j: JudgeAdminRow) {
    const next = j.status === "active" ? "disabled" : "active";
    startTransition(async () => {
      const r = await setJudgeStatusAction(j.id, next);
      if (!r.ok) setError(r.error ?? "Không đổi được trạng thái.");
      else setNotice(`Đã ${next === "disabled" ? "vô hiệu hoá" : "kích hoạt"} ${j.email}.`);
    });
  }

  function remove(j: JudgeAdminRow) {
    if (
      !confirm(
        `Xoá hẳn ${j.email}?\n\nChỉ nên xoá khi BGK này chưa từng chấm. Nếu chỉ muốn ngừng cho chấm, hãy dùng "Vô hiệu hoá".`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await deleteJudgeAction(j.id);
      if (!r.ok) setError(r.error ?? "Không xoá được.");
      else setNotice(`Đã xoá ${j.email}.`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Banner tone="ok" label="Đã xong">
              {notice}
            </Banner>
          </div>
          <Btn className="min-h-[40px] px-3 text-xs" onClick={() => setNotice(null)}>
            Đóng
          </Btn>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Banner tone="danger" label="Lỗi">
              {error}
            </Banner>
          </div>
          <Btn className="min-h-[40px] px-3 text-xs" onClick={() => setError(null)}>
            Đóng
          </Btn>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-[40px] rounded-lg border px-3 text-xs transition ${
                filter === f.key
                  ? "border-brand text-brand bg-brand/10"
                  : "border-navy-600 text-silver-dim hover:text-chalk"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Btn variant="brand" onClick={() => setAdding(true)}>
          + Thêm Ban Giám khảo
        </Btn>
      </div>

      <Panel
        title={`${rows.length} BGK · ${perVenue.map((p) => `${p.venue} ${p.n}`).join(" · ")}`}
      >
        {shown.length === 0 ? (
          <EmptyState title="Không có BGK nào khớp bộ lọc" />
        ) : (
          <DataTable
            minWidth={880}
            head={[
              "Họ tên",
              "Email",
              "Đầu cầu",
              "Được giao",
              "Đã chấm",
              "Chưa chấm",
              "Trạng thái",
              "Thao tác",
            ]}
          >
            {shown.map((j) => (
              <Row key={j.id}>
                <Cell tone="text-chalk">
                  {j.fullName}
                  {j.title ? (
                    <span className="text-silver-dim block text-xs">{j.title}</span>
                  ) : null}
                </Cell>
                <Cell mono>{j.email}</Cell>
                <Cell tone={j.venues.length ? "text-cyan" : "text-warn"}>
                  {venueLabel(j.venues)}
                </Cell>
                <Cell mono>{j.assigned}</Cell>
                <Cell mono tone="text-ok">
                  {j.submitted}
                </Cell>
                <Cell mono tone={j.pending ? "text-warn" : "text-silver-dim"}>
                  {j.pending}
                </Cell>
                <Cell tone={j.status === "active" ? "text-ok" : "text-silver-dim"}>
                  {j.status === "active" ? "Đang hoạt động" : "Đã vô hiệu hoá"}
                </Cell>
                <Cell>
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      className="min-h-[36px] px-3 text-xs"
                      onClick={() => setEditing(j)}
                      disabled={pending}
                    >
                      Chỉnh sửa
                    </Btn>
                    <Btn
                      className="min-h-[36px] px-3 text-xs"
                      onClick={() => toggleStatus(j)}
                      disabled={pending}
                    >
                      {j.status === "active" ? "Vô hiệu hoá" : "Kích hoạt"}
                    </Btn>
                    {/* Xoá chỉ hiện khi chưa có bản ghi điểm nào — kể cả nháp. */}
                    {j.totalScores === 0 ? (
                      <Btn
                        variant="danger"
                        className="min-h-[36px] px-3 text-xs"
                        onClick={() => remove(j)}
                        disabled={pending}
                      >
                        Xoá
                      </Btn>
                    ) : null}
                  </div>
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}
      </Panel>

      {adding ? (
        <JudgeDialog
          mode="add"
          onClose={() => setAdding(false)}
          onDone={(m) => {
            setAdding(false);
            setNotice(m);
          }}
        />
      ) : null}

      {editing ? (
        <JudgeDialog
          mode="edit"
          judge={editing}
          onClose={() => setEditing(null)}
          onDone={(m) => {
            setEditing(null);
            setNotice(m);
          }}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Modal thêm / sửa.

   Ba bước: nhập → xác nhận → xong. Bước xác nhận tồn tại vì thao tác này sinh
   ra hàng chục dòng phân công; người dùng cần thấy con số đó TRƯỚC khi bấm, chứ
   không phải phát hiện sau.
   ═══════════════════════════════════════════════════════════════════════════ */

function JudgeDialog({
  mode,
  judge,
  onClose,
  onDone,
}: {
  mode: "add" | "edit";
  judge?: JudgeAdminRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [email, setEmail] = useState(judge?.email ?? "");
  const [fullName, setFullName] = useState(judge?.fullName ?? "");
  const [title, setTitle] = useState(judge?.title ?? "");
  const [venues, setVenues] = useState<LocationCode[]>(judge?.venues ?? [...LOCATIONS]);
  const [autoAssign, setAutoAssign] = useState(true);
  const [status, setStatus] = useState<"active" | "disabled">(judge?.status ?? "active");
  const [preview, setPreview] = useState<number | null>(null);
  const [state, setState] = useState<JudgeActionState>(EMPTY);
  const [pending, startTransition] = useTransition();

  const removingVenues = (judge?.venues ?? []).filter((v) => !venues.includes(v));

  function toggleVenue(v: LocationCode) {
    setVenues((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  function goConfirm() {
    setState(EMPTY);
    if (!email.trim()) {
      setState({ ok: false, error: "Nhập email của Ban Giám khảo." });
      return;
    }
    if (venues.length === 0 && mode === "add") {
      setState({ ok: false, error: "Chọn ít nhất một đầu cầu chấm điểm." });
      return;
    }
    startTransition(async () => {
      const r = await previewAssignmentsAction(venues);
      setPreview(r.count ?? 0);
      setStep("confirm");
    });
  }

  function submit(allowUpdate: boolean) {
    const fd = new FormData();
    fd.set("email", email);
    fd.set("fullName", fullName);
    fd.set("title", title);
    for (const v of venues) fd.append("venues", v);
    fd.set("autoAssign", autoAssign ? "1" : "0");
    fd.set("status", status);
    if (allowUpdate) fd.set("allowUpdate", "1");

    startTransition(async () => {
      const r =
        mode === "add"
          ? await addJudgeAction(EMPTY, fd)
          : await updateJudgeAction(EMPTY, fd);
      setState(r);
      if (r.ok && r.result) {
        const v = venueLabel(r.result.venues);
        onDone(
          `Đã ${r.result.outcome === "created" ? "thêm" : "cập nhật"} ${r.result.email} · ${v} · ${r.result.totalAssignments} tiết mục được phân công.`,
        );
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(4,9,20,.82)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "add" ? "Thêm Ban Giám khảo" : "Chỉnh sửa Ban Giám khảo"}
    >
      <div className="glass-strong w-full max-w-lg rounded-2xl p-5">
        <h2 className="text-chalk mb-4 text-lg font-semibold">
          {mode === "add" ? "Thêm Ban Giám khảo" : `Chỉnh sửa · ${judge?.email}`}
        </h2>

        {state.error ? (
          <Banner tone="danger" label="Không lưu được">
            {state.error}
            {state.duplicate ? (
              <span className="mt-1 block text-xs">
                Đang chấm: {venueLabel(state.duplicate.venues)} ·{" "}
                {state.duplicate.assigned} tiết mục. Bạn có thể cập nhật đầu cầu cho
                tài khoản này thay vì tạo mới.
              </span>
            ) : null}
          </Banner>
        ) : null}

        {step === "form" ? (
          <div className="mt-3 flex flex-col gap-3">
            <Field label="Email *">
              <input
                type="email"
                value={email}
                disabled={mode === "edit"}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@ahamove.com"
                className="border-navy-600 bg-navy-950 text-chalk min-h-[44px] w-full rounded-lg border px-3 text-sm disabled:opacity-60"
              />
            </Field>

            <Field label="Họ tên">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Để trống nếu chưa biết"
                className="border-navy-600 bg-navy-950 text-chalk min-h-[44px] w-full rounded-lg border px-3 text-sm"
              />
            </Field>

            <Field label="Chức danh">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Để trống nếu chưa biết"
                className="border-navy-600 bg-navy-950 text-chalk min-h-[44px] w-full rounded-lg border px-3 text-sm"
              />
            </Field>

            <Field label="Đầu cầu chấm điểm *">
              <div className="flex gap-2">
                {LOCATIONS.map((v) => (
                  <label
                    key={v}
                    className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border text-sm transition ${
                      venues.includes(v)
                        ? "border-cyan text-cyan bg-cyan/10"
                        : "border-navy-600 text-silver-dim"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={venues.includes(v)}
                      onChange={() => toggleVenue(v)}
                      className="accent-cyan"
                    />
                    {v}
                  </label>
                ))}
              </div>
            </Field>

            {mode === "add" ? (
              <label className="text-silver flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoAssign}
                  onChange={(e) => setAutoAssign(e.target.checked)}
                  className="accent-brand mt-1"
                />
                Tự động phân công tất cả tiết mục đang active của đầu cầu đã chọn
              </label>
            ) : (
              <Field label="Trạng thái tài khoản">
                <div className="flex gap-2">
                  {(["active", "disabled"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={`min-h-[44px] flex-1 rounded-lg border text-sm ${
                        status === s
                          ? "border-brand text-brand bg-brand/10"
                          : "border-navy-600 text-silver-dim"
                      }`}
                    >
                      {s === "active" ? "Đang hoạt động" : "Đã vô hiệu hoá"}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {removingVenues.length > 0 ? (
              <Banner tone="warn" label="Sẽ gỡ phân công">
                Bỏ {removingVenues.join(" và ")} sẽ gỡ phân công của đầu cầu đó khỏi
                dashboard của BGK này. Điểm đã chấm KHÔNG bị xoá và vẫn tính vào kết
                quả.
              </Banner>
            ) : null}

            <div className="mt-2 flex justify-end gap-2">
              <Btn onClick={onClose} disabled={pending}>
                Huỷ
              </Btn>
              <Btn variant="brand" onClick={goConfirm} disabled={pending}>
                Tiếp tục
              </Btn>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-silver text-sm">
              {mode === "add"
                ? "Xác nhận thêm Ban Giám khảo?"
                : "Xác nhận cập nhật Ban Giám khảo?"}
            </p>
            <dl className="border-navy-700 flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <Line k="Email" v={email.trim().toLowerCase()} />
              <Line k="Đầu cầu" v={venueLabel(venues)} />
              <Line
                k="Tiết mục sẽ được phân công"
                v={
                  mode === "add" && !autoAssign
                    ? "0 — chưa phân công"
                    : `${preview ?? 0} tiết mục`
                }
              />
            </dl>
            <div className="mt-2 flex justify-end gap-2">
              <Btn onClick={() => setStep("form")} disabled={pending}>
                Quay lại
              </Btn>
              <Btn
                variant="brand"
                onClick={() => submit(mode === "edit" || Boolean(state.duplicate))}
                disabled={pending}
              >
                {pending ? "Đang lưu…" : "Xác nhận"}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-silver-dim font-mono text-[0.65rem] tracking-[0.14em] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-silver-dim text-xs">{k}</dt>
      <dd className="text-chalk tnum text-right text-sm">{v}</dd>
    </div>
  );
}
