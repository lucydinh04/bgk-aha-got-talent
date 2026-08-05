import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Next 16 mặc định chỉ cho phép quality [75]. Màn LED 1920×1080 chiếu
     * trên máy chiếu cần chất lượng cao hơn nên mở thêm 90.
     * 75 vẫn là mặc định cho mọi ảnh khác (thumbnail, sidebar, header).
     */
    qualities: [75, 90],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
