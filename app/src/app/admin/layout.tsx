import Link from "next/link";
import { CampaignLogo, KVBackground } from "@/components/campaign";
import { EVENT_DATE, type LocationCode } from "@/lib/data";
import { requireAdmin } from "@/lib/server/session";
import { logout } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

const NAV = [
  {
    group: "Tổng quan",
    items: [{ href: "/admin/dashboard", label: "Dashboard" }],
  },
  {
    group: "SGN · 07/08",
    items: [
      { href: "/admin/sgn", label: "Dashboard SGN" },
      { href: "/admin/sgn/progress", label: "Tiến độ chấm" },
      { href: "/admin/sgn/results", label: "Bảng xếp hạng" },
      { href: "/admin/sgn/rundown", label: "Thứ tự biểu diễn" },
      { href: "/admin/sgn/voting", label: "Bình chọn khán giả" },
      { href: "/admin/sgn/live-control", label: "Live Control" },
    ],
  },
  {
    group: "HAN · 14/08",
    items: [
      { href: "/admin/han", label: "Dashboard HAN" },
      { href: "/admin/han/progress", label: "Tiến độ chấm" },
      { href: "/admin/han/results", label: "Bảng xếp hạng" },
      { href: "/admin/han/rundown", label: "Thứ tự biểu diễn" },
      { href: "/admin/han/live-control", label: "Live Control" },
    ],
  },
  {
    group: "Hệ thống",
    items: [
      { href: "/admin/judges", label: "Ban Giám khảo" },
      { href: "/admin/performances", label: "Tiết mục" },
      { href: "/admin/sync", label: "Đồng bộ Google Sheet" },
    ],
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  /*
   * Chưa đăng nhập thì không dựng khung điều hành: trang duy nhất vào được là
   * /admin/login, và nó có layout toàn màn hình riêng. Mọi trang admin khác tự
   * redirect về login, nên ở đây không cần kiểm tra đường dẫn.
   */
  if (!session) return <>{children}</>;

  // Admin gắn đầu cầu chỉ thấy nhóm menu của đầu cầu mình.
  const groups = NAV.filter((section) => {
    if (!session.location) return true;
    const other: LocationCode = session.location === "SGN" ? "HAN" : "SGN";
    return !section.group.startsWith(other);
  });

  return (
    <div className="bg-ink flex min-h-dvh">
      <aside className="bg-navy-950 sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-r-[color-mix(in_oklab,var(--color-navy-800)_100%,transparent)] lg:flex">
        <div className="px-5 py-5">
          <CampaignLogo width={118} priority />
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3">
          {groups.map((section) => (
            <div key={section.group}>
              <p className="text-silver-dim px-2 pb-1.5 font-mono text-[0.58rem] tracking-[0.16em] uppercase">
                {section.group}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-silver hover:text-chalk hover:bg-navy-900 block rounded-md px-2.5 py-2 text-sm transition"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Campaign card cuối sidebar — KV vuông, giữ trọn icon A */}
        <div className="p-3">
          <KVBackground
            variant="portrait"
            overlay="medium"
            fit="cover"
            sizes="224px"
            className="aspect-square w-full rounded-lg"
          >
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="text-cyan font-mono text-[0.55rem] tracking-[0.16em] uppercase">
                11 năm chuyển mình
              </p>
              <p className="display text-chalk mt-0.5 text-sm leading-tight">
                Chuyển mình bứt phá
              </p>
            </div>
          </KVBackground>
          <p className="text-silver-dim tnum mt-2.5 px-1 font-mono text-[0.58rem]">
            SGN {EVENT_DATE.SGN} · HAN {EVENT_DATE.HAN}
          </p>

          <div className="border-navy-800 mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-silver min-w-0 truncate text-[0.68rem]">
              {session.fullName}
            </span>
            <form action={logout}>
              <input type="hidden" name="redirectTo" value="/admin/login" />
              <button
                type="submit"
                className="text-silver-dim hover:text-silver shrink-0 font-mono text-[0.58rem] tracking-[0.1em] uppercase underline-offset-4 hover:underline"
              >
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
