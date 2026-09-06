import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { api } from "../../api/client";
import type { MatchItem, QuizAnswerResponse, QuizQuestion } from "../../types";
import FollowupThread, {
  MAX_FOLLOWUP_ROUNDS,
  type ThreadMsg,
} from "./components/FollowupThread";

type JobCard = {
  title?: string;
  company?: string;
  salary?: string;
  url?: string;
};

const DEFAULT_PROFILE =
  "3年 Python后端 + RAG问答项目 + LangChain + Docker部署";

const FALLBACK_JOBS: Pick<MatchItem, "title" | "company" | "url" | "salary">[] =
  [
    {
      title: "AI Agent应用开发工程师",
      company: "云杉示例科技",
      url: "https://example.com/jobs/samp-01",
      salary: "20-40K",
    },
    {
      title: "大模型应用开发工程师",
      company: "白鹭演示智能",
      url: "https://example.com/jobs/samp-02",
      salary: "20-35K",
    },
    {
      title: "AI全栈应用工程师",
      company: "青竹样例软件",
      url: "https://example.com/jobs/samp-03",
      salary: "20-30K",
    },
  ];

/* 素雅单色体系：score 圆 */
function ScoreRing({ score }: { score: number }) {
  const base =
    "w-[28px] h-[28px] rounded-full grid place-items-center text-[12px] tabular-nums border shrink-0";
  if (score === 2) {
    return (
      <span
        className={`${base} bg-[var(--accent)] border-[var(--accent)] text-white`}
      >
        2
      </span>
    );
  }
  if (score === 1) {
    return (
      <span
        className={`${base} bg-white border-[var(--accent)] text-[var(--accent)]`}
        style={{ borderColor: "var(--accent, #5a6c5e)" }}
      >
        1
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-white text-stone-400`}
      style={{ borderColor: "#e8e6e1" }}
    >
      0
    </span>
  );
}

function NavScorePill({ score, active }: { score?: number; active?: boolean }) {
  if (score === undefined) {
    return (
      <span
        className={`inline-flex w-[18px] h-[18px] rounded-full border grid place-items-center text-[11px] tabular-nums shrink-0 ${active ? "border-white/30 text-white/50" : "border-[#e8e6e1] text-stone-400"}`}
      >
        —
      </span>
    );
  }
  // 已答：细线数字，不再用红黄绿块
  return (
    <span
      className={`inline-flex w-[18px] h-[18px] rounded-full border grid place-items-center text-[11px] tabular-nums font-medium shrink-0 ${active ? "bg-white text-[#0f172a] border-white" : "bg-white border-[#e8e6e1] text-stone-700"}`}
    >
      {score}
    </span>
  );
}

export default function QuizPage() {
  const [jobUrl, setJobUrl] = useState("");
  const [quickJobs, setQuickJobs] = useState<
    Pick<MatchItem, "title" | "company" | "url" | "salary">[]
  >([]);
  const [quickLoading, setQuickLoading] = useState(false);

  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [quizId, setQuizId] = useState<string | null>(null);
  const [job, setJob] = useState<JobCard | null>(null);
  const [hot, setHot] = useState<string[]>([]);
  const [llm, setLlm] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQid, setCurrentQid] = useState<number>(0);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, QuizAnswerResponse>>(
    {},
  );
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});
  const [answerErrors, setAnswerErrors] = useState<Record<number, string>>({});

  // —— 多轮追问模型（题内多轮对话记忆）——
  // 每题维护 history：初始 [{assistant: q.q}]，每次提交追加 user 答案 + assistant 反馈&followup
  const [threads, setThreads] = useState<Record<number, ThreadMsg[]>>({});
  // 该题本轮是否已结束（计入 progress）
  const [finished, setFinished] = useState<Record<number, boolean>>({});
  // 每题 followup 输入区草稿
  const [followupDrafts, setFollowupDrafts] = useState<Record<number, string>>(
    {},
  );

  const lastSubmitRef = useRef<Record<number, number>>({});

  // init: ?jobUrl + localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const paramUrl = params.get("jobUrl") || params.get("job_url") || "";
      const stored = localStorage.getItem("lastJobUrl") || "";
      const init = paramUrl || stored || "";
      if (init) setJobUrl(init);
      if (paramUrl) localStorage.setItem("lastJobUrl", paramUrl);
    } catch {
      // ignore storage access error
    }
  }, []);

  // fetch quick jobs via api.match
  useEffect(() => {
    let cancelled = false;
    async function loadQuick() {
      setQuickLoading(true);
      try {
        const ret = await api.match(DEFAULT_PROFILE);
        if (cancelled) return;
        const top3 = (ret.top3 || []).slice(0, 3).map((j) => ({
          title: j.title,
          company: j.company,
          url: j.url,
          salary: j.salary,
        }));
        if (top3.length > 0) setQuickJobs(top3);
        else setQuickJobs(FALLBACK_JOBS);
      } catch {
        if (!cancelled) setQuickJobs(FALLBACK_JOBS);
      } finally {
        if (!cancelled) setQuickLoading(false);
      }
    }
    loadQuick();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentQuestion = useMemo(() => {
    if (questions.length === 0) return null;
    const found = questions.find((q) => q.qid === currentQid);
    return found ?? questions[0] ?? null;
  }, [questions, currentQid]);

  const progress = useMemo(() => {
    // 完成口径：有结果或已结束本轮的题均计入（保持原有“首答即计入”行为不变）
    const doneQids = new Set<number>([
      ...Object.keys(results).map(Number),
      ...Object.entries(finished)
        .filter(([, v]) => v)
        .map(([k]) => Number(k)),
    ]);
    const answered = doneQids.size;
    const total = questions.length || 5;
    const scored = Object.values(results);
    const avg =
      scored.length === 0
        ? "-"
        : (
            scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length
          ).toFixed(1);
    return { answered, total, avg };
  }, [results, finished, questions.length]);

  // 题内多轮：已完成的追问轮次 = assistant 反馈条数（不含首条题干）
  const getRound = (qid: number): number => {
    const t = threads[qid] ?? [];
    const assistantMsgs = t.filter((m) => m.role === "assistant").length;
    return Math.max(0, assistantMsgs - 1);
  };

  // 会话记忆条：最近 followup 摘要（取当前题→最近有结果题的 followup 截断）
  const latestFollowupSummary = useMemo(() => {
    const ordered = [
      currentQid,
      ...Object.keys(results)
        .map(Number)
        .sort((a, b) => b - a),
    ];
    for (const qid of ordered) {
      const f = results[qid]?.followup?.trim();
      if (f) return f.length > 42 ? `${f.slice(0, 42)}…` : f;
    }
    return "";
  }, [results, currentQid]);

  // history 持久化：localStorage 作缓存；若后端已提供 GET /api/quiz/history 则优先拉取
  useEffect(() => {
    if (!quizId) return;
    let cancelled = false;
    // 先读本地缓存即时渲染
    try {
      const cached = localStorage.getItem(`quizThreads:${quizId}`);
      if (cached && !cancelled) {
        const parsed = JSON.parse(cached) as {
          threads?: Record<number, ThreadMsg[]>;
          finished?: Record<number, boolean>;
        };
        if (parsed.threads) setThreads(parsed.threads);
        if (parsed.finished) setFinished(parsed.finished);
      }
    } catch {
      // ignore cache parse error
    }
    // 再尝试后端 memory/history（B2 若新增则生效，否则静默回退本地）
    (async () => {
      try {
        const res = await fetch(
          `/api/quiz/history?quiz_id=${encodeURIComponent(quizId)}`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          threads?: Record<number, ThreadMsg[]>;
          finished?: Record<number, boolean>;
        };
        if (data.threads && !cancelled) setThreads(data.threads);
        if (data.finished && !cancelled) setFinished(data.finished);
      } catch {
        // 后端未提供该接口时保持本地 history
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  // threads/finished 变更即写本地缓存
  useEffect(() => {
    if (!quizId) return;
    try {
      localStorage.setItem(
        `quizThreads:${quizId}`,
        JSON.stringify({ threads, finished }),
      );
    } catch {
      // ignore storage access error
    }
  }, [quizId, threads, finished]);

  const handleStart = async () => {
    if (startLoading) return;
    setStartError(null);
    setStartLoading(true);
    try {
      const trimmed = jobUrl.trim();
      const ret = await api.quizStart(trimmed);
      try {
        if (trimmed) localStorage.setItem("lastJobUrl", trimmed);
      } catch {
        // ignore
      }
      setQuizId(ret.quiz_id);
      setJob(ret.job as JobCard);
      setHot(ret.hot || []);
      setLlm(ret.llm);
      setQuestions(ret.questions || []);
      setCurrentQid(ret.questions?.[0]?.qid ?? 0);
      setResults({});
      setAnswerErrors({});
      setAnswers({});
      setSubmitting({});
      // 多轮初始化：每题 history 首条为题干 assistant 消息
      const initThreads: Record<number, ThreadMsg[]> = {};
      for (const q of ret.questions || []) {
        initThreads[q.qid] = [{ role: "assistant", text: q.q }];
      }
      setThreads(initThreads);
      setFinished({});
      setFollowupDrafts({});
      lastSubmitRef.current = {};
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStartError(msg.slice(0, 400) || "启动失败");
    } finally {
      setStartLoading(false);
    }
  };

  const handleAnswer = async () => {
    if (!currentQuestion || !quizId) return;
    const qid = currentQuestion.qid;
    const txt = (answers[qid] ?? "").trim();
    if (!txt) return;
    if (submitting[qid]) return;
    const now = Date.now();
    const last = lastSubmitRef.current[qid] ?? 0;
    if (now - last < 600) return;
    lastSubmitRef.current[qid] = now;

    setSubmitting((s) => ({ ...s, [qid]: true }));
    setAnswerErrors((s) => ({ ...s, [qid]: "" }));
    try {
      const ret = await api.quizAnswer(quizId, qid, txt);
      if (ret.error) {
        const isExpired =
          ret.error.includes("quiz_id") || ret.error.includes("不存在");
        setAnswerErrors((s) => ({
          ...s,
          [qid]: isExpired ? "请重新开始" : ret.error || "提交失败",
        }));
        return;
      }
      setResults((r) => ({ ...r, [qid]: ret }));
      // 多轮记忆：追加 user 答案 + assistant 反馈&followup
      setThreads((t) => ({
        ...t,
        [qid]: [
          ...(t[qid] ?? [
            { role: "assistant" as const, text: currentQuestion.q },
          ]),
          { role: "user" as const, text: txt },
          {
            role: "assistant" as const,
            text: `${ret.feedback}\n${ret.followup}`,
            score: ret.score,
          },
        ],
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isExpired =
        msg.includes("quiz_id") ||
        msg.includes("不存在") ||
        msg.includes("404") ||
        msg.includes("500");
      if (isExpired && (msg.includes("quiz_id") || msg.includes("不存在"))) {
        setAnswerErrors((s) => ({ ...s, [qid]: "请重新开始" }));
      } else if (msg.includes("quiz_id")) {
        setAnswerErrors((s) => ({ ...s, [qid]: "请重新开始" }));
      } else {
        setAnswerErrors((s) => ({
          ...s,
          [qid]: msg.slice(0, 160) || "提交失败",
        }));
      }
    } finally {
      setSubmitting((s) => ({ ...s, [qid]: false }));
    }
  };

  // 题内多轮：对同一题的追问再答一次，仍调 quizAnswer（同 quiz_id/qid）
  const handleFollowupSubmit = async (qid: number) => {
    if (!quizId) return;
    const txt = (followupDrafts[qid] ?? "").trim();
    if (!txt) return;
    if (submitting[qid] || finished[qid]) return;
    if (getRound(qid) >= MAX_FOLLOWUP_ROUNDS) return;
    const now = Date.now();
    const last = lastSubmitRef.current[qid] ?? 0;
    if (now - last < 600) return;
    lastSubmitRef.current[qid] = now;

    setSubmitting((s) => ({ ...s, [qid]: true }));
    setAnswerErrors((s) => ({ ...s, [qid]: "" }));
    try {
      const ret = await api.quizAnswer(quizId, qid, txt);
      if (ret.error) {
        const isExpired =
          ret.error.includes("quiz_id") || ret.error.includes("不存在");
        setAnswerErrors((s) => ({
          ...s,
          [qid]: isExpired ? "请重新开始" : ret.error || "提交失败",
        }));
        return;
      }
      setResults((r) => ({ ...r, [qid]: ret }));
      const qText = questions.find((x) => x.qid === qid)?.q ?? "";
      setThreads((t) => ({
        ...t,
        [qid]: [
          ...(t[qid] ?? [{ role: "assistant" as const, text: qText }]),
          { role: "user" as const, text: txt },
          {
            role: "assistant" as const,
            text: `${ret.feedback}\n${ret.followup}`,
            score: ret.score,
          },
        ],
      }));
      setFollowupDrafts((d) => ({ ...d, [qid]: "" }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnswerErrors((s) => ({
        ...s,
        [qid]:
          msg.includes("quiz_id") || msg.includes("不存在")
            ? "请重新开始"
            : msg.slice(0, 160) || "提交失败",
      }));
    } finally {
      setSubmitting((s) => ({ ...s, [qid]: false }));
    }
  };

  // 结束本轮：标记该题完成，计入 progress
  const handleFinishRound = (qid: number) => {
    setFinished((f) => ({ ...f, [qid]: true }));
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    const idx = questions.findIndex((q) => q.qid === currentQuestion.qid);
    if (idx >= 0 && idx < questions.length - 1) {
      const next = questions[idx + 1];
      if (next) setCurrentQid(next.qid);
    }
  };

  const isExpiredGlobal = Object.values(answerErrors).some(
    (v) => v === "请重新开始",
  );

  const answeredCount = progress.answered;
  const totalCount = progress.total;
  const progressPct = Math.round((answeredCount / (totalCount || 5)) * 100);

  return (
    <div className="space-y-7 max-w-[1080px] mx-auto">
      <style>{`@keyframes s2-fade-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}} .s2-fade{animation:s2-fade-in 180ms ease-out}`}</style>

      {/* 顶部：accent 1px 上边线 + serif 标题 26px + 13px muted 副标题 */}
      <div
        className="bg-white rounded-[16px] shadow-sm overflow-hidden"
        style={{
          border: "1px solid #e8e6e1",
          borderTop: "1px solid var(--accent, #2e4a3e)",
        }}
      >
        <div className="px-6 sm:px-7 pt-6 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1
                className="font-serif tracking-tight text-[#0f172a] leading-none"
                style={{
                  fontFamily:
                    "'Cormorant Garamond','Noto Serif SC', Georgia, serif",
                  fontSize: 26,
                  fontWeight: 600,
                }}
              >
                模拟面试
                <span className="font-light ml-2" style={{ fontSize: 26 }}>
                  S2
                </span>
                <span
                  className="hidden sm:inline-flex ml-3 align-middle px-2.5 py-1 rounded-full border text-[11px] tracking-widest uppercase"
                  style={{
                    borderColor: "#e8e6e1",
                    background: "#fafaf8",
                    color: "#78716c",
                    fontFamily: "system-ui, sans-serif",
                    letterSpacing: "0.08em",
                  }}
                >
                  逐题作答 · 要点打分
                </span>
              </h1>
              <p
                className="mt-3 text-[13px] leading-relaxed"
                style={{ color: "#8a8680" }}
              >
                按指定 JD + 同类高频点出 5 题 — 逐题作答 — 要点打分 0 / 1 / 2 +
                追问
              </p>
            </div>
            {quizId && (
              <div className="hidden sm:flex items-center gap-2 shrink-0 pt-1">
                <span
                  className="px-2.5 py-1 rounded-full border text-[11px] tabular-nums"
                  style={{
                    borderColor: "#e8e6e1",
                    background: "#fafaf8",
                    color: "#57534e",
                  }}
                >
                  {quizId}
                </span>
                <span
                  className="px-2.5 py-1 rounded-full border text-[11px] tabular-nums"
                  style={{
                    borderColor: "#e8e6e1",
                    background: "white",
                    color: "#8a8680",
                  }}
                >
                  已答 {progress.answered}/{progress.total} · 均分{" "}
                  {progress.avg}
                </span>
              </div>
            )}
          </div>

          {/* 会话记忆条：已答题数 / 均分 / 最近 followup 摘要（memory 持久化 history，localStorage 为缓存） */}
          {questions.length > 0 && (
            <div className="mt-6">
              <div
                className="flex items-center justify-between text-[11px] tabular-nums mb-2"
                style={{ color: "#8a8680" }}
              >
                <span>
                  进度 · 已答 {progress.answered}/{progress.total}
                </span>
                <span>平均分 {progress.avg} / 2</span>
              </div>
              {latestFollowupSummary && (
                <div
                  className="mb-2 text-[11px] leading-relaxed truncate"
                  style={{ color: "#a8a29e" }}
                  title={latestFollowupSummary}
                >
                  最近追问 · {latestFollowupSummary}
                </div>
              )}
              <div
                className="h-[2px] rounded-full overflow-hidden"
                style={{ background: "#e8e6e1" }}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                    background: "var(--accent, #2e4a3e)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 起始区：JobUrl + 快捷岗 poll */}
      <div
        className="bg-white rounded-[16px] p-6 sm:p-7"
        style={{ border: "1px solid #e8e6e1" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-[15px] font-semibold tracking-tight text-[#0f172a]">
            选择目标岗位
          </h2>
          <span className="text-[11px]" style={{ color: "#a8a29e" }}>
            支持从匹配页一键跳转带入
          </span>
        </div>

        <div className="mt-5">
          <label
            className="text-[11px] tracking-[0.12em] uppercase font-medium"
            style={{ color: "#a8a29e" }}
          >
            JobUrl · 岗位链接
          </label>
          <div className="mt-2 flex flex-col sm:flex-row gap-3">
            <input
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="粘贴 JD 链接（可留空直接出题）"
              className="flex-1 h-[44px] px-4 rounded-xl text-sm placeholder:text-stone-400"
              style={{
                background: "#fafaf8",
                border: "1px solid #e8e6e1",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent, #2e4a3e)";
                e.currentTarget.style.background = "white";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e8e6e1";
                e.currentTarget.style.background = "#fafaf8";
              }}
            />
            <button
              onClick={handleStart}
              disabled={startLoading}
              className="h-[44px] px-7 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 transition border border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[#4a5c4e] active:bg-[#3f4f43]"
              style={{
                opacity: startLoading ? 0.6 : 1,
              }}
            >
              {startLoading && (
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              )}
              {startLoading ? "出题中…" : "开始面试"}
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className="px-2.5 py-1 rounded-full border"
              style={{
                background: "#fafaf8",
                borderColor: "#e8e6e1",
                color: "#78716c",
              }}
            >
              建议先做匹配诊断选一岗
            </span>
            <span
              className="hidden sm:inline tabular-nums"
              style={{ color: "#a8a29e" }}
            >
              已支持{" "}
              <span
                className="px-1.5 py-0.5 rounded border bg-white"
                style={{ borderColor: "#e8e6e1" }}
              >
                {" "}
                ?jobUrl=xxx{" "}
              </span>{" "}
              自动填充 · 已记忆{" "}
              <span
                className="px-1.5 py-0.5 rounded border bg-white"
                style={{ borderColor: "#e8e6e1" }}
              >
                localStorage(&apos;lastJobUrl&apos;)
              </span>
            </span>
          </div>
        </div>

        {/* 快捷岗 poll 文本链 */}
        <div className="mt-7 pt-5" style={{ borderTop: "1px dashed #e8e6e1" }}>
          <div className="flex items-center justify-between">
            <div
              className="text-[11px] tracking-[0.12em] uppercase font-medium"
              style={{ color: "#a8a29e" }}
            >
              快捷岗 · FIT TOP3
            </div>
            {quickLoading && (
              <span className="text-[11px]" style={{ color: "#a8a29e" }}>
                加载中…
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-1 gap-y-2">
            {(quickJobs.length ? quickJobs : FALLBACK_JOBS)
              .slice(0, 3)
              .map((j, idx) => {
                const active = jobUrl.trim() === j.url;
                return (
                  <Fragment key={j.url}>
                    <button
                      onClick={() => setJobUrl(j.url)}
                      title={j.url}
                      className="group inline-flex items-baseline gap-1.5 text-left transition"
                      style={{
                        textDecoration: active ? "underline" : "none",
                        textUnderlineOffset: 4,
                        textDecorationColor: "var(--accent, #2e4a3e)",
                      }}
                    >
                      <span
                        className="text-[13px] leading-none"
                        style={{
                          color: active ? "var(--accent, #2e4a3e)" : "#1c1917",
                          fontWeight: 500,
                        }}
                      >
                        {j.title}
                      </span>
                      <span
                        className="text-[11px] tabular-nums"
                        style={{ color: active ? "#57534e" : "#a8a29e" }}
                      >
                        — {j.company} · {j.salary}
                      </span>
                    </button>
                    {idx < 2 && (
                      <span
                        className="mx-2 text-[11px] select-none"
                        style={{ color: "#e8e6e1" }}
                      >
                        ·
                      </span>
                    )}
                  </Fragment>
                );
              })}
          </div>
          <div className="mt-2 text-[11px]" style={{ color: "#a8a29e" }}>
            点击文本链自动填入输入框
          </div>
        </div>

        {startError && (
          <div
            className="mt-5 p-3 rounded-xl border text-sm flex items-start gap-2"
            style={{
              background: "#fafaf8",
              borderColor: "#e8e6e1",
              color: "#57534e",
            }}
          >
            <span className="mt-0.5 text-xs">—</span>
            <span className="flex-1 break-all text-[13px] leading-relaxed">
              {startError}
            </span>
            <button
              onClick={() => setStartError(null)}
              className="shrink-0 px-2.5 py-1 rounded-full bg-white border text-xs"
              style={{ borderColor: "#e8e6e1" }}
            >
              关闭
            </button>
          </div>
        )}

        {/* 成功后 job 卡片 + hot + llm：极简白底细边 16px 圆角，hot 用 11px paper+line pill */}
        {quizId && job && (
          <div
            className="mt-6 rounded-[16px] p-5"
            style={{ border: "1px solid #e8e6e1", background: "white" }}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-[#0f172a] flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--accent, #2e4a3e)" }}
                  />
                  {job.title || "未识别岗位"}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full border text-xs"
                    style={{
                      background: "#fafaf8",
                      borderColor: "#e8e6e1",
                      color: "#57534e",
                    }}
                  >
                    {job.company || "未知公司"}
                  </span>
                  {job.salary && (
                    <span
                      className="inline-flex px-2.5 py-1 rounded-full border text-xs tabular-nums"
                      style={{
                        background: "#fafaf8",
                        borderColor: "#e8e6e1",
                        color: "#57534e",
                      }}
                    >
                      {job.salary}
                    </span>
                  )}
                  <span
                    className="inline-flex px-2.5 py-1 rounded-full border text-[11px] tabular-nums"
                    style={{
                      background: "white",
                      borderColor: "#e8e6e1",
                      color: "#a8a29e",
                    }}
                  >
                    quiz {quizId}
                  </span>
                </div>
              </div>
              {job.url ? (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-full border text-xs font-medium hover:bg-[#fafaf8] transition"
                  style={{
                    borderColor: "#e8e6e1",
                    color: "#57534e",
                    background: "white",
                  }}
                >
                  查看原 JD ↗
                </a>
              ) : (
                <span
                  className="shrink-0 inline-flex px-3.5 py-1.5 rounded-full border text-xs"
                  style={{
                    borderColor: "#e8e6e1",
                    color: "#a8a29e",
                    background: "#fafaf8",
                  }}
                >
                  无 JD 链接（按通用模板出题）
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span
                className="text-[11px] tracking-widest uppercase mr-1"
                style={{ color: "#a8a29e" }}
              >
                高频点
              </span>
              {hot.length ? (
                hot.map((h) => (
                  <span
                    key={h}
                    className="px-2.5 py-1 rounded-full border text-[11px]"
                    style={{
                      background: "#fafaf8",
                      borderColor: "#e8e6e1",
                      color: "#57534e",
                    }}
                  >
                    {h}
                  </span>
                ))
              ) : (
                <span className="text-xs" style={{ color: "#a8a29e" }}>
                  （未命中高频点，按通用模板）
                </span>
              )}
              {hot.length > 0 && (
                <span
                  className="text-[11px] tabular-nums ml-1"
                  style={{ color: "#a8a29e" }}
                >
                  · 命中 {hot.length} 项
                </span>
              )}
            </div>

            {llm && (
              <div
                className="mt-4 p-4 rounded-xl border"
                style={{ background: "#fafaf8", borderColor: "#e8e6e1" }}
              >
                <div
                  className="flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase"
                  style={{ color: "#78716c" }}
                >
                  <span
                    className="px-2 py-0.5 rounded-full border text-[11px] tracking-widest uppercase bg-white"
                    style={{ borderColor: "#e8e6e1", color: "#57534e" }}
                  >
                    LLM 出题补充
                  </span>
                  <span>大模型基于 JD 额外生成</span>
                </div>
                <div
                  className="mt-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words"
                  style={{ color: "#44403c" }}
                >
                  {llm}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 全局过期提示：素雅 */}
      {isExpiredGlobal && (
        <div
          className="rounded-[16px] p-4 flex items-start gap-3 bg-white"
          style={{ border: "1px solid #e8e6e1" }}
        >
          <span
            className="w-7 h-7 rounded-full grid place-items-center shrink-0 text-[11px] font-medium border"
            style={{
              background: "#fafaf8",
              borderColor: "#e8e6e1",
              color: "#57534e",
            }}
          >
            !
          </span>
          <div className="flex-1">
            <div
              className="text-[13px] font-medium"
              style={{ color: "#1c1917" }}
            >
              会话已过期
            </div>
            <div
              className="text-[13px] mt-1 leading-relaxed"
              style={{ color: "#78716c" }}
            >
              quiz_id 已失效，请重新开始面试（点击上方“开始面试”）。
            </div>
          </div>
          <button
            onClick={() => {
              setAnswerErrors({});
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="shrink-0 px-3.5 py-1.5 rounded-full bg-white border text-xs"
            style={{ borderColor: "#e8e6e1", color: "#57534e" }}
          >
            回到顶部
          </button>
        </div>
      )}

      {/* 答题区：桌面 1/3 + 2/3 */}
      {quizId && questions.length > 0 && currentQuestion ? (
        <div
          className="bg-white rounded-[16px] p-4 sm:p-6"
          style={{ border: "1px solid #e8e6e1" }}
        >
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-[15px] font-semibold tracking-tight text-[#0f172a] flex items-center gap-2">
              逐题作答
              <span
                className="hidden sm:inline text-[11px] font-normal tracking-normal"
                style={{ color: "#a8a29e", fontFamily: "system-ui" }}
              >
                点击左侧题库切换 · 已作答显示分数
              </span>
            </h2>
            <div
              className="text-[11px] tabular-nums hidden sm:block"
              style={{ color: "#a8a29e" }}
            >
              已答 {progress.answered}/{progress.total} · 均分 {progress.avg}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧题库卡：paper 底 */}
            <div className="lg:col-span-1">
              <div
                className="rounded-[16px] p-3"
                style={{ background: "#fafaf8", border: "1px solid #e8e6e1" }}
              >
                <div
                  className="text-[11px] tracking-[0.12em] uppercase font-medium px-2 py-1"
                  style={{ color: "#a8a29e" }}
                >
                  题库导航
                </div>
                {/* 移动端横向滚动，桌面纵向 */}
                <div className="mt-1 flex lg:block gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0 scrollbar-thin lg:space-y-2">
                  {questions.map((q, idx) => {
                    const isActive = q.qid === currentQuestion.qid;
                    const res = results[q.qid];
                    const hasScore = res !== undefined;
                    return (
                      <button
                        key={q.qid}
                        onClick={() => setCurrentQid(q.qid)}
                        className={`relative text-left rounded-xl border transition flex gap-3 items-start shrink-0 lg:shrink lg:w-full w-[280px] lg:w-auto p-3.5 ${isActive ? "shadow-sm" : "hover:bg-stone-100/60"}`}
                        style={{
                          background: isActive
                            ? "var(--accent-soft, rgba(90,108,94,0.12))"
                            : "transparent",
                          borderColor: isActive
                            ? "var(--accent-line, rgba(90,108,94,0.2))"
                            : "transparent",
                          color: isActive ? "var(--ink, #1a1c1e)" : "#1c1917",
                        }}
                      >
                        {/* 左侧 accent 竖线 2px */}
                        {isActive && (
                          <span
                            className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full"
                            style={{ background: "var(--accent, #2e4a3e)" }}
                          />
                        )}
                        <span
                          className="shrink-0 w-6 h-6 rounded-full grid place-items-center text-[11px] font-medium border tabular-nums"
                          style={{
                            background: isActive ? "var(--accent)" : "white",
                            color: isActive ? "white" : "#57534e",
                            borderColor: isActive ? "var(--accent)" : "#e8e6e1",
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="px-1.5 py-0.5 rounded text-[11px] tracking-wide"
                              style={{
                                color: isActive ? "var(--accent)" : "#a8a29e",
                                fontSize: 11,
                                letterSpacing: "0.04em",
                              }}
                            >
                              {q.kind}
                            </span>
                            {hasScore && (
                              <NavScorePill
                                score={res.score}
                                active={isActive}
                              />
                            )}
                            {!hasScore && isActive && (
                              <span
                                className="text-[11px] ml-1"
                                style={{ color: "var(--accent)" }}
                              >
                                当前
                              </span>
                            )}
                          </span>
                          <span
                            className="mt-1.5 block text-[13px] leading-snug line-clamp-2"
                            style={{ color: isActive ? "#1a1c1e" : "#1c1917" }}
                          >
                            {q.q}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 左侧进度：2px 轨道 line + accent 填充 */}
                <div
                  className="mt-4 mx-1 p-3 rounded-xl bg-white"
                  style={{ border: "1px solid #e8e6e1" }}
                >
                  <div
                    className="text-[11px] font-medium tracking-wide"
                    style={{ color: "#57534e" }}
                  >
                    进度
                  </div>
                  <div
                    className="mt-1 text-[11px] tabular-nums"
                    style={{ color: "#a8a29e" }}
                  >
                    已答 {progress.answered}/{progress.total} · 平均分{" "}
                    {progress.avg}
                  </div>
                  <div
                    className="mt-2.5 h-[2px] rounded-full overflow-hidden"
                    style={{ background: "#e8e6e1" }}
                  >
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${progressPct}%`,
                        background: "var(--accent, #2e4a3e)",
                      }}
                    />
                  </div>
                  <div className="mt-2.5 grid grid-cols-5 gap-1">
                    {questions.map((q) => {
                      const sc = results[q.qid]?.score;
                      const filled = sc !== undefined;
                      return (
                        <div
                          key={q.qid}
                          className="h-[2px] rounded-full"
                          style={{
                            background: filled
                              ? "var(--accent, #2e4a3e)"
                              : "#e8e6e1",
                            opacity: filled
                              ? sc === 2
                                ? 1
                                : sc === 1
                                  ? 0.55
                                  : 0.25
                              : 1,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧详情卡：白底细边 */}
            <div className="lg:col-span-2 min-w-0">
              <div
                className="rounded-[16px] bg-white overflow-hidden"
                style={{ border: "1px solid #e8e6e1" }}
              >
                <div
                  className="p-5 sm:p-6"
                  style={{
                    borderBottom: "1px solid #e8e6e1",
                    background: "white",
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[11px] tracking-[0.12em] uppercase font-medium"
                      style={{ color: "#a8a29e" }}
                    >
                      {currentQuestion.kind}
                    </span>
                    <span
                      className="text-[11px] tabular-nums"
                      style={{ color: "#a8a29e" }}
                    >
                      Q
                      {questions.findIndex(
                        (x) => x.qid === currentQuestion.qid,
                      ) + 1}{" "}
                      / {questions.length} · qid {currentQuestion.qid}
                    </span>
                    {results[currentQuestion.qid] && (
                      <span
                        className="ml-auto inline-flex items-center gap-2 text-[11px] tabular-nums"
                        style={{ color: "#57534e" }}
                      >
                        <ScoreRing score={results[currentQuestion.qid].score} />
                        <span className="font-medium">
                          {results[currentQuestion.qid].score} / 2
                        </span>
                        <span style={{ color: "#a8a29e" }}>
                          ·{" "}
                          {results[currentQuestion.qid].mode === "llm"
                            ? "LLM"
                            : "规则"}
                        </span>
                      </span>
                    )}
                  </div>
                  <h3
                    className="mt-3 font-serif leading-relaxed"
                    style={{
                      fontFamily:
                        "'Cormorant Garamond','Noto Serif SC', Georgia, serif",
                      fontSize: 20,
                      lineHeight: 1.5,
                      color: "#1c1917",
                      fontWeight: 500,
                    }}
                  >
                    {currentQuestion.q}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {currentQuestion.points.map((p) => (
                      <span
                        key={p}
                        className="px-2.5 py-1 rounded-full border text-[11px]"
                        style={{
                          background: "#fafaf8",
                          borderColor: "#e8e6e1",
                          color: "#78716c",
                        }}
                      >
                        要点 · {p}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-4">
                  <div>
                    <label
                      className="text-[11px] tracking-[0.12em] uppercase font-medium"
                      style={{ color: "#a8a29e" }}
                    >
                      你的回答
                    </label>
                    <textarea
                      value={answers[currentQuestion.qid] ?? ""}
                      onChange={(e) =>
                        setAnswers((a) => ({
                          ...a,
                          [currentQuestion.qid]: e.target.value,
                        }))
                      }
                      placeholder="结合要点作答，建议 50 字以上；200 字以上更易得 2 分。支持分点、举例、量化结果。"
                      rows={6}
                      className="mt-2 w-full rounded-xl p-3.5 text-[14px] leading-relaxed placeholder:text-stone-400 resize-y min-h-[140px]"
                      style={{
                        background: "#fafaf8",
                        border: "1px solid #e8e6e1",
                        outline: "none",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor =
                          "var(--accent, #2e4a3e)";
                        e.currentTarget.style.background = "white";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e8e6e1";
                        e.currentTarget.style.background = "#fafaf8";
                      }}
                    />
                    <div
                      className="mt-2 flex items-center justify-between text-[11px] tabular-nums"
                      style={{ color: "#a8a29e" }}
                    >
                      <span>
                        {(answers[currentQuestion.qid] ?? "").trim().length} 字
                        <span className="hidden sm:inline">
                          {" "}
                          · 50 字得 1 分档，150 字得 2 分档（规则兜底）
                        </span>
                      </span>
                      {(answers[currentQuestion.qid] ?? "").trim().length > 0 &&
                        (answers[currentQuestion.qid] ?? "").trim().length <
                          50 && (
                          <span style={{ color: "#a16207" }}>
                            再补充一点细节可提升分数
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleAnswer}
                      disabled={
                        !quizId ||
                        submitting[currentQuestion.qid] ||
                        !(answers[currentQuestion.qid] ?? "").trim()
                      }
                      className="px-6 h-[40px] rounded-xl text-sm font-medium inline-flex items-center gap-2 transition border border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[#4a5c4e] active:bg-[#3f4f43]"
                      style={{
                        opacity:
                          !quizId ||
                          submitting[currentQuestion.qid] ||
                          !(answers[currentQuestion.qid] ?? "").trim()
                            ? 0.4
                            : 1,
                      }}
                    >
                      {submitting[currentQuestion.qid] && (
                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      )}
                      {submitting[currentQuestion.qid]
                        ? "评分中…"
                        : results[currentQuestion.qid]
                          ? "重新提交"
                          : "提交评分"}
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={
                        questions.findIndex(
                          (q) => q.qid === currentQuestion.qid,
                        ) ===
                        questions.length - 1
                      }
                      className="px-4 h-[40px] rounded-full border bg-white text-sm font-medium hover:bg-[#fafaf8] transition"
                      style={{
                        borderColor: "#e8e6e1",
                        color: "#57534e",
                        opacity:
                          questions.findIndex(
                            (q) => q.qid === currentQuestion.qid,
                          ) ===
                          questions.length - 1
                            ? 0.4
                            : 1,
                      }}
                    >
                      下一题 →
                    </button>
                    <span
                      className="text-[11px] hidden sm:inline tabular-nums"
                      style={{ color: "#a8a29e" }}
                    >
                      防抖 600ms · 空回答禁用提交
                    </span>
                  </div>

                  {answerErrors[currentQuestion.qid] && (
                    <div
                      className="p-3 rounded-xl border text-sm"
                      style={{
                        background:
                          answerErrors[currentQuestion.qid] === "请重新开始"
                            ? "#fafaf8"
                            : "white",
                        borderColor: "#e8e6e1",
                        color: "#57534e",
                      }}
                    >
                      {answerErrors[currentQuestion.qid] === "请重新开始" ? (
                        <span className="text-[13px]">
                          会话已过期 · 请{" "}
                          <button
                            onClick={() =>
                              window.scrollTo({ top: 0, behavior: "smooth" })
                            }
                            className="underline font-medium"
                            style={{ color: "var(--accent, #2e4a3e)" }}
                          >
                            重新开始
                          </button>
                        </span>
                      ) : (
                        <span className="text-[13px]">
                          {answerErrors[currentQuestion.qid]}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 提交后反馈区：180ms 淡入上移 4px */}
                  {results[currentQuestion.qid] && (
                    <div
                      className="space-y-3 s2-fade"
                      key={`${currentQuestion.qid}-${results[currentQuestion.qid].score}`}
                    >
                      <div
                        className="rounded-xl overflow-hidden bg-white"
                        style={{ border: "1px solid #e8e6e1" }}
                      >
                        <div
                          className="px-4 py-3 flex items-center gap-3 flex-wrap"
                          style={{
                            background: "#fafaf8",
                            borderBottom: "1px solid #e8e6e1",
                          }}
                        >
                          <ScoreRing
                            score={results[currentQuestion.qid].score}
                          />
                          <span
                            className="text-[12px] tabular-nums font-medium"
                            style={{ color: "#1c1917" }}
                          >
                            得分 {results[currentQuestion.qid].score} / 2
                          </span>
                          <span
                            className="px-2.5 py-1 rounded-full border text-[11px]"
                            style={{
                              background: "white",
                              borderColor: "#e8e6e1",
                              color: "#78716c",
                            }}
                          >
                            {results[currentQuestion.qid].mode === "llm"
                              ? "LLM 评分"
                              : "规则评分"}
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: "#a8a29e" }}
                          >
                            {results[currentQuestion.qid].score === 2
                              ? "要点覆盖完整"
                              : results[currentQuestion.qid].score === 1
                                ? "部分要点命中"
                                : "需补充要点"}
                          </span>
                        </div>
                        <div className="p-4">
                          <div
                            className="text-[11px] tracking-[0.12em] uppercase font-medium mb-2"
                            style={{ color: "#a8a29e" }}
                          >
                            反馈
                          </div>
                          {/* 左侧 accent 竖线引用块 */}
                          <div
                            className="pl-4 py-1 text-[13px] leading-relaxed whitespace-pre-wrap break-words"
                            style={{
                              borderLeft: "2px solid var(--accent, #2e4a3e)",
                              color: "#44403c",
                            }}
                          >
                            {results[currentQuestion.qid].feedback}
                          </div>
                        </div>
                      </div>

                      {/* followup 多轮线程：历史对话 + 可继续作答输入区 + 追问计数 + 结束本轮 */}
                      <FollowupThread
                        qid={currentQuestion.qid}
                        thread={
                          threads[currentQuestion.qid] ?? [
                            { role: "assistant", text: currentQuestion.q },
                          ]
                        }
                        followup={results[currentQuestion.qid].followup}
                        round={getRound(currentQuestion.qid)}
                        finished={!!finished[currentQuestion.qid]}
                        submitting={!!submitting[currentQuestion.qid]}
                        draft={followupDrafts[currentQuestion.qid] ?? ""}
                        onDraftChange={(id, v) =>
                          setFollowupDrafts((d) => ({ ...d, [id]: v }))
                        }
                        onSubmit={handleFollowupSubmit}
                        onFinish={handleFinishRound}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div
                className="mt-4 flex items-center justify-between text-[11px]"
                style={{ color: "#a8a29e" }}
              >
                <span>
                  Tips：按要点分点回答，带上工具 / 参数 / 量化结果更易拿 2 分。
                </span>
                <span className="hidden sm:inline">
                  快捷：提交后按“下一题”连续作答
                </span>
              </div>
            </div>
          </div>

          {/* 底部 2px 轨道 progress：极简 */}
          <div
            className="mt-6 rounded-xl bg-white p-3 flex items-center justify-between"
            style={{ border: "1px solid #e8e6e1" }}
          >
            <span
              className="text-[13px] tabular-nums"
              style={{ color: "#78716c" }}
            >
              已答{" "}
              <span className="font-medium" style={{ color: "#1c1917" }}>
                {progress.answered}
              </span>{" "}
              / {progress.total} · 平均分{" "}
              <span className="font-medium" style={{ color: "#1c1917" }}>
                {progress.avg}
              </span>
            </span>
            <div
              className="flex-1 mx-4 hidden sm:block h-[2px] rounded-full overflow-hidden"
              style={{ background: "#e8e6e1" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${progressPct}%`,
                  background: "var(--accent, #2e4a3e)",
                }}
              />
            </div>
            <div className="flex gap-1 sm:hidden">
              {questions.map((q) => {
                const sc = results[q.qid]?.score;
                return (
                  <span
                    key={q.qid}
                    className="w-5 h-5 rounded-full grid place-items-center text-[11px] tabular-nums border"
                    style={{
                      background:
                        sc !== undefined
                          ? sc === 2
                            ? "#0f172a"
                            : "white"
                          : "white",
                      color:
                        sc !== undefined
                          ? sc === 2
                            ? "#fafaf8"
                            : sc === 1
                              ? "#1c1917"
                              : "#a8a29e"
                          : "#a8a29e",
                      borderColor:
                        sc !== undefined
                          ? sc === 2
                            ? "#0f172a"
                            : sc === 1
                              ? "var(--accent, #2e4a3e)"
                              : "#e8e6e1"
                          : "#e8e6e1",
                    }}
                  >
                    {sc ?? "–"}
                  </span>
                );
              })}
            </div>
            <span
              className="hidden sm:inline text-[11px] tabular-nums"
              style={{ color: "#a8a29e" }}
            >
              {progressPct}% 完成
            </span>
          </div>
        </div>
      ) : null}

      {/* 空状态引导：素雅虚线 */}
      {!quizId && (
        <div
          className="bg-white rounded-[16px] p-8 text-center"
          style={{ border: "1px dashed #e8e6e1" }}
        >
          <div
            className="w-10 h-10 rounded-full mx-auto grid place-items-center text-sm"
            style={{
              background: "#fafaf8",
              border: "1px solid #e8e6e1",
              color: "#a8a29e",
            }}
          >
            ◑
          </div>
          <div
            className="mt-3 font-serif text-[14px] font-medium"
            style={{ color: "#1c1917" }}
          >
            还没开始面试
          </div>
          <div
            className="mt-1 text-[13px] leading-relaxed"
            style={{ color: "#78716c" }}
          >
            粘贴目标岗位链接后点击“开始面试”，将按该 JD + 同类高频点生成 5 题。
            <br className="hidden sm:block" />
            支持从 <span style={{ color: "#1c1917" }}>匹配诊断页</span>{" "}
            点击岗位一键跳转并自动填充。
          </div>
        </div>
      )}

      <div
        className="text-[11px] text-center leading-relaxed tabular-nums"
        style={{ color: "#a8a29e" }}
      >
        后端 127.0.0.1:8321 · vite proxy /api → 8321 · 无 Key 自动降级为规则评分
        · 满分 2 分档（50 / 150 字）
      </div>
    </div>
  );
}
