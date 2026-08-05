import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { toLocation, EVENT_DATE } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { buildAdminSnapshot, buildLedSnapshot } from "@/lib/server/views";
import { LiveControlPanel } from "./LiveControlPanel";

export const dynamic = "force-dynamic";

export default async function LiveControl(
  props: PageProps<"/admin/[location]/live-control">,
) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireAdmin(location);
  if (!session) redirect(`/admin/login?next=/admin/${slug}/live-control`);

  return (
    <main className="grid-city min-h-dvh px-4 py-5 pb-12 sm:px-6">
      <PageHeader
        location={location}
        title="Live Control"
        subtitle={EVENT_DATE[location]}
        action={
          <span className="text-silver-dim font-mono text-xs">
            {session.fullName}
          </span>
        }
      />

      <LiveControlPanel
        location={location}
        slug={slug}
        initialLed={buildLedSnapshot(location)}
        initialAdmin={buildAdminSnapshot(location)}
      />
    </main>
  );
}
