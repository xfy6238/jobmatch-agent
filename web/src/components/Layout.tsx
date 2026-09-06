import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { HealthResponse } from "../types";

const nav = [
  { to: "/", label: "匹配诊断", desc: "S1 · 画像→Top3", icon: "◐" },
  { to: "/quiz", label: "模拟面试", desc: "S2 · 5题→打分", icon: "◑" },
  { to: "/jobs", label: "岗位库", desc: "20 岗位 · 筛选", icon: "▦" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth({ ok: false, error: "后端未启动" }));
  }, [loc.pathname]);

  return (
    <div className="min-h-screen">
      {/* ── header: 66h, paper blur, hairline ── */}
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-[var(--line)]">
        <div className="max-w-[1680px] w-[92vw] mx-auto px-2 lg:px-8 h-[66px] flex items-center justify-between gap-6">
          {/* left: mark + title */}
          <div className="flex items-center gap-4 min-w-0">
            {/* JA — 32px serif ink, paper text, subtle square */}
            <div
              className="w-8 h-8 rounded-[10px] bg-ink text-paper grid place-items-center shrink-0 border border-ink"
              aria-hidden
            >
              <span className="font-serif text-[13px] font-semibold tracking-tight leading-none">
                JA
              </span>
            </div>

            <div className="min-w-0">
              <div className="font-serif text-[16px] font-[620] tracking-tight leading-none text-ink">
                求职 Agent
              </div>
              <div className="text-[11px] leading-none mt-1 tracking-wide text-stone truncate hidden sm:block">
                20 条示例岗位 · RAG · 工具 · 评测可演示
              </div>
            </div>

            {/* MVP — paper+line minimal, no purple */}
            <span className="hidden sm:inline-flex items-center rounded-full bg-[var(--paper-warm)] border border-[var(--line)] text-stone text-[11px] font-medium tracking-wide px-2.5 py-1 leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-accent/55 mr-1.5 hidden sm:inline-block" />
              MVP · 本地可跑
            </span>
          </div>

          {/* right */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* health pill */}
            <div className="hidden md:flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs leading-none font-medium
                  ${health?.ok ? "border-[var(--line)] text-stone" : "border-amber-200 text-amber-700 bg-amber-50/60"}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${health?.ok ? "bg-[var(--accent)]" : "bg-amber-500"} ${health?.ok ? "opacity-80" : "animate-pulse"}`}
                />
                <span className="hidden lg:inline">
                  {health?.ok
                    ? `在线 · ${health.jobs} 岗 · ${health.llm ? "LLM" : "rules"}`
                    : (health?.error ?? "检测中")}
                </span>
                <span className="lg:hidden">
                  {health?.ok ? `在线 ${health.jobs}` : "离线"}
                </span>
              </span>
              {health?.model && (
                <span className="hidden xl:inline text-[11px] tracking-wide text-stone/70 max-w-[160px] truncate">
                  {health.model}
                </span>
              )}
            </div>

            <span
              className="hidden sm:inline-flex items-center rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-stone"
              title="开箱 20 条虚构示例，可换成你自己的 JD 数据"
            >
              数据源：内置虚构示例
            </span>
          </div>
        </div>
      </header>

      {/* ── body: 12-col, gap 28, ample whitespace — 流体版心：13.3″ 舒适，30″ 不显小 ── */}
      <div className="max-w-[1680px] w-[92vw] mx-auto px-2 lg:px-8 py-6 lg:py-7 grid grid-cols-12 gap-6 lg:gap-7">
        {/* ── sidebar: sticky, paper editorial ── */}
        <aside className="col-span-12 lg:col-span-3 lg:sticky lg:top-[88px] self-start space-y-5">
          {/* mobile: horizontal tabs */}
          <div className="lg:hidden -mx-4 px-4">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition shrink-0 ${
                      isActive
                        ? "bg-[var(--accent-soft)] text-ink border-[var(--accent-line)] shadow-sm"
                        : "bg-white border-[var(--line)] text-stone hover:bg-[var(--paper-warm)] hover:text-ink"
                    }`
                  }
                >
                  <span className="text-[13px] leading-none opacity-80">
                    {n.icon}
                  </span>
                  {n.label}
                </NavLink>
              ))}
            </div>
          </div>

          {/* desktop: editorial side nav — no card bg, group lines */}
          <div className="hidden lg:block page-enter stagger-1">
            <div className="px-1 pb-2">
              <div className="text-[10px] tracking-[0.16em] font-medium text-stone/60 uppercase">
                导航
              </div>
            </div>

            <nav
              aria-label="主导航"
              className="pt-3 border-t border-[var(--line)] space-y-1"
            >
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-[14px] px-3 py-3 text-sm transition
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1
                     ${
                       isActive
                         ? "bg-[var(--accent-soft)] text-ink border border-[var(--accent-line)] shadow-sm"
                         : "text-ink/75 hover:text-ink hover:bg-[var(--paper-warm)] border border-transparent hover:border-[var(--line)]/60"
}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* active accent line */}
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-accent"
                        />
                      )}

                      {/* icon: thin line feel */}
                      <span
                        className={`w-7 h-7 rounded-[10px] grid place-items-center text-[12px] leading-none border shrink-0 transition
                          ${
                            isActive
                              ? "bg-white border-[var(--accent-line)] text-accent"
                              : "bg-white border-[var(--line)] text-stone group-hover:border-stone/15"
                          }`}
                      >
                        {n.icon}
                      </span>

                      <span className="flex-1 min-w-0 text-left">
                        <span className="block font-medium leading-none tracking-tight">
                          {n.label}
                        </span>
                        <span
                          className={`block text-[11px] leading-none mt-1 tracking-wide ${
                            isActive ? "text-stone" : "text-stone/70"
                          }`}
                        >
                          {n.desc}
                        </span>
                      </span>

                      <span
                        className={`hidden xl:block w-1.5 h-1.5 rounded-full shrink-0 transition ${
                          isActive
                            ? "bg-accent"
                            : "bg-stone/0 group-hover:bg-stone/10"
                        }`}
                      />
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* subtle divider */}
            <div className="h-px bg-[var(--line)] mt-5" />
          </div>

          {/* ── demo script card: paper minimal ── */}
          <div className="card p-4 page-enter stagger-2 hidden lg:block">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold tracking-tight text-ink">
                演示脚本 · 5 分钟
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-accent/55 shrink-0" />
            </div>

            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-stone list-none">
              <li className="flex gap-2">
                <span className="font-mono text-[11px] leading-5 text-stone/50">
                  01
                </span>
                <span>粘贴画像 → 推 Top3 匹配与缺口</span>
              </li>
              <li className="h-px bg-[var(--line)] my-1" />
              <li className="flex gap-2">
                <span className="font-mono text-[11px] leading-5 text-stone/50">
                  02
                </span>
                <span>点岗位进入模拟面试</span>
              </li>
              <li className="h-px bg-[var(--line)] my-1" />
              <li className="flex gap-2">
                <span className="font-mono text-[11px] leading-5 text-stone/50">
                  03
                </span>
                <span>逐题作答 · 看打分与追问</span>
              </li>
            </ol>

            <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-wrap gap-1.5">
              <span className="badge-paper">无 Key 可降级</span>
              <span className="badge-paper">引用可回跳</span>
            </div>
          </div>

          {/* mobile demo card as compact row */}
          <div className="card p-3 flex items-center gap-3 lg:hidden page-enter stagger-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--paper-warm)] border border-[var(--line)] grid place-items-center text-[13px] text-stone shrink-0">
              ✦
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-ink leading-none">
                5 分钟演示
              </div>
              <div className="text-[11px] text-stone leading-none mt-1">
                画像 → Top3 → 模拟面试
              </div>
            </div>
            <span className="badge-paper shrink-0 hidden sm:inline-flex">
              本地可跑
            </span>
          </div>

          {/* ── stats card: paper minimal, hairline separators ── */}
          <div className="card overflow-hidden page-enter stagger-3">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2 border-b border-[var(--line)]">
              <span className="text-[10px] tracking-[0.16em] font-medium text-stone/70 uppercase">
                数据口径
              </span>
              <span className="text-[10px] font-mono text-stone/40">
                20 · 0 · 10
              </span>
            </div>

            <div className="p-3 grid grid-cols-3 gap-2">
              {[
                { k: "示例岗位", v: "20" },
                { k: "详情 JD", v: "按需" },
                { k: "评测题", v: "10" },
              ].map((s) => (
                <div
                  key={s.k}
                  className="rounded-2xl bg-[var(--paper-warm)] border border-[var(--line)]/70 px-2 py-3 text-center"
                >
                  <div className="font-serif text-[18px] font-[620] leading-none tracking-tight text-ink">
                    {s.v}
                  </div>
                  <div className="text-[10px] tracking-wide text-stone mt-1 leading-none">
                    {s.k}
                  </div>
                </div>
              ))}
            </div>

            <div className="mx-4 py-3 border-t border-[var(--line)]">
              <p className="text-xs leading-relaxed text-stone">
                开箱 20 条虚构示例岗位（example.com 占位），换成你自己的 JD JSON
                即可复用全部链路。默认只看薪资中位 ≥17K 的条目。
              </p>
            </div>
          </div>

          {/* fine print links */}
          <div className="hidden lg:block px-1 pt-1">
            <div className="text-[11px] leading-relaxed text-stone/65">
              数据由你自己的 JD JSON 提供；本仓库仅含虚构示例，不做自动投递。
            </div>
          </div>
        </aside>

        {/* ── main ── */}
        <main className="col-span-12 lg:col-span-9 min-w-0 page-enter stagger-2">
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
