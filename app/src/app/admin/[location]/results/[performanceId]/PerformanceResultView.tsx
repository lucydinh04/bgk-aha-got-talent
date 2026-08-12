"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Panel, Stat, DataTable, Row, Cell, Btn, EmptyState } from "@/components/ui";
import type { LocationCode } from "@/lib/data";
import type {
  JudgeScoreRow,
  JudgeScoreStatus,
  PerformanceResult,
} from "@/lib/server/results";

const JUDGE_STATUS_LABEL: Record<JudgeScoreStatus, string> = {
  not_scored: "Chưa chấm",
  draft: "Đang chấm",
  submitted: "Đã gửi",
  locked: "Đã khoá",
};

const JUDGE_STATUS_TONE: Record<JudgeScoreStatus, string> = {
  not_scored: "border-navy-700 bg-navy-900/60 text-silver-dim",
  draft: "border-warn/45 bg-warn/10 text-warn",
  submitted: "border-ok/45 bg-ok/10 text-ok",
  locked: "border-locked/45 bg-locked/10 text-locked",
};

/** Chưa có điểm thì "—". Một ô trống và một số 0 nói hai điều khác nhau. */
const num = (v: number | null, digits = 2) => (v == null ? "—" : v.toFixed(digits));

export function PerformanceResultView({
  detail,
  slug,
  criteria,
}: {
  detail: PerformanceResult;
  slug: Lowercase<LocationCode>;
  /** Nhãn và trọng số tiêu chí, truyền từ server để client không import lại. */
  criteria: { key: string; label: string; weightPct: number }[];
}) {
  useAdminRefresh(slug);

  const { kpi, judges, criteriaAverages, performance } = detail;
  const hasAnyScore = kpi.submitted > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── KPI ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Điểm trung bình"
          value={num(kpi.avg)}
          tone="text-brand"
          suffix={kpi.avg == null ? undefined : "/ 100"}
        />
        <Stat label="BGK đã chấm" value={`${kpi.submitted}/${kpi.assigned}`} />
        <Stat label="Tiến độ" value={`${kpi.progressPct}%`} tone="text-cyan" />
        <Stat label="Điểm cao nhất" value={num(kpi.max)} tone="text-ok" />
        <Stat label="Điểm thấp nhất" value={num(kpi.min)} tone="text-warn" />
        <Stat label="Độ chênh" value={num(kpi.spread)} tone="text-locked" />
      </div>

      {/* ── Bảng điểm từng BGK ────────────────────────────────────────── */}
      <Panel
        title="Bảng điểm từng Ban Giám khảo"
        action={
          <a
            href={`/api/admin/${slug}/results/${performance.id}/export`}
            download
          >
            <Btn variant="ghost">Export CSV</Btn>
          </a>
        }
      >
        {judges.length === 0 ? (
          <EmptyState title="Chưa có BGK nào được phân công tiết mục này">
            Vào Quản lý Ban Giám khảo để phân công.
          </EmptyState>
        ) : (
          <>
            <DataTable
              head={[
                "BGK",
                ...criteria.map((c) => `${c.label} · ${c.weightPct}%`),
                "Tổng điểm",
                "Trạng thái",
              ]}
              minWidth={980}
            >
              {judges.map((j) => (
                <Row key={j.judgeId}>
                  <Cell>
                    <span className="text-chalk block">{j.name}</span>
                    {j.title ? (
                      <span className="text-silver-dim block text-xs">
                        {j.title}
                      </span>
                    ) : null}
                  </Cell>
                  {j.values.map((v, i) => (
                    <Cell key={criteria[i].key} className="tnum">
                      {v == null ? (
                        <span className="text-silver-dim">—</span>
                      ) : (
                        num(v, 0)
                      )}
                    </Cell>
                  ))}
                  <Cell className="tnum display text-brand text-base">
                    {num(j.total)}
                  </Cell>
                  <Cell>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[0.6rem] tracking-[0.1em] whitespace-nowrap uppercase ${JUDGE_STATUS_TONE[j.status]}`}
                    >
                      {JUDGE_STATUS_LABEL[j.status]}
                    </span>
                  </Cell>
                </Row>
              ))}

              {/* Hàng trung bình — nổi bật hẳn khỏi các dòng BGK. Chỉ tính phiếu
                  đã gửi; draft và người chưa chấm không tham gia. */}
              <tr className="border-cyan/40 bg-navy-900/70 border-t-2">
                <Cell className="text-cyan font-mono text-xs uppercase">
                  Trung bình Ban Giám khảo
                </Cell>
                {criteriaAverages.map((v, i) => (
                  <Cell key={criteria[i].key} className="tnum text-chalk">
                    {num(v)}
                  </Cell>
                ))}
                <Cell className="tnum display text-brand text-lg">
                  {num(kpi.avg)}
                </Cell>
                <Cell className="text-silver-dim text-xs">
                  {kpi.submitted}/{kpi.assigned} phiếu
                </Cell>
              </tr>
            </DataTable>

            {!hasAnyScore ? (
              <p className="text-silver-dim mt-3 text-xs">
                Chưa có điểm được gửi cho tiết mục này. Bảng vẫn liệt kê đủ BGK
                được phân công để Ban Tổ chức biết còn thiếu ai.
              </p>
            ) : null}
          </>
        )}
      </Panel>

      {/* ── Trung bình theo tiêu chí ───────────────────────────────────── */}
      {hasAnyScore ? (
        <Panel title="Điểm trung bình theo tiêu chí">
          <ul className="flex flex-col gap-3">
            {criteria.map((c, i) => {
              const v = criteriaAverages[i];
              return (
                <li key={c.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-chalk text-sm">
                      {c.label}
                      <span className="text-silver-dim ml-2 font-mono text-[0.6rem]">
                        {c.weightPct}%
                      </span>
                    </span>
                    <span className="tnum display text-chalk text-sm">
                      {num(v)}
                      <span className="text-silver-dim ml-1 text-xs">/ 100</span>
                    </span>
                  </div>
                  <div className="bg-navy-900 h-2 overflow-hidden rounded-full">
                    <div
                      className="from-electric to-cyan h-full rounded-full bg-gradient-to-r"
                      // Thanh chỉ để đọc nhanh tương quan giữa năm tiêu chí, nên
                      // thang đo là 0–100 tuyệt đối, không phải min–max của dữ liệu:
                      // co giãn theo dữ liệu sẽ phóng đại một chênh lệch 2 điểm
                      // thành nửa thanh.
                      style={{ width: `${v == null ? 0 : Math.max(0, Math.min(100, v))}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {/* ── Nhận xét ──────────────────────────────────────────────────── */}
      <Panel title="Nhận xét Ban Giám khảo">
        <CommentList judges={judges} />
      </Panel>
    </div>
  );
}

/**
 * Nhận xét mặc định đóng.
 *
 * Mở sẵn cả bảy thẻ thì trang dài gấp ba và BTC phải cuộn qua chúng để tới thứ
 * khác. Nhận xét là thứ người ta tìm khi đã biết mình muốn đọc của ai.
 */
function CommentList({ judges }: { judges: JudgeScoreRow[] }) {
  const withComments = judges.filter(
    (j) =>
      j.comments &&
      (j.comments.highlight || j.comments.improvement || j.comments.privateNote),
  );

  if (withComments.length === 0) {
    return (
      <p className="text-silver-dim text-sm">
        Không có nhận xét. Nhận xét chỉ hiện sau khi BGK gửi phiếu.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {withComments.map((j) => (
        <CommentCard key={j.judgeId} judge={j} />
      ))}
    </ul>
  );
}

function CommentCard({ judge }: { judge: JudgeScoreRow }) {
  const [open, setOpen] = useState(false);
  const c = judge.comments!;
  return (
    <li className="border-navy-800 bg-navy-950/50 rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="text-chalk block truncate text-sm">{judge.name}</span>
          <span className="tnum text-brand display text-xs">
            {judge.total == null ? "—" : judge.total.toFixed(2)}
          </span>
        </span>
        <span className="text-silver-dim font-mono text-[0.6rem] tracking-[0.1em] uppercase">
          {open ? "Thu gọn" : "Xem nhận xét"}
        </span>
      </button>
      {open ? (
        <dl className="border-navy-800 flex flex-col gap-3 border-t px-3 py-3">
          <Field label="Điểm nổi bật" value={c.highlight} />
          <Field label="Góp ý" value={c.improvement} />
          <Field label="Ghi chú cho Ban Tổ chức" value={c.privateNote} />
        </dl>
      ) : null}
    </li>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-silver-dim font-mono text-[0.6rem] tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd className="text-chalk mt-1 text-sm leading-relaxed whitespace-pre-line">
        {value?.trim() ? value : <span className="text-silver-dim">—</span>}
      </dd>
    </div>
  );
}

/** Xem ghi chú ở ResultsOverviewView — cùng cơ chế, cùng lý do. */
function useAdminRefresh(slug: string) {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource(`/api/admin/${slug}/stream`);
    const onMessage = () => router.refresh();
    es.addEventListener("snapshot", onMessage);
    es.onerror = () => {};
    return () => es.close();
  }, [router, slug]);
}
