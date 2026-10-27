import Image from "next/image";
import { site } from "@/lib/config";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-7",
  md: "size-9",
  lg: "size-16",
} as const;

// 全站共用 Q 版助手头像；glowing 时外圈有旋转光环。
export function BrandAvatar({
  size = "md",
  glowing = false,
  className,
}: {
  size?: keyof typeof SIZES;
  glowing?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("relative shrink-0", className)}>
      {glowing && <span className="avatar-glow" />}
      <div
        className={cn(
          "relative select-none rounded-full bg-[#fff8ee] shadow-sm ring-1 ring-black/5",
          SIZES[size],
          glowing && "ring-2 ring-background",
        )}
      >
        <Image
          src={site.avatarSrc}
          alt=""
          width={256}
          height={256}
          unoptimized
          loading="eager"
          className="size-full rounded-full object-cover"
        />
        {size === "lg" && (
          <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-gold ring-[3px] ring-background" />
        )}
      </div>
    </div>
  );
}
