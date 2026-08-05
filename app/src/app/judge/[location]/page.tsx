import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  CampaignLogo,
  AnniversaryBadge,
  KVBackground,
} from "@/components/campaign";
import { EVENT_DATE, toLocation } from "@/lib/data";
import { listApproved } from "@/lib/server/performances";
import { readSession } from "@/lib/server/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function JudgeLogin(props: PageProps<"/judge/[location]">) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  // Đã đăng nhập đúng đầu cầu thì đi thẳng vào việc, không bắt gõ lại email.
  const session = await readSession();
  if (session?.role === "judge" && session.location === location) {
    redirect(`/judge/${slug}/dashboard`);
  }

  const count = listApproved(location).length;

  return (
    <main className="grid-city relative min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/*
        KV vuông: icon A chiếm gần trọn khung. Cover sang cột dọc sẽ cắt mất chân
        icon A, nên dùng contain trong panel có padding — không crop, không méo.
      */}
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
              Ban Giám khảo
            </p>
            <h1 className="display text-chalk mt-2 text-3xl sm:text-4xl">
              Aha Got Talent 2026
            </h1>
            <p className="text-silver mt-3 text-sm">
              Nhập email công ty để truy cập hệ thống chấm điểm.
            </p>
          </div>

          <div className="border-navy-700/70 bg-navy-950/60 mt-6 flex items-center justify-between rounded-lg border border-dashed px-3 py-2.5">
            <span className="text-silver text-xs">
              Đầu cầu{" "}
              <strong className="text-brand font-semibold">{location}</strong> ·{" "}
              {EVENT_DATE[location]}
            </span>
            <span className="text-silver-dim tnum font-mono text-[0.66rem]">
              {count} tiết mục
            </span>
          </div>

          <LoginForm locationSlug={slug} />

          <p className="text-silver-dim mt-5 text-xs leading-relaxed">
            Chỉ email đã được Ban Tổ chức đưa vào danh sách BGK mới đăng nhập
            được. Phiên có hiệu lực 12 tiếng. Đầu cầu lấy từ đường link — BGK
            không tự đổi được.
          </p>

          <Link
            href={location === "SGN" ? "/judge/han" : "/judge/sgn"}
            className="text-cyan mt-4 inline-block font-mono text-[0.68rem] tracking-[0.1em] uppercase underline-offset-4 hover:underline"
          >
            Bạn chấm đầu cầu {location === "SGN" ? "HAN" : "SGN"}?
          </Link>
        </div>
      </div>
    </main>
  );
}
