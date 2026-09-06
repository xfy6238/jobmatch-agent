import type {
  HealthResponse,
  MatchResponse,
  QuizAnswerResponse,
  QuizStartResponse,
} from "../types";

const BASE = "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${txt.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<HealthResponse>("/api/health"),
  match: (profile: string, filters?: Record<string, unknown>) =>
    req<MatchResponse>("/api/match", {
      method: "POST",
      body: JSON.stringify({ profile, filters }),
    }),
  quizStart: (jobUrl: string) =>
    req<QuizStartResponse>("/api/quiz/start", {
      method: "POST",
      body: JSON.stringify({ jobUrl }),
    }),
  quizAnswer: (quiz_id: string, qid: number, answer: string) =>
    req<QuizAnswerResponse>("/api/quiz/answer", {
      method: "POST",
      body: JSON.stringify({ quiz_id, qid, answer }),
    }),
  // jobs直接读enriched json由前端加载，或通过后端health扩展；此处提供本地加载兜底
};
