"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusPill, ProgressBar, type JudgeState } from "@/components/ui";
import { orderLabel, teamLabel, type Performance } from "@/lib/data";

export interface JudgeRow {
  performance: Performance;
  state: JudgeState;
  /** điểm của CHÍNH BGK này — không bao giờ là điểm trung bình */
  myTotal?: string;
  filledCriteria?: number;
}

const FILTERS = [
  { key: "all", label: "Tất cả" },
  { key: "todo", label: "Chưa chấm" },
  { key: "draft", label: "Đang chấm" },
  { key: "submitted", label: "Đã gửi" },
  { key: "locked", label: "Đã khóa" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function JudgeList({
  rows,
  locationSlug,
}: {
  rows: JudgeRow[];
  locationSlug: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = rows.filter((r) => filter === "all" || r.state === filter);
  const done = counts.submitted ?? 0;
  const pct = rows.length ? (done / rows.length) * 100 : 0;

  return (
    <>
      <section className="glass mt-4 rounded-xl p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-silver font-mono text-[0.68rem] tracking-[0.14em] uppercase">
            Tiến độ của bạn
          </span>
          <span className="display text-chalk tnum text-lg">
            {done}/{rows.length}
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar value={pct} label="Tiến độ chấm điểm" />
        </div>
        <div className="text-silver mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span>
            Đã gửi <strong className="text-ok">{counts.submitted ?? 0}</strong>
          </span>
          <span>
            Đang chấm <strong className="text-warn">{counts.draft ?? 0}</strong>
          </span>
          <span>
            Chưa chấm <strong className="text-chalk">{counts.todo ?? 0}</strong>
          </span>
          <span>
            Đã khóa{" "}
            <strong className="text-locked">{counts.locked ?? 0}</strong>
          </span>
        </div>
      </section>

      {/* Bộ lọc — vùng chạm tối thiểu 44px, cuộn ngang trên màn hẹp */}
      <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Lọc tiết mục"
          className="border-navy-800 flex min-w-max gap-1 border-b"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                className={`min-h-[44px] border-b-2 px-3 text-sm whitespace-nowrap transition ${
                  active
                    ? "border-brand text-brand"
                    : "text-silver-dim hover:text-silver border-transparent"
                }`}
              >
                {f.label}
                <span className="tnum ml-1.5 font-mono text-[0.66rem]">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-silver-dim border-navy-700 mt-4 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
          Không có tiết mục nào ở trạng thái này.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((r) => (
            <Card key={r.performance.registrationCode} row={r} locationSlug={locationSlug} />
          ))}
        </ul>
      )}
    </>
  );
}

function Card({ row, locationSlug }: { row: JudgeRow; locationSlug: string }) {
  const { performance: p, state } = row;
  const edge =
    state === "submitted"
      ? "border-l-ok"
      : state === "locked"
        ? "border-l-locked"
        : state === "draft"
          ? "border-l-warn"
          : "border-l-navy-600";

  const reviewing = state === "submitted" || state === "locked";
  const href = reviewing
    ? `/judge/${locationSlug}/result/${p.registrationCode}`
    : `/judge/${locationSlug}/performance/${p.registrationCode}`;

  return (
    <li>
      <Link
        href={href}
        className={`glass hover:edge-electric block rounded-xl border-l-2 p-4 transition ${edge}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-brand tnum font-mono text-xs">
            #{orderLabel(p)}
          </span>
          <StatusPill state={state} />
        </div>

        <h2 className="display text-chalk mt-2 text-base leading-tight">
          {p.performanceName}
        </h2>

        <p className="text-silver mt-1.5 text-xs">
          {[
            p.participationType,
            p.performanceType,
            p.durationMinutes ? `${p.durationMinutes} phút` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-silver-dim mt-0.5 text-xs">
          {teamLabel(p)} · {p.department ?? "—"} · {p.memberCount ?? "?"} thành viên
        </p>

        {p.infoIncomplete ? (
          <span className="text-warn border-warn/40 mt-2.5 inline-block rounded border px-2 py-0.5 font-mono text-[0.58rem] tracking-[0.1em] uppercase">
            Thông tin chưa hoàn thiện
          </span>
        ) : null}

        {row.myTotal ? (
          <div className="border-navy-800 mt-3 flex items-baseline justify-between border-t pt-2.5">
            <span className="text-silver-dim text-xs">Điểm của bạn</span>
            <span className="display text-chalk tnum text-lg">{row.myTotal}</span>
          </div>
        ) : null}

        {state === "draft" && row.filledCriteria !== undefined ? (
          <p className="text-warn mt-2 text-xs">
            Đang lưu nháp · {row.filledCriteria}/5 tiêu chí
          </p>
        ) : null}

        <span
          className={`mt-3 flex min-h-[44px] items-center justify-center rounded-lg text-sm font-medium ${
            reviewing
              ? "border-navy-600 text-silver border"
              : "bg-brand text-[#1a0c02]"
          }`}
        >
          {state === "locked"
            ? "Xem lại · đã khóa"
            : reviewing
              ? "Xem lại"
              : state === "draft"
                ? "Tiếp tục chấm"
                : "Chấm điểm"}
        </span>
      </Link>
    </li>
  );
}
