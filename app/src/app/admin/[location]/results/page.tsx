import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { toLocation, EVENT_DATE } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { buildResultsOverview } from "@/lib/server/results";
import { ResultsOverviewView } from "./ResultsOverviewView";

/**
 * TẦNG 1 — tổng quan tất cả tiết mục của một đầu cầu.
 *
 * Trang này từng dựng hằng `RESULTS` trong `src/lib/demo.ts`, tức là dữ liệu mẫu
 * hardcode. Giờ nó đọc điểm thật qua `buildResultsOverview`.
 *
 * `force-dynamic` là bắt buộc: điểm đổi liên tục trong lúc BGK chấm, và một trang
 * kết quả bị cache là một trang nói sai.
 */
export const dynamic = "force-dynamic";

export default async function ResultsPage(
  props: PageProps<"/admin/[location]/results">,
) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  // `requireAdmin(location)` chặn cả BGK và Admin của đầu cầu khác. Đây là dữ
  // liệu điểm — không có đường nào cho BGK hay màn LED đọc route này.
  const session = await requireAdmin(location);
  if (!session) redirect(`/admin/login?next=/admin/${slug}/results`);

  const overview = buildResultsOverview(location);

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        location={location}
        title="Tổng hợp điểm — Aha Got Talent 2026"
        subtitle={`${EVENT_DATE[location]} · theo dõi tiến độ chấm và kết quả tổng hợp của từng tiết mục`}
      />
      <ResultsOverviewView
        overview={overview}
        slug={location.toLowerCase() as Lowercase<typeof location>}
      />
    </main>
  );
}
