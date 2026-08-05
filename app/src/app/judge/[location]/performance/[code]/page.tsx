import { notFound, redirect } from "next/navigation";

import { toLocation } from "@/lib/data";
import { fromColumns } from "@/lib/scoring";
import { byCode } from "@/lib/server/performances";
import { findScore, isAssigned } from "@/lib/server/scores";
import { requireJudge } from "@/lib/server/session";
import { ScoringForm } from "./ScoringForm";

export const dynamic = "force-dynamic";

export default async function ScoringPage(
  props: PageProps<"/judge/[location]/performance/[code]">,
) {
  const { location: slug, code: rawCode } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireJudge(location);
  if (!session) redirect(`/judge/${slug}`);

  const code = decodeURIComponent(rawCode);
  const performance = byCode(code);
  if (!performance || performance.location !== location) notFound();

  // Chưa duyệt, hoặc không phải tiết mục của BGK này → 404, không phải 403.
  // Không xác nhận sự tồn tại của thứ BGK không có quyền thấy.
  if (performance.reviewStatus !== "approved") notFound();
  if (!isAssigned(session.userId, performance.id)) notFound();

  const score = findScore(session.userId, performance.id);

  return (
    /*
      `key` bắt buộc phải có.
      Hai tiết mục dùng CHUNG một route, nên khi BGK bấm "chấm tiết mục tiếp
      theo", React giữ nguyên component và chỉ đổi props — điểm của tiết mục
      trước còn nguyên trong state và autosave sẽ ghi nhầm sang tiết mục sau.
      Đổi key theo mã đăng ký buộc form mount lại sạch sẽ.
    */
    <ScoringForm
      key={performance.registrationCode}
      performance={performance}
      locationSlug={slug}
      initial={{
        values: fromColumns(score),
        highlight: score?.highlight_comment ?? "",
        improvement: score?.improvement_comment ?? "",
        privateNote: score?.private_note ?? "",
        status: score?.status ?? null,
      }}
    />
  );
}
