export interface Job {
  title: string;
  company: string;
  salary: string;
  sal_mid?: number;
  district?: string;
  url: string;
  activeDesc?: string;
  activeMins?: number;
  fit?: number;
  tier?: string;
  keyword?: string;
  skills?: string[];
  source?: string;
  exp?: string;
  edu?: string;
}

export interface MatchItem {
  title: string;
  company: string;
  salary: string;
  active?: string;
  url: string;
  fit?: number;
  reasons: string[];
  gaps: string[];
  cite: string;
}

export interface MatchResponse {
  top3: MatchItem[];
  polish: string | null;
  mode: "llm" | "rules";
}

export interface QuizQuestion {
  qid: number;
  kind: string;
  q: string;
  points: string[];
}

export interface QuizStartResponse {
  quiz_id: string;
  job: Partial<Job>;
  hot: string[];
  questions: QuizQuestion[];
  llm: string | null;
}

export interface QuizAnswerResponse {
  score: number;
  feedback: string;
  followup: string;
  mode: "llm" | "rules";
  error?: string;
}

export interface HealthResponse {
  ok: boolean;
  jobs?: number;
  llm?: boolean;
  model?: string;
  error?: string;
}
