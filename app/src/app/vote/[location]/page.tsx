import { notFound } from "next/navigation";

import { toLocation } from "@/lib/data";
import { listApproved } from "@/lib/server/performances";
import { readVoteStateAction } from "@/app/actions/voting";
import { VoteForm } from "./VoteForm";

/**
 * Trang bình chọn công khai. Không đăng nhập — khán giả quét QR là vào.
 *
 * `force-dynamic` vì trạng thái phiên đổi trong lúc chương trình chạy: một
 * trang tĩnh cache lại sẽ báo "chưa mở" cho người quét sau khi MC đã hô mở.
 */
export const dynamic = "force-dynamic";

export default async function VotePage(props: PageProps<"/vote/[location]">) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  return (
    <VoteForm
      location={location}
      performances={listApproved(location)}
      initial={await readVoteStateAction(slug)}
    />
  );
}
