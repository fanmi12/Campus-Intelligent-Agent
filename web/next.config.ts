import type { NextConfig } from "next";

// 安全响应头：只走 HTTPS（HSTS，两年）；禁止其他网站用 iframe 嵌入本站；跨站请求只带来源域名
// （高德 Key 的域名白名单靠它校验，不能设成 no-referrer）；禁止浏览器猜测文件类型
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  // 独立的本地 UI 预览可使用单独的缓存，避免与其他开发服务互相占用。
  distDir: process.env.CAMPUS_PREVIEW_DIST_DIR ?? ".next",
  // 打包成独立目录，方便用 Docker 部署到服务器
  output: "standalone",
  poweredByHeader: false,
  // 开发时左下角的调试按钮会挡住输入框，关掉（报错提示不受影响）
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
