import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { toLocation } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { buildPerformanceResult, CRITERIA_META } from "@/lib/server/results";
import { PerformanceResultView } from "./PerformanceResultView";

/**
 * TẦNG 2 — chi tiết điểm của một tiết mục.
 *
 * Là một trang riêng, không phải modal. Bảng này có bảy dòng BGK nhân bảy cột và
 * một khối nhận xét; nhồi vào modal thì phải cuộn trong cuộn, và không chia sẻ
 * được đường dẫn cho người khác mở đúng tiết mục đó.
 */
export const dynamic = "force-dynamic";

export default async function PerformanceResultPage(
  props: PageProps<"/admin/[location]/results/[performanceId]">,
) {
  const { location: slug, performanceId } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireAdmin(location);
  if (!session) {
    redirect(`/admin/login?next=/admin/${slug}/results/${performanceId}`);
  }

  const detail = buildPerformanceResult(performanceId);

  /*
   * Tiết mục phải thuộc đúng đầu cầu trong URL. `requireAdmin(location)` chỉ
   * kiểm đầu cầu của đường dẫn; nếu không so thêm ở đây thì Admin chỉ được phân
   * công SGN vẫn xem được điểm HAN bằng cách dán id vào URL /admin/sgn/...
   */
  if (!detail || detail.performance.location !== location) notFound();

  const p = detail.performance;
  const meta = [
    detail.team,
    p.department,
    p.performanceType,
    p.durationMinutes ? `${p.durationMinutes} phút` : null,
    location,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <Link
        href={`/admin/${slug}/results`}
        className="text-silver hover:text-chalk mb-3 inline-block font-mono text-[0.66rem] tracking-[0.16em] uppercase"
      >
        ← Quay lại Tổng hợp điểm
      </Link>

      <PageHeader
        location={
          p.performanceOrder == null
            ? location
            : `${location} · ${String(p.performanceOrder).padStart(2, "0")}`
        }
        title={detail.name}
        subtitle={meta}
      />

      <PerformanceResultView
        detail={detail}
        slug={location.toLowerCase() as Lowercase<typeof location>}
        criteria={CRITERIA_META}
      />
    </main>
  );
}
