import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CampaignHero } from "@/components/campaign";
import { Panel, Stat, ProgressBar, Banner } from "@/components/ui";
import { toLocation, EVENT_DATE } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { buildAdminSnapshot } from "@/lib/server/views";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { slug: "progress", label: "Tiến độ chấm", desc: "Ma trận BGK × tiết mục, realtime" },
  { slug: "results", label: "Bảng xếp hạng", desc: "Chỉ đầu cầu này, không gộp" },
  { slug: "rundown", label: "Thứ tự biểu diễn", desc: "Sắp xếp và khóa rundown" },
  { slug: "voting", label: "Bình chọn khán giả", desc: "The Crowd Magnet" },
  { slug: "live-control", label: "Live Control", desc: "Điều khiển màn LED" },
];

export default async function LocationDashboard(
  props: PageProps<"/admin/[location]">,
) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireAdmin(location);
  if (!session) redirect(`/admin/login?next=/admin/${slug}`);

  const snapshot = buildAdminSnapshot(location);
  const { performances: rows, judges, totals } = snapshot;
  const behind = judges.filter((j) => j.pending > 0);

  return (
    <main className="grid-city min-h-dvh pb-12">
      <CampaignHero
        anchor="lightTrail"
        overlay="light"
        priority
        sizes="100vw"
        className="h-40 w-full sm:h-48"
      >
        <div className="flex h-full flex-col justify-end p-5 sm:p-7">
          <p className="text-cyan font-mono text-[0.64rem] tracking-[0.26em] uppercase">
            Ban Tổ chức · Đầu cầu
          </p>
          <h1 className="display text-chalk mt-1 text-3xl sm:text-4xl">
            {location} · {EVENT_DATE[location]}
          </h1>
        </div>
      </CampaignHero>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
        {totals.needed === 0 ? (
          <Banner tone="info" label="Chưa có phân công">
            Chưa có BGK nào được phân công chấm ở đầu cầu {location}.
          </Banner>
        ) : totals.needed - totals.done > 0 ? (
          <Banner tone="danger" label="Còn thiếu">
            {totals.needed - totals.done} lượt chấm chưa hoàn thành ·{" "}
            {behind.length} BGK chưa xong
          </Banner>
        ) : (
          <Banner tone="ok" label="Đã đủ">
            Toàn bộ {totals.needed} lượt chấm đã hoàn thành
          </Banner>
        )}

        <Panel title={`Tổng quan ${location}`}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Tiết mục" value={rows.length} />
            <Stat label="BGK" value={judges.length} />
            <Stat label="Cần chấm" value={totals.needed} />
            <Stat label="Đã xong" value={totals.done} tone="text-ok" />
            <Stat
              label="Còn thiếu"
              value={totals.needed - totals.done}
              tone={totals.needed - totals.done ? "text-danger" : "text-ok"}
            />
            <Stat label="Tiến độ" value={totals.pct} suffix="%" tone="text-brand" />
          </div>
          <div className="mt-4">
            <ProgressBar value={totals.pct} label={`Tiến độ ${location}`} />
          </div>
        </Panel>

        <Panel title="Tiến độ theo tiết mục">
          <ul className="flex flex-col gap-2">
            {rows.map((r) => {
              const full = r.assigned > 0 && r.submitted >= r.assigned;
              return (
                <li
                  key={r.id}
                  className="border-navy-800 bg-navy-950/50 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2.5"
                >
                  <span className="text-brand tnum w-8 shrink-0 font-mono text-xs">
                    #{String(r.order ?? 0).padStart(2, "0")}
                  </span>
                  <span className="text-chalk min-w-0 flex-1 truncate text-sm">
                    {r.name}
                  </span>
                  <span className="text-silver tnum shrink-0 font-mono text-xs">
                    {r.submitted}/{r.assigned} BGK
                  </span>
                  <span className="w-full sm:w-40">
                    <ProgressBar
                      value={r.pct}
                      tone={full ? "from-ok to-ok" : "from-electric to-cyan"}
                      label={`Tiến độ ${r.name}`}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.slug}
              href={`/admin/${slug}/${s.slug}`}
              className="glass hover:edge-electric flex flex-col gap-1 rounded-xl p-4 transition"
            >
              <span className="display text-chalk text-base">{s.label}</span>
              <span className="text-silver-dim text-xs">{s.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
