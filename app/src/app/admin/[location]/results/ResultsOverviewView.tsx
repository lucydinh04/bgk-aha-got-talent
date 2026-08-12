"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Panel, Stat, DataTable, Row, Cell, Btn, EmptyState } from "@/components/ui";
import type { LocationCode } from "@/lib/data";
import type { OverviewRow, ResultStatus, ResultsOverview } from "@/lib/server/results";

/*
  `import type` chứ không phải import thường: `results.ts` mở đầu bằng
  `import "server-only"`, và gói đó cố tình ném lỗi khi bị nạp vào bundle client.
  Type bị TypeScript xoá lúc biên dịch nên không còn import nào ở runtime.
*/

const STATUS_LABEL: Record<ResultStatus, string> = {
  not_scored: "Chưa chấm",
  in_progress: "Đang chấm",
  completed: "Đã hoàn tất",
  locked: "Đã khoá",
};

/* Màu là kênh phân biệt chính — BTC quét bảng bằng mắt, không đọc từng chữ. */
const STATUS_TONE: Record<ResultStatus, string> = {
  not_scored: "border-navy-700 bg-navy-900/60 text-silver-dim",
  in_progress: "border-warn/45 bg-warn/10 text-warn",
  completed: "border-ok/45 bg-ok/10 text-ok",
  locked: "border-locked/45 bg-locked/10 text-locked",
};

type Filter = "all" | ResultStatus;
type Sort = "order" | "score-desc" | "score-asc" | "progress" | "name";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "completed", label: "Đã hoàn tất" },
  { key: "in_progress", label: "Đang chấm" },
  { key: "not_scored", label: "Chưa chấm" },
  { key: "locked", label: "Đã khoá" },
];

const SORTS: { key: Sort; label: string }[] = [
  { key: "order", label: "Thứ tự biểu diễn" },
  { key: "score-desc", label: "Điểm cao → thấp" },
  { key: "score-asc", label: "Điểm thấp → cao" },
  { key: "progress", label: "Tiến độ" },
  { key: "name", label: "Tên tiết mục" },
];

/** Điểm chưa có thì hiện "—". Không bao giờ 0 — 0 là một con số, "—" là không có số. */
const num = (v: number | null) => (v == null ? "—" : v.toFixed(2));

