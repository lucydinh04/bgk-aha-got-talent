import Link from "next/link";
import { redirect } from "next/navigation";

import { CampaignHero, AnniversaryBadge } from "@/components/campaign";
import { Panel, Stat, ProgressBar } from "@/components/ui";
import { EVENT_DATE, LOCATIONS, type LocationCode } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { buildAdminSnapshot, type AdminSnapshot } from "@/lib/server/views";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  standby: "Chờ chương trình",
  interlude: "Giữa hai tiết mục",
  performance: "Đang biểu diễn",
  judging_progress: "BGK đang chấm",
  performance_waiting: "Chờ hoàn tất",
  performance_completed: "Đã chấm xong",
  all_performances_status: "Bảng tổng trạng thái",
  all_scores_completed: "Xong toàn bộ",
  emergency_hide: "Đang ẩn dữ liệu",
};

export default async function AdminDashboard() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login?next=/admin/dashboard");

  const visible = session.location ? [session.location] : LOCATIONS;
  const snapshots = Object.fromEntries(
    visible.map((loc) => [loc, buildAdminSnapshot(loc)]),
  ) as Record<LocationCode, AdminSnapshot>;

  const alerts = visible.flatMap((loc) => {
    const s = snapshots[loc];
    const behind = s.judges.filter((j) => j.pending > 0).length;
    const short = s.performances.filter((p) => p.assigned > 0 && p.missing > 0).length;
    if (!behind && !short) return [];
    return [
      `${loc} · ${behind} BGK chưa hoàn thành · ${short} tiết mục chưa đủ điểm`,
    ];
  });

  return (
    <main className="grid-city min-h-dvh pb-12">
      {/*
        anchor="lightTrail": cover ảnh 3000×1322 vào dải ngang thấp sẽ cắt trên–dưới,
        neo xuống dải light trail nên headline và logo in sẵn trong artwork nằm ngoài
        khung. Nhờ đó headline của hệ thống không lặp chữ với headline của KV.
      */}
      <CampaignHero
        anchor="lightTrail"
        overlay="light"
        priority
        sizes="100vw"
        className="h-56 w-full sm:h-72"
      >
        <div className="flex h-full items-end justify-between gap-4 p-5 sm:p-8">
          <div>
            <p className="text-cyan font-mono text-[0.66rem] tracking-[0.26em] uppercase">
              Ban Tổ chức
            </p>
            <h1 className="display text-chalk mt-1.5 text-3xl sm:text-5xl">
              Aha Got Talent 2026
            </h1>
            <p className="text-silver mt-2 text-xs sm:text-sm">
              Hai đầu cầu vận hành độc lập · dữ liệu và kết quả không gộp chung
            </p>
          </div>
          <AnniversaryBadge width={64} className="hidden sm:block" priority />
        </div>
      </CampaignHero>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Việc cần xử lý nằm TRÊN mọi số liệu đẹp */}
        {alerts.length ? (
          <div className="border-danger/50 bg-danger/8 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3">
            <span className="text-danger font-mono text-[0.64rem] tracking-[0.16em] uppercase">
              Cần xử lý ngay
            </span>
            <span className="text-silver text-xs">{alerts.join(" · ")}</span>
          </div>
        ) : (
          <div className="border-ok/40 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3">
            <span className="text-ok font-mono text-[0.64rem] tracking-[0.16em] uppercase">
              Không có việc tồn
            </span>
            <span className="text-silver text-xs">
              Không có BGK nào đang thiếu phiếu chấm.
            </span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((loc) => (
            <LocationCard key={loc} location={loc} snapshot={snapshots[loc]} />
          ))}
        </div>

        {visible.map((loc) => {
          const s = snapshots[loc];
          const current = s.performances.find((p) => p.id === s.currentPerformanceId);
          return (
            <Panel key={loc} title={`Trạng thái chương trình · ${loc}`}>
              <div className="grid gap-2.5 sm:grid-cols-4">
                <Stat
                  label="Tiết mục hiện tại"
                  value={current ? `#${String(current.order ?? 0).padStart(2, "0")}` : "—"}
                />
                <Stat
                  label="Chế độ LED"
                  value={MODE_LABEL[s.displayMode] ?? s.displayMode}
                  tone="text-chalk text-base"
                />
                <Stat
                  label="BGK đã chấm"
                  value={current ? current.submitted : 0}
                  suffix={current ? `/ ${current.assigned}` : ""}
                  tone="text-cyan"
                />
                <Stat label="Tiến độ tổng" value={s.totals.pct} suffix="%" tone="text-brand" />
              </div>
            </Panel>
          );
        })}

        <Panel title="Bảng xếp hạng">
          <p className="text-silver-dim text-xs leading-relaxed">
            Chưa mở ở giai đoạn này. Xếp hạng và công bố giải thuộc luồng
            Publishing Snapshot — sẽ được nối cùng phase sau. Điểm trung bình tạm
            tính theo từng tiết mục xem ở trang <strong>Tiến độ chấm</strong>.
          </p>
        </Panel>
      </div>
    </main>
  );
}

function LocationCard({
  location,
  snapshot,
}: {
  location: LocationCode;
  snapshot: AdminSnapshot;
}) {
  const { performances, judges, totals, displayMode } = snapshot;
  const live = displayMode !== "standby";
  const status = MODE_LABEL[displayMode] ?? displayMode;

  return (
    <section
      className={`glass rounded-xl border-l-2 p-5 ${
        live ? "border-l-brand" : "border-l-navy-600"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display text-chalk text-2xl">{location}</h2>
          <p className="text-silver-dim tnum mt-0.5 font-mono text-xs">
            {EVENT_DATE[location]}
          </p>
        </div>
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[0.58rem] tracking-[0.12em] uppercase ${
            live ? "text-brand border-brand/50" : "text-silver border-silver/35"
          }`}
        >
          {status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Tiết mục" value={performances.length} />
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

      <div className="mt-4 flex gap-2">
        <Link
          href={`/admin/${location.toLowerCase()}/live-control`}
          className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg text-sm transition ${
            live
              ? "bg-brand hover:bg-brand-deep text-[#1a0c02]"
              : "border-navy-600 text-silver hover:text-chalk border"
          }`}
        >
          Live Control
        </Link>
        <Link
          href={`/live/${location.toLowerCase()}`}
          className="border-navy-600 text-silver hover:text-chalk flex min-h-[44px] items-center justify-center rounded-lg border px-4 text-sm transition"
        >
          Mở LED
        </Link>
      </div>
    </section>
  );
}
