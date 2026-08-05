import Link from "next/link";
import { CampaignLogo, AnniversaryBadge, KVBackground } from "@/components/campaign";
import { Btn } from "@/components/ui";

/** Bảy trạng thái lỗi của luồng magic link — không bao giờ lộ stack trace. */
const ERRORS = {
  expired: {
    title: "Link đã hết hạn",
    body: "Đường link đăng nhập chỉ có hiệu lực trong 10 phút. Hãy nhập lại email để nhận link mới.",
  },
  used: {
    title: "Link đã được sử dụng",
    body: "Mỗi đường link chỉ dùng được một lần. Hãy nhập lại email để nhận link mới.",
  },
  not_judge: {
    title: "Tài khoản chưa được kích hoạt",
    body: "Email này chưa nằm trong danh sách Ban Giám khảo, hoặc tài khoản đã bị vô hiệu hóa. Liên hệ Ban Tổ chức để được hỗ trợ.",
  },
  wrong_location: {
    title: "Bạn không được phân công đầu cầu này",
    body: "Email của bạn được phân công ở đầu cầu khác. Hãy mở đúng đường link mà Ban Tổ chức đã gửi.",
  },
  session_expired: {
    title: "Phiên đăng nhập đã hết hạn",
    body: "Vì lý do bảo mật, phiên làm việc có thời hạn. Hãy đăng nhập lại để tiếp tục chấm điểm.",
  },
  mail_failed: {
    title: "Không gửi được email",
    body: "Hệ thống tạm thời không gửi được email đăng nhập. Thử lại sau ít phút hoặc báo Ban Tổ chức.",
  },
  offline: {
    title: "Mất kết nối mạng",
    body: "Không kết nối được tới hệ thống. Điểm đã chấm vẫn được lưu trên thiết bị và sẽ tự đồng bộ khi có mạng.",
  },
} as const;

type ErrorKey = keyof typeof ERRORS;

function pick(v: string | string[] | undefined): ErrorKey {
  const k = Array.isArray(v) ? v[0] : v;
  return k && k in ERRORS ? (k as ErrorKey) : "expired";
}

export default async function AuthError(props: PageProps<"/auth/error">) {
  const search = await props.searchParams;
  const key = pick(search.e);
  const { title, body } = ERRORS[key];

  return (
    <main className="grid-city relative min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <KVBackground
        variant="portrait"
        overlay="medium"
        fit="contain"
        priority
        sizes="(min-width: 1024px) 52vw, 100vw"
        className="aspect-square w-full lg:sticky lg:top-0 lg:aspect-auto lg:h-dvh"
      />

      <div className="flex items-center justify-center px-6 py-10 lg:px-12">
        <div className="glass-strong w-full max-w-md rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <CampaignLogo width={116} priority />
            <AnniversaryBadge width={48} />
          </div>

          <p className="text-danger mt-7 font-mono text-[0.64rem] tracking-[0.22em] uppercase">
            Không thể đăng nhập
          </p>
          <h1 className="display text-chalk mt-2 text-2xl sm:text-3xl">{title}</h1>
          <p className="text-silver mt-3 text-sm leading-relaxed">{body}</p>

          <div className="mt-6 flex flex-col gap-2">
            <Link href="/judge/sgn" className="contents">
              <Btn variant="brand" className="w-full">Nhập lại email · SGN</Btn>
            </Link>
            <Link href="/judge/han" className="contents">
              <Btn variant="ghost" className="w-full">Nhập lại email · HAN</Btn>
            </Link>
          </div>

          <p className="text-silver-dim mt-5 font-mono text-[0.62rem]">
            Mã lỗi: {key}
          </p>
        </div>
      </div>
    </main>
  );
}
