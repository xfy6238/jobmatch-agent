# 求职 Agent · 开发计划与评测（开源示例版）

> 里程碑按“每天都有可演示增量”切分。评测集固定 10 题（`backend/eval.py`），跑分即交付证据。

## M1 数据灌库（可选）

- `backend/ingest.py` 读 `data/sample_jobs.json`（20 条虚构样例）+ 可选详情 JD，
  按句聚合切片写入 Chroma，保留 url/company/salary 元数据。
- 不灌库也能演示：检索失败自动回退全库规则排序。

## M2 匹配诊断

- `fit/salary/active` 本地规则（fit→active→salary），无 Key 可返回 Top3。
- 有 Key 则接生成（理由/缺口），强制引用 JD 原文、禁编造公司名。

## M3 模拟面试

- `POST /api/quiz/start` 按指定 JD + 高频点出 5 题；`answer` 打分+追问；会话进 SQLite。

## M4 纵深（已含）

- `graph.py` LangGraph 状态图（S1/S2/统一图，三级回退）。
- `hybrid.py` 自研 BM25 + 向量加权混合（默认 α=0.6，`backend/hybrid_alpha.txt`）。
- 题内多轮追问（`FollowupThread`）。

## 评测集（固定 10 题，`python3 backend/eval.py`）

- 匹配类 5 题：默认画像 Top3 可用（每条带 url、公司名无“某”占位）；
  缺口命中 RAG/Prompt/MCP；17K 以下默认不出现；引用含标题/公司/薪资；无 Key 降级 `rules`。
- 面试类 5 题：指定 JD 出 5 题；hot 命中；长回答得 2 分；反馈与追问非空；错误 quiz_id 容错。
- 计分：每题 0/1，≥8 分可演示。样例库上规则模式应 **10/10**。

## 环境变量速查

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `JOBS_JSON` | `data/sample_jobs.json` | 岗位库 |
| `BOSS_DETAILS` / `LIEPIN_DETAILS` | `/tmp/*.json`（可无） | 详情 JD 正文（可选） |
| `CHROMA_DIR` | `backend/chroma_db` | 向量库目录 |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `800` / `100` | 切片参数 |
| `HYBRID_ALPHA` / `HYBRID_ENABLED` | `0.6` / `true` | 混合检索权重/开关 |
| `MEMORY_DB` | `backend/sessions.db` | 会话库 |
| `OPENAI_API_KEY` / `LLM_API_KEY` | — | 有则走大模型生成，无则 rules |
| `LLM_BASE_URL` / `LLM_MODEL` | opencode 兼容端点/模型 | 可换任意 OpenAI 兼容 Responses API |
| `SKIP_INGEST` | — | 置 1 则 `run_demo.sh` 跳过灌库 |
