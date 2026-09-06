import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MatchItem } from "../../../types";

/**
 * D2 素雅重设计 — editorial calm / VARIANCE 5
 * - 卡片纸色白底 #fff / 细边 #e8e6e1 / 20px 圆角 / 淡阴影
 * - hover 抬升 0.5px + 边线加深 180ms ease，无弹跳
 * - 顶部：公司 15px 600 + 薪资 13px muted + fit 手写10px线边胶囊
 * - reasons/gaps 11px 细pill，cite 11px muted 斜体
 * - 操作行文本按钮下划线 hover，无实心色块
 */

export function MatchCard({ item, rank }: { item: MatchItem; rank: number }) {
  const nav = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(text);
      window.setTimeout(() => setCopied(null), 1500);
    }
  };

  const goQuiz = () => {
    try {
      localStorage.setItem("jobUrl", item.url);
    } catch {
      /* ignore */
    }
    nav(`/quiz?jobUrl=${encodeURIComponent(item.url)}`);
  };

  return (
    <div
      className="group relative bg-white rounded-[20px] border flex flex-col gap-4 p-5 lg:p-6"
      style={{
        borderColor: "var(--line, #e8e6e1)",
        boxShadow: "0 1px 12px rgba(0,0,0,0.04)",
        transition:
          "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform =
          "translateY(-0.5px)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#ddd9d2";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 4px 20px rgba(0,0,0,0.05)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "var(--line, #e8e6e1)";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 1px 12px rgba(0,0,0,0.04)";
      }}
    >
      {/* rank + title block */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0 flex-1">
          {/* rank — paper pill, fine serif */}
          <span
            className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[11px] font-medium tabular-nums border bg-[var(--paper-warm)]"
            style={{
              borderColor: "var(--line)",
              color: "var(--muted)",
              fontFamily: "var(--font-mono, monospace)",
            }}
            aria-label={`排名 ${rank}`}
          >
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="text-[16px] font-[500] leading-[1.35] tracking-[-0.01em] line-clamp-2"
              style={{ color: "var(--ink)" }}
              title={item.title}
            >
              {item.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className="text-[15px] font-[600] leading-none tracking-[-0.01em] truncate max-w-[16ch] sm:max-w-none"
                style={{ color: "var(--ink)" }}
                title={item.company}
              >
                {item.company}
              </span>
              <span className="hidden sm:inline w-px h-3 bg-[var(--line)] shrink-0" />
              <span
                className="text-[13px] leading-none tabular-nums"
                style={{ color: "var(--muted)" }}
              >
                {item.salary}
              </span>
              {item.fit != null && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] leading-none tracking-[0.06em] font-medium tabular-nums bg-white"
                  style={{
                    borderColor: "var(--line)",
                    color: "var(--muted)",
                    fontFamily: "Geist Mono, ui-monospace, monospace",
                  }}
                  title="fit 分数越高越匹配"
                >
                  FIT {Math.round(item.fit)}
                </span>
              )}
            </div>
            {item.active && (
              <div className="mt-2">
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] leading-none px-2 py-1 rounded-full border bg-white"
                  style={{
                    borderColor: "var(--line)",
                    color: "var(--muted)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: "#a8a29e" }}
                  />
                  {item.active}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* reasons — stone pill fine */}
      {item.reasons?.length > 0 && (
        <div>
          <div className="text-[11px] tracking-[0.08em] font-medium mb-2 flex items-center gap-2">
            <span style={{ color: "var(--muted)" }} className="uppercase">
              匹配理由
            </span>
            <span className="h-px flex-1 bg-[var(--line)] opacity-60" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.reasons.map((r, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] leading-none bg-white"
                style={{
                  borderColor: "var(--line)",
                  color: "#57534e",
                  background: "#f8f7f5",
                  letterSpacing: "0.01em",
                }}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* gaps — warm paper dashed */}
      {item.gaps?.length > 0 && (
        <div>
          <div className="text-[11px] tracking-[0.08em] font-medium mb-2 flex items-center gap-2">
            <span style={{ color: "var(--muted)" }} className="uppercase">
              缺口 · 补强
            </span>
            <span className="text-[11px] font-normal tracking-normal normal-case opacity-60">
              点击复制
            </span>
            <span className="h-px flex-1 bg-[var(--line)] opacity-40 hidden sm:block" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.gaps.map((g, i) => {
              const isCopied = copied === g;
              return (
                <button
                  key={i}
                  onClick={() => void handleCopy(g)}
                  title="点击复制缺口文本"
                  type="button"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] leading-none transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1"
                  style={{
                    borderStyle: isCopied ? "solid" : "dashed",
                    borderColor: isCopied ? "var(--accent)" : "var(--line)",
                    background: isCopied ? "var(--accent-soft)" : "#fdfcfa",
                    color: isCopied ? "var(--accent)" : "#8a7a65",
                  }}
                >
                  <span>{g}</span>
                  {isCopied && (
                    <span className="text-[10px] tracking-wide opacity-80">
                      已复制
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* 极淡 toast — inline */}
          {copied && (
            <div className="mt-2 text-[11px] leading-none px-2.5 py-1.5 rounded-full border bg-white inline-flex items-center gap-1.5 animate-[fadeIn_180ms_ease]">
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: "var(--accent)" }}
              />
              <span style={{ color: "var(--muted)" }}>已复制到剪贴板</span>
              <span className="opacity-60 truncate max-w-[18ch]">{copied}</span>
            </div>
          )}
        </div>
      )}

      {/* cite — muted italic 11px */}
      {item.cite && (
        <div className="rounded-xl px-3.5 py-3 border bg-[var(--paper-warm)]/60">
          <div
            className="text-[11px] tracking-[0.07em] font-medium mb-1 uppercase"
            style={{ color: "var(--muted)" }}
          >
            引用 · 回跳原文
          </div>
          <div
            className="text-[11px] leading-[1.7] italic line-clamp-3"
            style={{ color: "#78716c" }}
            title={item.cite}
          >
            “{item.cite}”
          </div>
        </div>
      )}

      {/* actions — textual underline hover，无实心块 */}
      <div className="flex items-center gap-4 pt-1 border-t border-dashed border-[var(--line)]/70 mt-1">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[13px] leading-none tracking-[-0.01em] underline underline-offset-[3px] decoration-[var(--line)] hover:decoration-[var(--ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-sm px-0.5 py-1 -ml-0.5"
          style={{ color: "var(--ink)" }}
        >
          查看原链接
          <span
            aria-hidden
            className="text-[11px] transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--muted)" }}
          >
            ↗
          </span>
        </a>
        <span className="w-px h-3 bg-[var(--line)]" aria-hidden />
        <button
          onClick={goQuiz}
          type="button"
          className="inline-flex items-center gap-1 text-[13px] leading-none tracking-[-0.01em] underline underline-offset-[3px] decoration-[var(--line)] hover:decoration-[var(--ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-sm px-0.5 py-1"
          style={{ color: "var(--ink)" }}
        >
          用此岗模拟面试
          <span
            aria-hidden
            className="text-[11px] transition-transform duration-180 group-hover:translate-x-0.5"
            style={{ color: "var(--muted)" }}
          >
            →
          </span>
        </button>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      className="bg-white rounded-[20px] border p-5 lg:p-6 animate-pulse"
      style={{
        borderColor: "var(--line, #e8e6e1)",
        boxShadow: "0 1px 12px rgba(0,0,0,0.04)",
      }}
    >
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-full bg-[var(--line)] shrink-0" />
        <div className="flex-1 space-y-3 min-w-0">
          <div className="h-4 w-[68%] bg-[#f1ede8] rounded-full" />
          <div className="flex items-center gap-2">
            <div className="h-3 w-20 bg-[#f1ede8] rounded-full" />
            <div className="w-px h-3 bg-[var(--line)]" />
            <div className="h-3 w-16 bg-[#f8f7f5] border border-[var(--line)] rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-[9px] w-14 bg-[#f1ede8] rounded" />
        <div className="flex gap-1.5">
          <div className="h-6 w-20 bg-[#f8f7f5] border border-[var(--line)] rounded-full" />
          <div className="h-6 w-24 bg-[#f8f7f5] border border-[var(--line)] rounded-full" />
          <div className="hidden sm:block h-6 w-16 bg-[#f8f7f5] border border-[var(--line)] rounded-full" />
        </div>
      </div>
      <div className="mt-4 h-[72px] rounded-xl border border-dashed bg-[var(--paper-warm)]" />
      <div className="mt-4 flex gap-4 border-t border-dashed border-[var(--line)] pt-3">
        <div className="h-3 w-20 bg-[#f1ede8] rounded" />
        <div className="w-px h-3 bg-[var(--line)]" />
        <div className="h-3 w-28 bg-[#f1ede8] rounded" />
      </div>
    </div>
  );
}
