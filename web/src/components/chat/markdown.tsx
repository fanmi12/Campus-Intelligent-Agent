"use client";

import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// 把回答里的 [1] [2] 变成可点击的出处角标
const CITATION = /\[(\d{1,2})\](?!\()/g;

export const CitationBadge = ({ n, onClick }: { n: number; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`查看出处 ${n}`}
    className="mx-0.5 inline-grid size-[1.15rem] -translate-y-px place-items-center rounded-full bg-primary/10 align-middle text-[10.5px] font-semibold text-primary tabular-nums transition hover:bg-primary hover:text-primary-foreground"
  >
    {n}
  </button>
);

type Props = {
  text: string;
  citations?: number[];
  onCite?: (n: number) => void;
  className?: string;
};

function MarkdownImpl({ text, citations, onCite, className }: Props) {
  const prepared = useMemo(() => {
    if (!citations?.length) return text;
    return text.replace(CITATION, (match, n: string) =>
      citations.includes(Number(n)) ? `[${n}](#cite-${n})` : match,
    );
  }, [text, citations]);

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        if (href?.startsWith("#cite-")) {
          const n = Number(href.slice(6));
          return <CitationBadge n={n} onClick={() => onCite?.(n)} />;
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
            {children}
          </a>
        );
      },
      p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-primary/60">{children}</ul>,
      ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
      li: ({ children }) => <li className="pl-0.5">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      h1: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>,
      h2: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>,
      h3: ({ children }) => <h4 className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</h4>,
      h4: ({ children }) => <h4 className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</h4>,
      blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-2 border-primary/30 pl-3 text-[13.5px] text-muted-foreground">{children}</blockquote>
      ),
      code: ({ children }) => (
        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
      ),
      pre: ({ children }) => (
        <pre className="my-3 overflow-x-auto rounded-xl bg-muted p-3 text-[13px] [&_code]:bg-transparent [&_code]:p-0">{children}</pre>
      ),
      table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-[13.5px]">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="border-b bg-muted/60 px-3 py-2 font-medium">{children}</th>,
      td: ({ children }) => <td className="border-b px-3 py-2 align-top last:border-0">{children}</td>,
      hr: () => <hr className="my-4 border-border" />,
    }),
    [onCite],
  );

  return (
    <div className={cn("text-[15px] leading-7 break-words text-foreground/90", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
