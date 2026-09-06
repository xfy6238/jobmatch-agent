import { useCallback, useState } from "react";
import { api } from "../../api/client";
import type { MatchResponse } from "../../types";
import { MatchCard, SkeletonCard } from "./components/MatchCard";

const DEFAULT_PROFILE = "3年 Python后端 + RAG问答项目 + LangChain + Docker部署";

const SHORTCUTS = [
  {
    label: "AI Agent方向",
    value: "3年 Python后端 + RAG问答项目 + LangChain + Docker部署 + Prompt评测",
  },
  {
    label: "前端转AI",
    value: "5年 前端/React/TS + 近1年 AI应用开发 + Prompt工程 + 向量检索",
  },
  {
    label: "Python后端",
    value: "3年 Python + FastAPI/PostgreSQL + 想转大模型应用开发",
  },
] as const;

type MinMid = "" | "17" | "20" | "25";

export default function MatchPage() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [minMid, setMinMid] = useState<MinMid>("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MatchResponse | null>(null);
  const [polishOpen, setPolishOpen] = useState(true);

  const doMatch = useCallback(async () => {
    const p = profile.trim();
    if (!p) {
      setError("请先输入画像");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, unknown> = {};
      if (minMid) filters.min_mid = Number(minMid);
      const kw = keyword.trim();
      if (kw) filters.keyword = kw;
      const res = await api.match(
        p,
        Object.keys(filters).length ? filters : undefined,
      );
      setData(res);
      setPolishOpen(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.slice(0, 600));
    } finally {
      setLoading(false);
    }
  }, [profile, minMid, keyword]);

  const onProfileKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void doMatch();
    }
  };
  const onKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void doMatch();
    }
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* ——— 顶部：1px accent 线 + serif 大标题 + 13px muted 点分隔链路 ——— */}
      <div className="card overflow-hidden p-0">
        <div className="h-px w-full bg-accent" aria-hidden />
        <div className="px-6 lg:px-7 pt-[22px] pb-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1 className="font-serif text-[28px] lg:text-[32px] leading-none tracking-[-0.03em] font-[580] text-ink">
              匹配诊断
              <span className="ml-2 align-baseline font-sans text-[13px] font-normal tracking-[0.12em] text-muted">
                S1
              </span>
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] tracking-wide px-2.5 py-1 rounded-full bg-paper-warm border border-line text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              RAG · 向量可演示
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted flex flex-wrap items-center gap-1.5">
            <span>画像</span>
            <span className="opacity-30">·</span>
            <span>检索 Top20</span>
            <span className="opacity-30">·</span>
            <span className="font-mono text-[11px] tracking-[0.06em]">
              fit → active → salary
            </span>
            <span className="opacity-30">·</span>
            <span>Top3</span>
            <span className="ml-1 hidden sm:inline text-[11px] opacity-60">
              20 条示例岗位 · 引用可回跳 · 无 Key 照样演示
            </span>
          </p>
        </div>
      </div>

      {/* ——— 主体：5:7 分栏，间距 20-24，移动端堆叠 ——— */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* 左：输入区 5/12 */}
        <div className="lg:col-span-5">
          <div className="card p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold tracking-[0.08em] uppercase text-ink">
                画像输入
              </h2>
              <span className="text-[11px] tracking-wide text-muted">
                ⌘ + ↵ 快速诊断
              </span>
            </div>

            {/* textarea — 暖纸底 1px line，聚焦 line→accent 过渡，placeholder 淡 */}
            <div className="mt-4">
              <label htmlFor="mp-profile" className="sr-only">
                画像描述
              </label>
              <textarea
                id="mp-profile"
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                onKeyDown={onProfileKeyDown}
                rows={4}
                placeholder="描述你的核心画像，如：3年 Python后端 + RAG问答项目..."
                className="w-full min-h-[110px] rounded-xl border border-line bg-paper-warm px-3.5 py-3 text-[14px] leading-relaxed placeholder:text-stone-400/70 text-ink resize-y transition-[border-color,background-color,box-shadow] duration-180 ease-out focus:outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent-line"
              />
              <div className="mt-1.5 flex items-center justify-between text-[11px] leading-none text-muted">
                <span className="tabular-nums">
                  {profile.length} 字 · 回车换行，⌘/Ctrl+回车诊断
                </span>
                <button
                  onClick={() => setProfile(DEFAULT_PROFILE)}
                  type="button"
                  className="underline underline-offset-4 decoration-line hover:decoration-ink hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-1 -mr-1"
                >
                  恢复默认
                </button>
              </div>
            </div>

            {/* 快捷画像 — 极简 pill：paper 底 line 边，无紫 */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SHORTCUTS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setProfile(s.value)}
                  type="button"
                  className="inline-flex items-center px-3 py-1.5 rounded-full border bg-paper-warm border-line text-[12px] leading-none text-ink hover:bg-white hover:border-[#ddd9d2] transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* 过滤区 — select 极简样式，keyword 同 textarea */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] tracking-[0.06em] font-medium text-muted mb-1.5 uppercase">
                  最低薪资 mid
                </label>
                <div className="relative">
                  <select
                    value={minMid}
                    onChange={(e) => setMinMid(e.target.value as MinMid)}
                    className="w-full appearance-none rounded-xl border border-line bg-paper-warm px-3 py-2.5 pr-8 text-[13px] leading-none text-ink focus:outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent-line transition-colors duration-180"
                  >
                    <option value="">不限</option>
                    <option value="17">≥ 17K</option>
                    <option value="20">≥ 20K</option>
                    <option value="25">≥ 25K</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[10px]">
                    ▾
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] tracking-[0.06em] font-medium text-muted mb-1.5 uppercase">
                  关键词
                </label>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={onKeywordKeyDown}
                  placeholder="AI Agent / 前端 / Flutter"
                  className="w-full rounded-xl border border-line bg-paper-warm px-3 py-2.5 text-[13px] leading-none placeholder:text-stone-400/70 text-ink focus:outline-none focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent-line transition-colors duration-180"
                />
              </div>
            </div>

            {/* 主按钮 — sage 底白字 44px 高 圆角 12，素雅不笨重 */}
            <button
              onClick={() => void doMatch()}
              disabled={loading}
              type="button"
              className="mt-5 w-full inline-flex items-center justify-center gap-2 h-[44px] rounded-[12px] bg-[var(--accent)] text-white text-[14px] font-medium tracking-[-0.01em] hover:bg-[#4a5c4e] active:bg-[#3f4f43] disabled:opacity-50 disabled:cursor-not-allowed transition-[background,opacity,transform,box-shadow] duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 border border-[var(--accent)]"
              style={{
                boxShadow: loading ? "none" : "0 2px 14px rgba(90,108,94,0.18)",
              }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                  诊断中…
                </>
              ) : (
                <>
                  开始诊断
                  <span className="opacity-60 text-[12px]">→</span>
                </>
              )}
            </button>

            {error && (
              <div className="mt-3 rounded-xl bg-[#fdf2f0] border border-[#e8c9c0] text-[#7a2e1f] px-3.5 py-2.5 text-xs leading-relaxed break-all">
                <span className="font-medium">请求失败：</span>
                {error}
              </div>
            )}

            {/* mode 徽章 — 小点 + 文字（llm 深绿点 / rules 石点） + polish 引用样式 */}
            {(data || loading) && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] tracking-[0.06em] font-medium text-muted uppercase">
                    模式
                  </span>
                  {loading ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-line bg-paper-warm text-[11px] text-muted animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                      检测中…
                    </span>
                  ) : data?.mode === "llm" ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] leading-none text-ink">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      LLM 润色
                    </span>
                  ) : data?.mode === "rules" ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] leading-none text-ink">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                      rules 规则
                    </span>
                  ) : null}
                  {data && (
                    <span className="text-[11px] text-muted hidden sm:inline">
                      无 Key 时为 rules 照样可演示
                    </span>
                  )}
                </div>

                {data?.polish && (
                  <div className="rounded-xl border border-line bg-paper-warm overflow-hidden">
                    <button
                      onClick={() => setPolishOpen((v) => !v)}
                      type="button"
                      className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-white/60 transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                    >
                      <span className="text-[12px] font-medium tracking-wide text-ink flex items-center gap-2">
                        <span className="w-1 h-4 rounded-full bg-accent shrink-0" />
                        AI 润色建议
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                        {polishOpen ? "收起" : "展开"}
                        <span
                          className="text-[9px] transition-transform duration-180"
                          style={{
                            transform: polishOpen
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                            display: "inline-block",
                          }}
                        >
                          ▾
                        </span>
                      </span>
                    </button>
                    {polishOpen && (
                      <div className="px-3.5 pb-3">
                        <div className="border-l-[2px] border-accent pl-3 py-1 ml-0.5">
                          <div className="rounded-lg bg-white border border-line px-3 py-2.5 text-[13px] leading-relaxed text-ink whitespace-pre-wrap break-words">
                            {data.polish}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {data && !data.polish && data.mode === "rules" && (
                  <div className="text-[12px] leading-relaxed text-muted bg-paper-warm border border-dashed border-line rounded-xl px-3 py-2.5">
                    当前为{" "}
                    <span className="font-medium text-ink">rules 规则</span>{" "}
                    模式：已按 fit → active → salary 重排并生成缺口，未使用 LLM
                    润色（配置 Key 后自动升级）。
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 text-[11px] leading-relaxed text-muted border-t border-dashed border-line pt-3">
              提示：输入框内{" "}
              <span className="font-medium text-ink">回车换行</span>，
              <span className="font-medium text-ink">⌘/Ctrl+回车</span>{" "}
              触发诊断；关键词框内直接回车即可诊断。
            </div>
          </div>
        </div>

        {/* 右：结果区 7/12 */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="font-serif text-[14px] font-semibold tracking-[-0.02em] text-ink flex items-center gap-2">
              诊断结果 Top3
              {data && !loading && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-line bg-white text-[11px] font-mono font-medium tabular-nums text-muted">
                  {data.top3.length} 条
                </span>
              )}
            </h2>
            {data && (
              <button
                onClick={() => void doMatch()}
                disabled={loading}
                type="button"
                className="text-[12px] leading-none px-3 py-1.5 rounded-full border border-line bg-white text-muted hover:text-ink hover:border-[#ddd9d2] hover:bg-paper-warm disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                重新诊断
              </button>
            )}
          </div>

          {/* 加载骨架 */}
          {loading && (
            <div className="space-y-3">
              <div className="page-enter">
                <SkeletonCard />
              </div>
              <div className="page-enter stagger-2">
                <SkeletonCard />
              </div>
              <div className="page-enter stagger-3">
                <SkeletonCard />
              </div>
            </div>
          )}

          {/* 空状态 — 素雅 */}
          {!loading && !data && !error && (
            <div className="card border-dashed p-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-paper-warm border border-line mx-auto grid place-items-center text-muted text-[14px]">
                ◐
              </div>
              <div className="mt-3 font-serif text-[14px] font-medium text-ink">
                尚未诊断
              </div>
              <div className="mt-1 text-[12px] leading-relaxed text-muted max-w-[36ch] mx-auto">
                在左侧输入画像并点击“开始诊断”，将基于 20 条示例岗位做向量粗排 +
                规则精排，返回 Top3 与缺口分析。
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-paper-warm border border-line text-muted">
                示例画像已填好，直接点击“开始诊断”即可预览
              </div>
            </div>
          )}

          {!loading && error && !data && (
            <div className="card p-4 border-[#e8c9c0] bg-[#fdf2f0]">
              <p className="text-[13px] leading-relaxed text-[#7a2e1f]">
                诊断未完成，请检查后端是否启动（
                <span className="font-mono">127.0.0.1:8321</span>
                ）或稍后重试。错误已在左侧展示。
              </p>
            </div>
          )}

          {/* Top3 卡片 — stagger 60ms 淡入上移 6px，无弹跳 */}
          {!loading && data && (
            <div className="space-y-3">
              {data.top3.length === 0 ? (
                <div className="card p-8 text-center">
                  <div className="font-serif text-[14px] font-medium text-ink">
                    无匹配结果
                  </div>
                  <div className="text-[12px] text-muted mt-1">
                    试试放宽筛选（薪资不限 / 去掉关键词）或调整画像描述
                  </div>
                </div>
              ) : (
                data.top3.map((it, idx) => (
                  <div
                    key={`${it.url}-${idx}`}
                    className="page-enter"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <MatchCard item={it} rank={idx + 1} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* 底部小字 — 淡 */}
          <div className="card px-4 py-3 flex gap-2.5 items-start bg-paper-warm/40">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-white border border-line grid place-items-center text-[10px] text-muted shrink-0">
              !
            </span>
            <p className="text-[11px] leading-relaxed text-muted">
              引用可回跳 JD 原文，禁编造公司名；无 Key 时为{" "}
              <span className="font-medium text-ink">rules 模式</span>{" "}
              照样可演示（仅无 LLM 润色文案，Top3 / 缺口 / 排序均正常）。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
