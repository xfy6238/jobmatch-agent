export type ThreadMsg = {
  role: "user" | "assistant";
  text: string;
  score?: number;
};

export const MAX_FOLLOWUP_ROUNDS = 2;

type Props = {
  qid: number;
  thread: ThreadMsg[];
  /** 最新一轮的 followup 文本（来自 results[qid].followup） */
  followup: string;
  /** 已完成的追问轮次 = assistant 反馈条数（不含首条题干） */
  round: number;
  finished: boolean;
  submitting: boolean;
  draft: string;
  onDraftChange: (qid: number, v: string) => void;
  onSubmit: (qid: number) => void;
  onFinish: (qid: number) => void;
};

/**
 * 题内多轮追问线程（素雅 sage 体系）：
 * - assistant 消息：左对齐 + accent 左引用线
 * - user 消息：右对齐纸白气泡
 * - followup 输入区：暖纸底 + 11px muted 追问计数
 */
export default function FollowupThread({
  qid,
  thread,
  followup,
  round,
  finished,
  submitting,
  draft,
  onDraftChange,
  onSubmit,
  onFinish,
}: Props) {
  const reachedCap = round >= MAX_FOLLOWUP_ROUNDS;
  const canSubmit =
    draft.trim().length > 0 && !submitting && !finished && !reachedCap;

  return (
    <div className="space-y-3">
      {/* 多轮对话记忆 */}
      <div className="space-y-2">
        {thread.map((m, i) =>
          m.role === "assistant" ? (
            <div
              key={i}
              className="pl-4 py-1 text-[13px] leading-relaxed whitespace-pre-wrap break-words"
              style={{
                borderLeft: "2px solid var(--accent, #2e4a3e)",
                color: "#44403c",
              }}
            >
              {m.text}
              {typeof m.score === "number" && (
                <span
                  className="ml-2 text-[11px] tabular-nums"
                  style={{ color: "#a8a29e" }}
                >
                  · 得分 {m.score}/2
                </span>
              )}
            </div>
          ) : (
            <div key={i} className="flex justify-end">
              <div
                className="max-w-[92%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words"
                style={{
                  background: "white",
                  border: "1px solid #e8e6e1",
                  color: "#1c1917",
                }}
              >
                {m.text}
              </div>
            </div>
          ),
        )}
      </div>

      {/* followup：暖纸虚线框，不再是静态文本 */}
      <div
        className="rounded-xl p-4"
        style={{ background: "#fafaf8", border: "1px dashed #e8e6e1" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[11px] tracking-[0.12em] uppercase font-medium"
            style={{ color: "#78716c" }}
          >
            追问
          </span>
          <span
            className="text-[11px] tabular-nums"
            style={{ color: "#a8a29e" }}
          >
            {Math.min(round, MAX_FOLLOWUP_ROUNDS)}/{MAX_FOLLOWUP_ROUNDS}
            {finished
              ? " · 本轮已结束"
              : reachedCap
                ? " · 已达上限"
                : " · 可继续作答加深"}
          </span>
          {!finished && (
            <button
              onClick={() => onFinish(qid)}
              className="ml-auto px-3 py-1 rounded-full bg-white border text-[11px] font-medium hover:bg-stone-50 transition"
              style={{ borderColor: "#e8e6e1", color: "#57534e" }}
            >
              结束本轮
            </button>
          )}
        </div>
        <div
          className="mt-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words italic"
          style={{ color: "#57534e" }}
        >
          {followup}
        </div>

        {!finished && !reachedCap && (
          <div className="mt-3">
            <textarea
              value={draft}
              onChange={(e) => onDraftChange(qid, e.target.value)}
              placeholder="针对上方追问继续作答，同一题内可多轮…"
              rows={3}
              className="w-full rounded-xl p-3 text-[13px] leading-relaxed placeholder:text-stone-400 resize-y min-h-[76px]"
              style={{
                background: "#fffdf8",
                border: "1px solid #e8e6e1",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent, #2e4a3e)";
                e.currentTarget.style.background = "white";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e8e6e1";
                e.currentTarget.style.background = "#fffdf8";
              }}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => onSubmit(qid)}
                disabled={!canSubmit}
                className="px-5 h-[36px] rounded-xl text-[13px] font-medium inline-flex items-center gap-2 transition border border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[#4a5c4e] active:bg-[#3f4f43]"
                style={{ opacity: canSubmit ? 1 : 0.4 }}
              >
                {submitting && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                )}
                {submitting ? "评分中…" : "追问作答"}
              </button>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: "#a8a29e" }}
              >
                {draft.trim().length} 字 · 仍调 quizAnswer（同 quiz_id/qid）
              </span>
            </div>
          </div>
        )}
        {reachedCap && !finished && (
          <div className="mt-2 text-[11px]" style={{ color: "#a8a29e" }}>
            已达本轮追问上限，可结束本轮后做下一题。
          </div>
        )}
      </div>
    </div>
  );
}
