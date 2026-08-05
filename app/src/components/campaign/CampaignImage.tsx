"use client";

import Image from "next/image";
import { useState } from "react";
import {
  campaignAssets,
  cropAnchor,
  FALLBACK_GRADIENT,
  type CampaignAssetKey,
} from "@/config/assets";

type Anchor = keyof typeof cropAnchor;

interface CampaignImageProps {
  /** khóa trong campaignAssets — không nhận đường dẫn thô */
  asset: CampaignAssetKey;
  /** lấp đầy phần tử cha (cha phải position: relative) */
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** neo crop; mặc định giữ trọn artwork */
  anchor?: Anchor;
  /** contain khi tuyệt đối không được cắt (ví dụ icon A) */
  fit?: "cover" | "contain";
  quality?: 75 | 90;
  alt?: string;
}

/**
 * Bọc next/image cho asset campaign.
 *
 * Vì sao tồn tại:
 * - chặn hard-code path rải rác
 * - buộc mọi ảnh có sizes + object-fit đúng, không bao giờ bị stretch
 * - fallback gradient navy khi ảnh lỗi, không làm crash app
 *
 * KHÔNG bao giờ thêm transform đảo hướng ở đây. Icon A phải giữ đúng chiều.
 */
export function CampaignImage({
  asset,
  fill = false,
  priority = false,
  sizes,
  className = "",
  anchor = "full",
  fit = "cover",
  quality,
  alt,
}: CampaignImageProps) {
  const [failed, setFailed] = useState(false);
  const meta = campaignAssets[asset];

  if (failed) {
    return (
      <div
        aria-hidden
        className={className}
        style={{
          background: FALLBACK_GRADIENT,
          position: fill ? "absolute" : "relative",
          inset: fill ? 0 : undefined,
          width: fill ? undefined : "100%",
          aspectRatio: fill ? undefined : meta.ratio,
        }}
      />
    );
  }

  const onError = () => {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[campaign-asset] Không tải được "${asset}" (${meta.src}). ` +
          `Đang dùng gradient navy thay thế.`,
      );
    }
    setFailed(true);
  };

  const objectClass = fit === "cover" ? "object-cover" : "object-contain";

  if (fill) {
    return (
      <Image
        src={meta.src}
        alt={alt ?? meta.alt}
        fill
        priority={priority}
        quality={quality}
        sizes={sizes ?? "100vw"}
        onError={onError}
        className={`${objectClass} ${className}`}
        style={{ objectPosition: cropAnchor[anchor] }}
      />
    );
  }

  return (
    <Image
      src={meta.src}
      alt={alt ?? meta.alt}
      width={meta.width}
      height={meta.height}
      priority={priority}
      quality={quality}
      sizes={sizes}
      onError={onError}
      className={className}
      style={{ objectPosition: cropAnchor[anchor] }}
    />
  );
}
