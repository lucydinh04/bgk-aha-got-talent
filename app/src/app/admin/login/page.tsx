import { redirect } from "next/navigation";

import { CampaignLogo, AnniversaryBadge, KVBackground } from "@/components/campaign";
import { EVENT_DATE } from "@/lib/data";
import { readSession } from "@/lib/server/session";
import { AdminLoginForm } from "./AdminLoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const session = await readSession();
  if (session && (session.role === "admin" || session.role === "super_admin")) {
    redirect(`/admin/${(session.location ?? "SGN").toLowerCase()}`);
  }

  return (
    <main className="grid-city relative min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <KVBackground
        variant="portrait"
        overlay="medium"
        fit="contain"
        priority
        sizes="(min-width: 1024px) 52vw, 100vw"
        className="aspect-square w-full lg:sticky lg:top-0 lg:aspect-auto lg:h-dvh"
      >
        <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10">
          <p className="text-cyan font-mono text-[0.66rem] tracking-[0.26em] uppercase">
            Sinh nhật Ahamove 11 tuổi
          </p>
          <p className="display text-chalk mt-2 text-2xl lg:text-4xl">
            Unlock Your Next Move
          </p>
        </div>
      </KVBackground>

      <div className="flex items-center justify-center px-6 py-10 lg:px-12">
        <div className="glass-strong w-full max-w-md rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <CampaignLogo width={116} priority />
            <AnniversaryBadge width={52} priority />
          </div>

          <div className="mt-7">
            <p className="text-cyan font-mono text-[0.66rem] tracking-[0.24em] uppercase">
              Ban Tổ chức
            </p>
            <h1 className="display text-chalk mt-2 text-3xl sm:text-4xl">
              Bảng điều khiển
            </h1>
            <p className="text-silver mt-3 text-sm">
              Nhập email Ban Tổ chức để vào hệ thống điều hành.
            </p>
          </div>

          <div className="border-navy-700/70 bg-navy-950/60 mt-6 flex items-center justify-between rounded-lg border border-dashed px-3 py-2.5">
            <span className="text-silver text-xs">
              SGN {EVENT_DATE.SGN} · HAN {EVENT_DATE.HAN}
            </span>
          </div>

          <AdminLoginForm />

          <p className="text-silver-dim mt-5 text-xs leading-relaxed">
            Quyền Admin có thể gắn với một đầu cầu hoặc cả hai. Admin chỉ được
            phân công SGN sẽ không mở được Live Control của HAN và ngược lại.
          </p>
        </div>
      </div>
    </main>
  );
}
