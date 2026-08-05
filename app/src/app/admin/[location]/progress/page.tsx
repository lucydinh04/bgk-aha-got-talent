import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { toLocation, EVENT_DATE } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { buildAdminSnapshot } from "@/lib/server/views";
import { ProgressBoard } from "./ProgressBoard";

export const dynamic = "force-dynamic";

export default async function ProgressPage(
  props: PageProps<"/admin/[location]/progress">,
) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireAdmin(location);
  if (!session) redirect(`/admin/login?next=/admin/${slug}/progress`);

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        location={location}
        title="Tiến độ chấm"
        subtitle={EVENT_DATE[location]}
        action={
          <span className="text-silver-dim font-mono text-xs">{session.fullName}</span>
        }
      />
      <ProgressBoard
        location={location}
        slug={slug}
        initial={buildAdminSnapshot(location)}
      />
    </main>
  );
}
