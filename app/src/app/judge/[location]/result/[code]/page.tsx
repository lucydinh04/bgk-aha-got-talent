import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CampaignLogo } from "@/components/campaign";
import { Panel, Btn, StatusPill } from "@/components/ui";
import { toLocation, CRITERIA, scoreBand, orderLabel, teamLabel } from "@/lib/data";
import { fromColumns } from "@/lib/scoring";
import { byCode, listApproved } from "@/lib/server/performances";
import { findScore, isAssigned } from "@/lib/server/scores";
import { requireJudge } from "@/lib/server/session";
import { assignedPerformanceIds } from "@/lib/server/users";

export const dynamic = "force-dynamic";

export default async function ResultPage(
  props: PageProps<"/judge/[location]/result/[code]">,
) {
  const { location: slug, code: rawCode } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireJudge(location);
  if (!session) redirect(`/judge/${slug}`);

  const p = byCode(decodeURIComponent(rawCode));
  if (!p || p.location !== location) notFound();
  if (!isAssigned(session.userId, p.id)) notFound();

  const score = findScore(session.userId, p.id);
  // Chưa gửi thì không có gì để xem lại — về thẳng màn chấm.
  if (!score || score.status === "draft") {
    redirect(`/judge/${slug}/performance/${p.registrationCode}`);
  }

  const values = fromColumns(score);
  const total = score.total_score ?? 0;
  const locked = score.status === "locked";

  // Tiết mục kế tiếp mà BGK này chưa gửi điểm — nút cuối trang trỏ đúng chỗ.
  const assigned = new Set(assignedPerformanceIds(session.userId));
  const nextTodo = listApproved(location)
    .filter((x) => assigned.has(x.id))
    .find((x) => {
      const s = findScore(session.userId, x.id);
      return !s || s.status === "draft";
    });

  const comments: [string, string | null][] = [
    ["Điểm nổi bật", score.highlight_comment],
    ["Góp ý", score.improvement_comment],
    ["Ghi chú riêng cho BTC", score.private_note],
  ];

  return (
    <main className="bg-ink grid-city min-h-dvh pb-16">
      <header className="glass-strong sticky top-0 z-30 border-b border-b-[color-mix(in_oklab,var(--color-navy-700)_60%,transparent)]">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href={`/judge/${slug}/dashboard`}
            className="text-silver hover:text-chalk flex min-h-[44px] items-center pr-1 text-sm"
            aria-label="Về danh sách tiết mục"
          >
            ‹
          </Link>
          <CampaignLogo width={82} priority />
          <span className="bg-navy-700 h-5 w-px" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-brand tnum font-mono text-[0.6rem] tracking-[0.14em] uppercase">
              {location} · #{orderLabel(p)}
            </p>
            <p className="display text-chalk truncate text-sm">{p.performanceName}</p>
          </div>
          <StatusPill state={locked ? "locked" : "submitted"} />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:px-6">
        <Panel>
          <p className="text-cyan font-mono text-[0.62rem] tracking-[0.2em] uppercase">
            Điểm của bạn
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="display text-brand tnum text-5xl">{total.toFixed(2)}</span>
            <span className="text-silver-dim text-sm">/ 100</span>
          </div>
          <p className="text-silver-dim mt-2 text-xs">
            Đây là điểm của riêng bạn, không phải điểm trung bình của tiết mục.
          </p>
        </Panel>

        <Panel title="Chi tiết theo tiêu chí">
          <ul className="flex flex-col gap-2.5">
            {CRITERIA.map((c) => {
              const v = values[c.key];
              if (v === undefined) return null;
              const band = scoreBand(v);
              return (
                <li
                  key={c.key}
                  className="border-navy-800 bg-navy-950/50 rounded-lg border p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-chalk text-sm">{c.label}</span>
                    <span className="text-cyan tnum shrink-0 font-mono text-[0.66rem]">
                      {Math.round(c.weight * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="display text-chalk tnum text-2xl">{v}</span>
                    <span className={`text-xs ${band.tone}`}>{band.label}</span>
                    <span className="text-silver-dim tnum text-xs">
                      Quy đổi{" "}
                      <strong className="text-silver">{(v * c.weight).toFixed(2)}</strong>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Nhận xét của bạn">
          <dl className="flex flex-col gap-3">
            {comments.map(([k, v]) => (
              <div key={k}>
                <dt className="text-cyan font-mono text-[0.6rem] tracking-[0.12em] uppercase">
                  {k}
                </dt>
                <dd
                  className={`mt-1 text-sm leading-relaxed ${
                    v ? "text-silver" : "text-silver-dim italic"
                  }`}
                >
                  {v ?? "Bạn không ghi nhận xét cho mục này."}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Tiết mục">
          <p className="text-silver text-sm">{teamLabel(p)}</p>
          <p className="text-silver-dim mt-1 text-xs">
            {[p.participationType, p.performanceType, p.department]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </Panel>

        {locked ? (
          <div className="border-locked/40 bg-locked/8 rounded-xl border px-4 py-3">
            <p className="text-locked font-mono text-[0.64rem] tracking-[0.14em] uppercase">
              Điểm đã khóa
            </p>
            <p className="text-silver mt-1 text-xs">
              Ban Tổ chức đã khóa kết quả tiết mục này. Bạn chỉ có thể xem lại,
              không chỉnh sửa được.
            </p>
          </div>
        ) : (
          <div className="border-ok/40 rounded-xl border px-4 py-3">
            <p className="text-ok font-mono text-[0.64rem] tracking-[0.14em] uppercase">
              Đã gửi
            </p>
            <p className="text-silver mt-1 text-xs">
              Điểm đã được ghi nhận lúc{" "}
              {score.submitted_at
                ? new Date(score.submitted_at).toLocaleTimeString("vi-VN")
                : "—"}
              . Bạn còn sửa được cho tới khi Ban Tổ chức khóa kết quả.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {nextTodo ? (
            <Link
              href={`/judge/${slug}/performance/${nextTodo.registrationCode}`}
              className="contents"
            >
              <Btn variant="brand" className="w-full sm:flex-1">
                Chấm tiết mục tiếp theo
              </Btn>
            </Link>
          ) : null}
          {!locked ? (
            <Link
              href={`/judge/${slug}/performance/${p.registrationCode}`}
              className="contents"
            >
              <Btn variant="ghost" className="w-full sm:flex-1">
                Sửa điểm này
              </Btn>
            </Link>
          ) : null}
          <Link href={`/judge/${slug}/dashboard`} className="contents">
            <Btn variant="ghost" className="w-full sm:flex-1">
              Về danh sách
            </Btn>
          </Link>
        </div>
      </div>
    </main>
  );
}
