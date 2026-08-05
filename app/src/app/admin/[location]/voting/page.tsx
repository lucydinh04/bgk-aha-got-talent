import { notFound, redirect } from "next/navigation";
import { CampaignImage } from "@/components/campaign";
import { Panel, Stat, ProgressBar, PageHeader, DataTable, Row, Cell, Btn, Banner } from "@/components/ui";
import { requireAdmin } from "@/lib/server/session";
import { toLocation, AWARDS, performancesAt, EVENT_DATE } from "@/lib/data";
import { VOTING } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function VotingControl(
  props: PageProps<"/admin/[location]/voting">,
) {
  const { location: slug } = await props.params;
  const location = toLocation(slug);
  if (!location) notFound();

  const session = await requireAdmin(location);
  if (!session) redirect(`/admin/login?next=/admin/${slug}/voting`);

  const crowdMagnet = AWARDS[location].find((a) => a.code === "crowd_magnet");
  const rows = performancesAt(location);
  const accent = location === "SGN" ? "text-brand" : "text-cyan";

  // HAN chưa bật Crowd Magnet — không tự thêm giải ngoài cơ cấu BTC đã duyệt
  if (!crowdMagnet?.enabled) {
    return (
      <main className="grid-city flex min-h-dvh items-center justify-center px-6">
        <div className="glass max-w-md rounded-xl p-6 text-center">
          <span className={`display text-2xl ${accent}`}>{location}</span>
          <h1 className="display text-chalk mt-2 text-xl">
            Chưa bật giải khán giả
          </h1>
          <p className="text-silver mt-2 text-sm">
            Cơ cấu giải {location} hiện không có The Crowd Magnet. Super Admin
            cần bật giải này trong cấu hình trước ngày diễn thì module bình chọn
            mới hoạt động.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid-city min-h-dvh px-4 py-5 sm:px-6">
      <PageHeader
        location={location}
        title="Voting Control"
        subtitle={`${crowdMagnet.nameEn} · ${EVENT_DATE[location]}`}
        action={
          <span className="text-ok font-mono text-xs">
            ● Phiên đang mở · còn 02:14
          </span>
        }
      />

      {/* Phase 3 chưa nối luồng bình chọn khán giả. Nói thẳng ra để không ai đọc nhầm là số thật. */}
      <Banner tone="warn" label="Dữ liệu minh hoạ">
        Trang này chưa nối vào database. Số liệu bên dưới là dữ liệu mẫu của bản
        thiết kế, KHÔNG phải kết quả thật — luồng bình chọn khán giả sẽ được nối ở phase sau.
      </Banner>


      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Theo dõi trực tiếp">
            <div className="border-navy-800 bg-navy-950/60 rounded-lg border p-5 text-center">
              <p className="text-silver-dim font-mono text-[0.62rem] tracking-[0.14em] uppercase">
                Countdown · server time
              </p>
              <p className="display text-brand tnum mt-1 text-5xl">02:14</p>
              <div className="mt-4">
                <ProgressBar value={26} tone="from-brand to-brand-soft" label="Thời gian còn lại" />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Khán giả tham gia" value={186} tone="text-cyan" />
              <Stat label="Tổng phiếu đã dùng" value={341} />
              <Stat label="Đang mở trang" value={42} />
              <Stat label="Lỗi gửi ballot" value={0} tone="text-ok" />
            </div>

            <p className="border-navy-700 text-silver-dim mt-3 rounded-lg border border-dashed p-3 text-xs leading-relaxed">
              Màn hình này <strong className="text-silver">không</strong> hiển thị
              bảng xếp hạng vote. Người vận hành hay chiếu màn Admin lên máy chiếu
              phụ — một bảng vote realtime nằm sẵn ở đây là rủi ro lộ kết quả do
              thao tác. Kết quả chi tiết nằm ở tab{" "}
              <strong className="text-silver">Kết quả nội bộ</strong>.
            </p>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Cấu hình phiên">
            <ul className="flex flex-col gap-1.5">
              {[
                `${rows.length} tiết mục đủ điều kiện`,
                "Thời lượng 3 phút · khóa sau khi mở",
                "Xác thực: mã tham dự (phương án A)",
                "Tối đa 2 phiếu · 2 tiết mục khác nhau",
              ].map((line) => (
                <li
                  key={line}
                  className="text-silver flex items-baseline gap-2 font-mono text-[0.68rem]"
                >
                  <span className="text-ok">✓</span>
                  {line}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="QR bình chọn">
            <div className="flex items-center gap-4">
              {/* QR trên nền trắng đặc — KV không bao giờ lọt vào vùng quét */}
              <div className="relative grid size-28 shrink-0 place-items-center rounded-lg bg-white p-2">
                <div
                  aria-hidden
                  className="absolute inset-3"
                  style={{
                    background:
                      "conic-gradient(from 0deg, #0A1524 0 25%, transparent 0 50%, #0A1524 0 75%, transparent 0)",
                    backgroundSize: "12px 12px",
                    opacity: 0.9,
                  }}
                />
              </div>
              <div>
                <p className="text-cyan font-mono text-sm">aha.vn/vote/{slug}</p>
                <p className="text-silver-dim mt-1 text-xs">
                  QR gắn session token — QR của phiên cũ không dùng lại được.
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Điều khiển">
            <div className="grid grid-cols-2 gap-2">
              {["Tạm dừng", "Đóng sớm", "Gia hạn 60 giây", "Xác minh kết quả"].map(
                (label) => (
                  <button
                    key={label}
                    className="border-navy-600 text-silver hover:text-chalk min-h-[44px] rounded-lg border text-sm transition"
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <p className="text-silver-dim mt-2.5 text-[0.68rem]">
              Gia hạn cần xác nhận, ghi audit log và cập nhật countdown cho mọi
              thiết bị — không có countdown nào chạy độc lập.
            </p>
            <button className="border-danger text-danger hover:bg-danger/10 display mt-3 min-h-[48px] w-full rounded-lg border-2 transition">
              Emergency Close
            </button>
          </Panel>

          <Panel title="Kết quả nội bộ — chỉ Admin">
            <Banner tone="danger" label="Không chiếu màn này lên máy chiếu phụ">
              Đây là bảng vote chi tiết. Nó cố ý nằm tách khỏi màn theo dõi chính.
            </Banner>
            <div className="mt-3">
              <DataTable head={["Tiết mục", "Phiếu", "Tỷ lệ ballot"]} minWidth={360}>
                {VOTING.perPerformance.map((v, i) => (
                  <Row key={v.code}>
                    <Cell tone={i === 0 ? "text-chalk" : "text-silver"}>
                      {i === 0 ? "★ " : ""}
                      {v.name}
                    </Cell>
                    <Cell mono tone={i === 0 ? "text-brand" : "text-silver"}>
                      {v.votes}
                    </Cell>
                    <Cell mono>
                      {((v.votes / VOTING.participants) * 100).toFixed(2)}%
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Stat label="Ballot hợp lệ" value={VOTING.validBallots} tone="text-ok" />
              <Stat label="Ballot bị loại" value={VOTING.rejectedBallots} tone="text-danger" />
              <Stat label="Dùng 1 phiếu" value={VOTING.usedOne} />
              <Stat label="Dùng đủ 2 phiếu" value={VOTING.usedTwo} />
            </div>
            <ul className="text-silver-dim mt-3 flex flex-col gap-1 font-mono text-[0.66rem]">
              {VOTING.rejections.map((r) => (
                <li key={r.reason}>
                  · {r.reason} — {r.count}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn variant="ghost">Xác minh lại</Btn>
              <Btn variant="brand">Tạo Voting Result Snapshot</Btn>
            </div>
          </Panel>

          <div className="relative overflow-hidden rounded-xl">
            {/* KV rất mờ làm texture nền dưới card — không che QR, không che dữ liệu */}
            <CampaignImage
              asset="kvLandscape"
              fill
              sizes="400px"
              anchor="lightTrail"
              className="opacity-25"
            />
            <div className="bg-navy-950/80 relative p-4">
              <p className="text-cyan font-mono text-[0.6rem] tracking-[0.18em] uppercase">
                {crowdMagnet.nameEn}
              </p>
              <p className="display text-chalk mt-1 text-lg">
                {crowdMagnet.nameVi}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
