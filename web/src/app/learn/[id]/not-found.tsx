import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function LessonNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-lg font-semibold">这节课不存在，或者已经被删除了</h1>
        <p className="text-sm text-muted-foreground">请确认链接是否完整，或者自己备一节新的。</p>
        <Link href="/learn" className={buttonVariants({ size: "lg" })}>
          回到小狮课堂
        </Link>
      </div>
    </main>
  );
}