export function ResultsOverviewView({
  overview,
  slug,
}: {
  overview: ResultsOverview;
  slug: Lowercase<LocationCode>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("order");
  const [query, setQuery] = useState("");

  useAdminRefresh(slug);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = overview.rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      // Tìm theo cả tên tiết mục và tên đội — BTC nhớ đội nhiều hơn nhớ tên tiết mục.
      return (
        r.name.toLowerCase().includes(q) || r.team.toLowerCase().includes(q)
      );
    });

    // Tiết mục chưa có điểm luôn xuống cuối khi sắp theo điểm, ở CẢ hai chiều:
    // "điểm thấp → cao" không có nghĩa là "chưa chấm đứng đầu".
    const byScore = (dir: 1 | -1) => (a: OverviewRow, b: OverviewRow) => {
      if (a.avg == null && b.avg == null) return 0;
      if (a.avg == null) return 1;
      if (b.avg == null) return -1;
      return (a.avg - b.avg) * dir;
    };

    const sorted = [...filtered];
    if (sort === "order") {
      sorted.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    } else if (sort === "score-desc") {
      sorted.sort(byScore(-1));
    } else if (sort === "score-asc") {
      sorted.sort(byScore(1));
    } else if (sort === "progress") {
      sorted.sort((a, b) => b.progressPct - a.progressPct);
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    }
    return sorted;
  }, [overview.rows, filter, sort, query]);

  const { kpi, attention } = overview;

  return (
    <div className="flex flex-col gap-4">
      {/* ── KPI ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Tổng tiết mục" value={kpi.total} />
        <Stat label="Đã hoàn tất" value={kpi.completed} tone="text-ok" />
        <Stat label="Đang chờ chấm" value={kpi.pending} tone="text-warn" />
        <Stat label="Tiến độ tổng" value={`${kpi.progressPct}%`} tone="text-cyan" />
        <Stat
          label="Điểm TB cao nhất"
          value={num(kpi.topAvg)}
          tone="text-brand"
          suffix={kpi.topAvg == null ? undefined : "/ 100"}
        />
      </div>

      {/* ── Cần chú ý ─────────────────────────────────────────────────── */}
      {attention.incompletePerformances > 0 || attention.judgesIncomplete > 0 ? (
        <Panel title="Cần chú ý">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <ul className="text-chalk flex flex-col gap-1 text-sm">
              {attention.incompletePerformances > 0 ? (
                <li>
                  <strong className="text-warn tnum">
                    {attention.incompletePerformances}
                  </strong>{" "}
                  tiết mục chưa đủ BGK chấm
                </li>
              ) : null}
              {attention.judgesIncomplete > 0 ? (
                <li>
                  <strong className="text-warn tnum">
                    {attention.judgesIncomplete}
                  </strong>{" "}
                  BGK chưa hoàn thành toàn bộ phần chấm
                </li>
              ) : null}
            </ul>
            <Link href={`/admin/${slug}/progress`}>
              <Btn variant="ghost">Xem tiến độ BGK</Btn>
            </Link>
          </div>
        </Panel>
      ) : null}

      {/* ── Bảng ──────────────────────────────────────────────────────── */}
      <Panel
        title={`Tổng hợp ${overview.rows.length} tiết mục`}
        action={
          <a href={`/api/admin/${slug}/results/export`} download>
            <Btn variant="ghost">Export tổng hợp</Btn>
          </a>
        }
      >
        <div className="mb-3 flex flex-col gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tiết mục hoặc đội…"
            aria-label="Tìm tiết mục hoặc đội"
            className="border-navy-700 bg-navy-950/60 text-chalk placeholder:text-silver-dim focus-visible:border-cyan w-full rounded-lg border px-3 py-2 text-sm outline-none sm:max-w-sm"
          />
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <FilterGroup
              legend="Trạng thái"
              options={FILTERS}
              value={filter}
              onChange={setFilter}
            />
            <label className="flex items-center gap-2">
              <span className="text-silver-dim font-mono text-[0.6rem] tracking-[0.12em] uppercase">
                Sắp xếp
              </span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="border-navy-700 bg-navy-950/60 text-chalk rounded-lg border px-2 py-1.5 text-xs outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {overview.rows.length === 0 ? (
          <EmptyState title="Chưa có tiết mục để tổng hợp" />
        ) : rows.length === 0 ? (
          <EmptyState title="Không có tiết mục nào khớp bộ lọc" />
        ) : (
          <>
            {/* Desktop: bảng đầy đủ */}
            <div className="hidden md:block">
              <DataTable
                head={[
                  "STT",
                  "Tiết mục",
                  "Loại hình",
                  "BGK đã chấm",
                  "Tiến độ",
                  "Điểm TB",
                  "Trạng thái",
                  "",
                ]}
                minWidth={860}
              >
                {rows.map((r) => (
                  <Row key={r.id}>
                    <Cell className="tnum text-brand font-mono">
                      {r.order == null ? "—" : String(r.order).padStart(2, "0")}
                    </Cell>
                    <Cell>
                      <span className="text-chalk block">{r.name}</span>
                      <span className="text-silver-dim block text-xs">{r.team}</span>
                    </Cell>
                    <Cell className="text-silver text-xs">
                      {r.performanceType ?? "—"}
                    </Cell>
                    <Cell className="tnum">
                      {r.submitted}/{r.assigned}
                      {r.drafts > 0 ? (
                        <span className="text-warn ml-1 text-xs">
                          +{r.drafts} nháp
                        </span>
                      ) : null}
                    </Cell>
                    <Cell className="tnum">{r.progressPct}%</Cell>
                    <Cell className="tnum display text-brand text-base">
                      {num(r.avg)}
                    </Cell>
                    <Cell>
                      <StatusBadge status={r.status} />
                    </Cell>
                    <Cell>
                      <Link href={`/admin/${slug}/results/${r.id}`}>
                        <Btn variant="ghost">Xem chi tiết</Btn>
                      </Link>
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            </div>

            {/* Mobile: card list — bảng tám cột không đọc được trên điện thoại */}
            <ul className="flex flex-col gap-3 md:hidden">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="border-navy-800 bg-navy-950/50 rounded-lg border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="tnum text-brand font-mono text-xs">
                        {r.order == null ? "—" : String(r.order).padStart(2, "0")}
                      </span>
                      <p className="text-chalk truncate">{r.name}</p>
                      <p className="text-silver-dim truncate text-xs">{r.team}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-silver-dim font-mono text-[0.55rem] uppercase">
                        BGK
                      </p>
                      <p className="tnum text-chalk text-sm">
                        {r.submitted}/{r.assigned}
                      </p>
                    </div>
                    <div>
                      <p className="text-silver-dim font-mono text-[0.55rem] uppercase">
                        Tiến độ
                      </p>
                      <p className="tnum text-cyan text-sm">{r.progressPct}%</p>
                    </div>
                    <div>
                      <p className="text-silver-dim font-mono text-[0.55rem] uppercase">
                        Điểm TB
                      </p>
                      <p className="tnum display text-brand text-sm">{num(r.avg)}</p>
                    </div>
                  </div>
                  <Link
                    href={`/admin/${slug}/results/${r.id}`}
                    className="mt-3 block"
                  >
                    <Btn variant="ghost" className="w-full">
                      Xem chi tiết
                    </Btn>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}

function StatusBadge({ status }: { status: ResultStatus }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] whitespace-nowrap uppercase ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function FilterGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="text-silver-dim float-left mr-2 font-mono text-[0.6rem] tracking-[0.12em] uppercase">
        {legend}
      </legend>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`rounded-full border px-2.5 py-1 font-mono text-[0.6rem] tracking-[0.1em] uppercase transition-colors ${
            value === o.key
              ? "border-cyan bg-cyan/10 text-cyan"
              : "border-navy-700 text-silver-dim hover:text-chalk"
          }`}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/**
 * Realtime bằng cách làm mới server component, không phải bằng cách dựng thêm một
 * kênh dữ liệu song song.
 *
 * Kênh `/api/admin/[location]/stream` đã tồn tại, đã kiểm quyền Admin, và đã phát
 * mỗi khi điểm thay đổi. Ở đây ta không dùng payload của nó — chỉ dùng nó như một
 * tín hiệu "có gì đổi" rồi gọi `router.refresh()`. Server tính lại và React thay
 * cây con.
 *
 * Vì sao không `useSnapshot` như màn LED: LED cần giữ khung hình cuối khi mất
 * mạng nên nó phải giữ dữ liệu trong state. Trang Admin thì ngược lại — nó nên
 * hiện đúng thứ server vừa tính. `router.refresh()` không reset scroll và không
 * mất filter đang chọn, vì state đó nằm ở client và không bị dựng lại.
 */
function useAdminRefresh(slug: string) {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource(`/api/admin/${slug}/stream`);
    const onMessage = () => router.refresh();
    es.addEventListener("snapshot", onMessage);
    // Không log lỗi ra console của BTC: EventSource tự kết nối lại, và một dòng
    // đỏ giữa đêm diễn chỉ làm người dùng lo chứ không giúp gì.
    es.onerror = () => {};
    return () => es.close();
  }, [router, slug]);
}
