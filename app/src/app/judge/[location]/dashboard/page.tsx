import { notFound, redirect } from "next/navigation";

import { CampaignLogo, CampaignHero } from "@/components/campaign";
import type { JudgeState } from "@/components/ui";
import { EVENT_DATE, toLocation } from "@/lib/data";
import { listApproved } from "@/lib/server/performances";
import { findScore } from "@/lib/server/scores";
import { requireJudge } from "@/lib/server/session";
import { assignedPerformanceIds } from "@/lib/server/users";
import { fromColumns, filledCount } from "@/lib/scoring";
import { logout } from "@/app/actions/auth";
import { JudgeList, type JudgeRow } from "./JudgeList";

export const dynamic = "force-dynamic";

export default async function JudgeDashboard(
  props: PageProps<"/judge/[location]/dashboard">,
) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireJudge(location);
  if (!session) redirect(`/judge/${slug}`);

  /*
   * Hai lớp lọc chồng nhau, cố ý:
   *   · `listApproved` bỏ tiết mục chưa được BTC duyệt
   *   · giao với danh sách phân công của chính BGK này
   * BGK không thấy tiết mục người khác chấm, và không thấy tiết mục chưa duyệt.
   */
  const assigned = new Set(assignedPerformanceIds(session.userId));
  const mine = listApproved(location).filter((p) => assigned.has(p.id));

  const rows: JudgeRow[] = mine.map((p) => {
    const score = findScore(session.userId, p.id);
    const state: JudgeState = !score
      ? "todo"
      : score.status === "locked"
        ? "locked"
        : score.status === "submitted"
          ? "submitted"
          : "draft";

    return {
      performance: p,
      state,
      // Chỉ điểm của CHÍNH BGK này. Không có truy vấn nào lấy điểm người khác.
      myTotal:
        state === "submitted" || state === "locked"
          ? (score?.total_score?.toFixed(2) ?? undefined)
          : undefined,
      filledCriteria: state === "draft" ? filledCount(fromColumns(score)) : undefined,
    };
  });

  return (
    <main className="bg-ink min-h-dvh pb-16">
      {/*
        Không dùng full KV làm nền danh sách. Dải header dùng KV vuông neo sát
        đáy — chỉ còn light trail thành phố, không dính headline lẫn icon A.
      */}
      <CampaignHero
        variant="square"
        anchor="cityBand"
        overlay="light"
        priority
        sizes="100vw"
        className="h-24 w-full sm:h-28"
      >
        <div className="flex h-full items-start justify-between p-4">
          <CampaignLogo width={96} priority />
          <span className="text-brand border-brand/50 rounded-full border px-2.5 py-0.5 font-mono text-[0.62rem] tracking-[0.16em] uppercase">
            {location}
          </span>
        </div>
      </CampaignHero>

      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
        <div className="border-navy-800 flex items-start justify-between gap-4 border-b py-4">
          <div>
            <h1 className="display text-chalk text-xl sm:text-2xl">
              Xin chào, {session.fullName}
            </h1>
            <p className="text-silver mt-1 text-xs">
              Bạn đang chấm điểm Aha Got Talent 2026 tại {location} ·{" "}
              {EVENT_DATE[location]}
            </p>
          </div>
          <form action={logout}>
            <input type="hidden" name="redirectTo" value={`/judge/${slug}`} />
            <button
              type="submit"
              className="text-silver-dim hover:text-silver shrink-0 font-mono text-[0.66rem] tracking-[0.1em] uppercase underline-offset-4 hover:underline"
            >
              Đăng xuất
            </button>
          </form>
        </div>

        {rows.length === 0 ? (
          <p className="text-silver-dim border-navy-700 mt-6 rounded-xl border border-dashed px-4 py-10 text-center text-sm leading-relaxed">
            Bạn chưa được phân công tiết mục nào ở đầu cầu {location}.
            <br />
            Liên hệ Ban Tổ chức nếu bạn cho rằng đây là nhầm lẫn.
          </p>
        ) : (
          <JudgeList rows={rows} locationSlug={slug} />
        )}

        <p className="text-silver-dim mt-6 text-center text-[0.7rem] leading-relaxed">
          Bạn chỉ thấy điểm của chính mình. Điểm của BGK khác, điểm trung bình và
          bảng xếp hạng không xuất hiện ở bất kỳ đâu trong luồng này.
        </p>
      </div>
    </main>
  );
}
