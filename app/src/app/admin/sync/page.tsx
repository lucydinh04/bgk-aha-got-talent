import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/server/session";
import { syncHistory } from "@/lib/server/sync";
import { SyncPanel } from "./SyncPanel";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login?next=/admin/sync");

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        title="Đồng bộ dữ liệu đăng ký"
        subtitle="Aha Talent 2026 — Registration Tracking"
        action={
          <span className="text-silver-dim font-mono text-xs">
            Google Sheet chỉ được đọc từ server
          </span>
        }
      />
      <SyncPanel history={syncHistory()} />
    </main>
  );
}
