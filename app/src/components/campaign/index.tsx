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
  width?: number;
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
        sizes={`${width}px`}
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
  width?: number;
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
        sizes={`${width}px`}
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
  light:
    "linear-gradient(to top, rgba(4,9,20,.78) 0%, rgba(4,9,20,.22) 45%, rgba(4,9,20,.08) 100%)",
  medium:
    "linear-gradient(to top, rgba(4,9,20,.9) 0%, rgba(6,13,30,.55) 50%, rgba(6,13,30,.35) 100%)",
  heavy:
    "linear-gradient(to top, rgba(4,9,20,.94) 0%, rgba(6,13,30,.74) 55%, rgba(6,13,30,.5) 100%)",
  /**
   * Dùng cho LED khi có chữ: dải tối dồn xuống đáy, phần trên để nguyên.
   * Không phủ đều — headline, logo và icon A in sẵn trong KV vẫn hiện rõ,
   * còn chữ của hệ thống nằm gọn trong dải tối dưới đáy.
   */
  stage:
    "linear-gradient(to top, rgba(4,9,20,.97) 0%, rgba(4,9,20,.94) 20%, rgba(4,9,20,.62) 34%, rgba(6,13,30,.12) 52%, transparent 68%)",
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
