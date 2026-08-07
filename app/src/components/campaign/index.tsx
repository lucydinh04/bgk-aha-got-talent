import type { ReactNode } from "react";
import { campaignAssets } from "@/config/assets";
import { CampaignImage } from "./CampaignImage";

export { CampaignImage };

/* ─────────────────────────────────────────────────────────────────────────────
   CampaignLogo — logo Ahamove chính thức.
   Wordmark trong SVG là màu trắng nên chỉ đặt trên nền tối.
   Giữ nguyên aspect ratio 520 : 89.78, không đổi màu, không tách icon.
   ───────────────────────────────────────────────────────────────────────────*/
export function CampaignLogo({
  width = 132,
  className = "",
  priority = false,
}: {
  /** Số = px. Chuỗi = bất kỳ đơn vị CSS nào — màn LED truyền `cqw` để logo co
   *  giãn theo canvas thay vì đứng yên ở một cỡ px cố định. */
  width?: number | string;
  className?: string;
  priority?: boolean;
}) {
  const { ratio } = campaignAssets.ahamoveLogo;
  return (
    <span
      className={`inline-block shrink-0 ${className}`}
      style={{ width, aspectRatio: ratio }}
    >
      <CampaignImage
        asset="ahamoveLogo"
        fit="contain"
        priority={priority}
        sizes={typeof width === "number" ? `${width}px` : "20vw"}
        className="h-full w-full"
      />
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AnniversaryBadge — biểu tượng 11 năm.
   Không đổi màu, không lật, không kéo dãn một chiều, không dùng thay icon A.
   ───────────────────────────────────────────────────────────────────────────*/
export function AnniversaryBadge({
  width = 72,
  className = "",
  priority = false,
}: {
  /** Số = px. Chuỗi = đơn vị CSS bất kỳ, dùng cho canvas LED. */
  width?: number | string;
  className?: string;
  priority?: boolean;
}) {
  const { ratio } = campaignAssets.anniversary11;
  return (
    <span
      className={`inline-block shrink-0 ${className}`}
      style={{ width, aspectRatio: ratio }}
    >
      <CampaignImage
        asset="anniversary11"
        fit="contain"
        priority={priority}
        sizes={typeof width === "number" ? `${width}px` : "12vw"}
        className="h-full w-full drop-shadow-[0_0_18px_rgba(255,127,50,0.35)]"
      />
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   KVBackground — nền KV cho khung dọc/vuông (mobile, sidebar, login).
   Mặc định `contain` vì icon A chiếm gần trọn khung vuông: cover sang khung hẹp
   hơn 1:1 sẽ cắt mất chân icon A.
   ───────────────────────────────────────────────────────────────────────────*/
export function KVBackground({
  variant = "portrait",
  overlay = "medium",
  anchor = "full",
  fit,
  priority = false,
  sizes = "100vw",
  children,
  className = "",
}: {
  variant?: "portrait" | "landscape" | "cover";
  overlay?: OverlayLevel;
  anchor?: "full" | "lightTrail" | "skyline" | "cityBand";
  fit?: "cover" | "contain";
  priority?: boolean;
  sizes?: string;
  children?: ReactNode;
  className?: string;
}) {
  const assetKey =
    variant === "portrait"
      ? "kvPortrait"
      : variant === "landscape"
        ? "kvLandscape"
        : "coverLandscape";

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <CampaignImage
        asset={assetKey}
        fill
        priority={priority}
        sizes={sizes}
        anchor={anchor}
        fit={fit ?? (variant === "portrait" ? "contain" : "cover")}
        quality={90}
      />
      <Overlay level={overlay} />
      {children ? <div className="relative z-10">{children}</div> : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   LEDBackground — nền 16:9 cho màn LED.
   Dùng KV ngang đúng tỉ lệ, không stretch. `quiet` neo xuống dải light trail để
   chừa chỗ cho nội dung mà không đè lên headline có sẵn trong artwork.
   ───────────────────────────────────────────────────────────────────────────*/
export function LEDBackground({
  mode = "full",
  overlay,
  children,
  className = "",
}: {
  /** full = giữ trọn artwork (standby) · quiet = thêm scrim giữa để đặt chữ */
  mode?: "full" | "quiet";
  overlay?: OverlayLevel;
  children?: ReactNode;
  className?: string;
}) {
  const level: OverlayLevel = overlay ?? (mode === "full" ? "light" : "stage");
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {/*
        KV ngang là 1920×1072 ≈ 16:9, cover vào khung 16:9 nên gần như không cắt —
        object-position không có tác dụng ở đây. Vì vậy state nhiều chữ dùng scrim
        `stage` chứ không phải crop.
      */}
      <CampaignImage
        asset="kvLandscape"
        fill
        priority
        quality={90}
        sizes="100vw"
        anchor="full"
        fit="cover"
      />
      <Overlay level={level} />
      {children ? (
        <div className="relative z-10 flex h-full w-full flex-col">{children}</div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CampaignHero — dải banner ngang, mặc định crop dải light trail nên đặt được
   text mà không lặp headline đã có trong artwork.
   ───────────────────────────────────────────────────────────────────────────*/
export function CampaignHero({
  children,
  anchor = "lightTrail",
  overlay = "heavy",
  className = "",
  sizes = "100vw",
  priority = false,
  variant = "cover",
}: {
  children?: ReactNode;
  anchor?: "full" | "lightTrail" | "skyline" | "cityBand";
  overlay?: OverlayLevel;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /**
   * "cover" cho dải cao (hero Admin). "square" cho dải rất hẹp: ảnh 2.27:1
   * gần bằng tỉ lệ dải nên crop dọc gần như không có tác dụng, vẫn lọt headline.
   * KV vuông có dư chiều cao để neo hẳn xuống dải light trail thành phố.
   */
  variant?: "cover" | "square";
}) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <CampaignImage
        asset={variant === "square" ? "kvPortrait" : "coverLandscape"}
        fill
        priority={priority}
        sizes={sizes}
        anchor={anchor}
        fit="cover"
      />
      <Overlay level={overlay} />
      {children ? <div className="relative z-10 h-full">{children}</div> : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Overlay — luôn là gradient navy, không bao giờ là lớp đen 80–90% làm chết KV.
   Mục tiêu: text đọc được, QR quét được, mà vẫn giữ cam và xanh của artwork.
   ───────────────────────────────────────────────────────────────────────────*/
export type OverlayLevel =
  | "none"
  | "light"
  | "medium"
  | "heavy"
  | "stage"
  | "veil";

/**
 * Overlay luôn là navy, không bao giờ là lớp đen 80–90% phủ đều làm chết KV.
 *
 * `stage` là loại dùng cho LED khi có nhiều chữ: một scrim hình ellipse khu trú
 * ở giữa để chữ đọc được, còn bốn mép vẫn giữ nguyên light trail cam và cyan
 * của artwork. Phủ đều sẽ mất toàn bộ màu campaign.
 */
const OVERLAYS: Record<OverlayLevel, string> = {
  none: "",
  /**
   * Mức nhẹ cho màn LED khi ít chữ (standby).
   *
   * Ellipse tâm chứ không phải dải đáy. Canvas LED là 2.765:1 và nội dung canh
   * giữa theo chiều dọc, nên vùng cần tối là lõi giữa — không phải đáy. Bốn mép
   * giữ nguyên light trail cam và cyan của artwork.
   */
  light:
    "radial-gradient(ellipse 84% 94% at 50% 46%, transparent 0%, rgba(4,9,20,.10) 64%, rgba(4,9,20,.38) 100%)",
  medium:
    "linear-gradient(to top, rgba(4,9,20,.9) 0%, rgba(6,13,30,.55) 50%, rgba(6,13,30,.35) 100%)",
  heavy:
    "linear-gradient(to top, rgba(4,9,20,.94) 0%, rgba(6,13,30,.74) 55%, rgba(6,13,30,.5) 100%)",
  /**
   * Mức chính cho màn LED khi có chữ vận hành.
   *
   * ELLIPSE TÂM, KHÔNG PHẢI DẢI ĐÁY
   *
   * Bản 16:9 dùng `linear-gradient(to top, …)` vì nội dung neo xuống đáy khung.
   * Canvas 3008×1088 đổi hẳn cách đặt: chiều cao khả dụng sau safe zone chỉ còn
   * 944px, không có "dải đáy" nào để neo vào — nội dung canh giữa theo trục dọc
   * và dàn ngang trong lõi 70%.
   *
   * Nên scrim cũng phải là ellipse tâm, rộng theo trục ngang để phủ đúng lõi 70%
   * nơi có chữ, và tan dần về hai dải mép 15% để artwork còn sống ở đó. Đây chính
   * là chỗ hai dải mép trả công: chúng giữ được màu campaign trong khi lõi giữa
   * tối đủ để chữ đọc được từ cuối hội trường.
   *
   * Đánh đổi: headline "CHUYỂN MÌNH BỨT PHÁ" in sẵn trong artwork bị làm mờ ở
   * vùng giữa. Có ý thức — chữ vận hành phải thắng.
   */
  stage:
    "radial-gradient(ellipse 82% 92% at 50% 46%, transparent 0%, rgba(4,9,20,.16) 60%, rgba(4,9,20,.46) 100%)",
  /* rất mờ — dùng khi KV chỉ là texture nền phía sau dữ liệu dày */
  veil: "linear-gradient(to top, rgba(4,9,20,.97) 0%, rgba(4,9,20,.93) 100%)",
};

export function Overlay({ level = "medium" }: { level?: OverlayLevel }) {
  if (level === "none") return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
      style={{ background: OVERLAYS[level] }}
    />
  );
}
