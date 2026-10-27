import type { MetadataRoute } from "next";
import { site } from "@/lib/config";

// 让同学可以"添加到主屏幕"，像 App 一样打开
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} · ${site.school}校园智能助手`,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f5",
    theme_color: "#fbf8f5",
    icons: [
      { src: "/brand/chengyuan-xiaoshi-chibi-v3-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
