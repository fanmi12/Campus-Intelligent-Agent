import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 独立的本地 UI 预览可使用单独的缓存，避免与其他开发服务互相占用。
  distDir: process.env.CAMPUS_PREVIEW_DIST_DIR ?? ".next",
  // 打包成独立目录，方便用 Docker 部署到服务器
  output: "standalone",
  poweredByHeader: false,
  // 开发时左下角的调试按钮会挡住输入框，关掉（报错提示不受影响）
  devIndicators: false,
};

export default nextConfig;
