import Link from "next/link";
import {
  CampaignLogo,
  AnniversaryBadge,
  CampaignHero,
} from "@/components/campaign";
import { EVENT_DATE } from "@/lib/data";

const GATES = [
  {
    href: "/judge/sgn",
    label: "Ban Giám khảo",
    auth: "Magic link · 10 phút · một lần",
    accent: "border-brand/50",
    tone: "text-brand",
    lines: "/judge/sgn · /judge/han",
  },
  {
    href: "/admin/dashboard",
    label: "Ban Tổ chức",
    auth: "Password + MFA · session 12 giờ",
    accent: "border-cyan/50",
    tone: "text-cyan",
    lines: "/admin/dashboard · /admin/sgn",
  },
  {
    href: "/live/sgn",
    label: "Màn hình LED",
    auth: "Public · read-only · không đăng nhập",
    accent: "border-locked/50",
    tone: "text-locked",
    lines: "/live/sgn · /live/han",
  },
];

export default function Home() {
  return (
    <main className="grid-city min-h-dvh">
      <CampaignHero
        anchor="lightTrail"
        overlay="light"
        priority
        sizes="100vw"
        className="h-[46vh] min-h-[300px] w-full"
      >
        {/* KV đã in sẵn logo Ahamove và badge 11 năm — không lặp lại ở đây */}
        <div className="flex h-full flex-col justify-end p-6 sm:p-10">
          <p className="text-cyan font-mono text-[0.68rem] tracking-[0.28em] uppercase">
            Hệ thống chấm điểm nội bộ
          </p>
          <h1 className="display text-chalk mt-2 text-4xl sm:text-6xl">
            Aha Got Talent 2026
          </h1>
        </div>
      </CampaignHero>

      <section className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <CampaignLogo width={124} />
            <span className="bg-navy-700 h-8 w-px" aria-hidden />
            <AnniversaryBadge width={44} />
          </div>
          <p className="text-silver tnum font-mono text-xs tracking-[0.14em] uppercase">
            SGN {EVENT_DATE.SGN} · HAN {EVENT_DATE.HAN}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {GATES.map((gate) => (
            <Link
              key={gate.href}
              href={gate.href}
              className={`glass hover:edge-electric flex flex-col gap-3 rounded-xl border-t-2 p-5 transition ${gate.accent}`}
            >
              <span
                className={`font-mono text-[0.6rem] tracking-[0.16em] uppercase ${gate.tone}`}
              >
                {gate.auth}
              </span>
              <span className="display text-chalk text-xl">{gate.label}</span>
              <span className="text-silver-dim mt-auto font-mono text-[0.66rem]">
                {gate.lines}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
