# 求职 Agent · 技术方案（开源示例版）

> 关键词：单体可演示优先，不 over-engineering。文件映射见 §7。

## 1. 架构（文字图）

```
[Web 对话框]
        │ ① 提问（画像/JD选择/回答）
        ▼
[FastAPI 网关] ── 会话记忆（内存 _sessions 缓存 + SQLite sessions 表持久化，见 memory.py）
        │
        ├─→ [LangGraph 编排] 意图路由 → S1匹配 / S2面试
        │       ├ S1：画像解析 → 向量检索(Top20) → 规则排序(fit/薪资/活跃) → 生成缺口
        │       └ S2：读指定JD → 同类高频点 → 出题 → 追问 → 打分
        │
        ├─→ [混合检索] 向量（Chroma，可选灌库）+ 自研 BM25 加权（α=0.6，见 hybrid.py）
        │       切片：按句聚合（`CHUNK_SIZE`/`CHUNK_OVERLAP` 环境变量可调，
        │       默认 800/100），保留 company/title/url 元数据，引用可回跳
        │
        └─→ [本地工具：无外部依赖]
             • salary_tool：薪资中位/分布
             • active_tool：活跃度排序（activeMins）
             • fit_tool：fit→active→salary 规则重排
[大模型] 仅做生成（缺口话术/面试题/打分），检索排序走本地规则，保证无Key可降级演示
```

## 2. 数据流

- 灌库（可选）：`data/sample_jobs.json` + 可选详情 JD → 按句聚合切片 → Chroma（幂等重建）。
  不灌库也能跑：检索失败自动回退“全库规则排序”。
- S1：画像 embedding → 检索 Top20 → fit 重排 → 取 Top3 →（有 Key 则）大模型写理由/缺口。
- S2：指定 JD（正文/标题+技能）+ 高频词（RAG/Prompt/部署/MCP）→ 出 5 题 → 逐答 → 按要点打分。

## 3. Prompt 模板（写死 3 个）

- `match_prompt`：只基于给定 JD 片段推荐，禁止编造公司名；每条带“引用：标题+公司+薪资”；缺口落到 RAG/Prompt/MCP/部署等。
- `quiz_prompt`：出 5 题（2 项目深挖 + 2 技术 + 1 场景），带考察点和参考要点。
- `score_prompt`：按要点逐条打分（0/1/2），只给改进动作。

## 4. 接口（4 个）

- `GET /api/health` 健康（岗位数/LLM 可用性）。
- `POST /api/match` {profile, filters} → {top3[{title,company,salary,active,url,reasons,gaps}]}。
- `POST /api/quiz/start` {jobUrl} → {questions[5]}。
- `POST /api/quiz/answer` {qid, answer} → {score, feedback, followup}。

## 5. 非功能与风险

- 无爬虫、不做自动投递；样例数据全虚构；简历只存本地内存/SQLite。
- 降级：无 Key 返回检索+规则结果，照样演示排序逻辑。
- 成本：Chroma 本地；LLM 仅生成调用，可配任意 OpenAI 兼容 Responses API（`LLM_BASE_URL`/`LLM_MODEL`）。

## 6. 技术栈

| 技术 | 版本 | 用在哪 |
| --- | --- | --- |
| FastAPI / Uvicorn | 见 `backend/requirements.txt` | 4 接口，`127.0.0.1:8321` |
| ChromaDB PersistentClient | 1.5.9 | 本地向量库 `backend/chroma_db/`（gitignore） |
| LangGraph StateGraph | — | `backend/graph.py`，编译失败多级回退 |
| SQLite3（标准库） | 内置 | `backend/sessions.db`（gitignore），异常回退内存 |
| 自研 BM25 + 向量加权 | 无外部依赖 | `backend/hybrid.py`，`HYBRID_ALPHA`/`HYBRID_ENABLED` 可灰度 |
| Vite + React 19 + TS + Tailwind | 见 `web/package.json` | 三页：`/` 匹配 S1、`/quiz` 面试 S2、`/jobs` 岗位库 |

## 7. 落地文件映射

| 文件 | 职责 |
| --- | --- |
| `backend/app.py` | FastAPI 4 接口 + 混合检索接入 + 会话接线 |
| `backend/graph.py` | LangGraph 状态图（S1/S2/统一图） |
| `backend/hybrid.py` | BM25 索引 + 向量/BM25 加权混合 |
| `backend/memory.py` | SQLite 长记忆 |
| `backend/ingest.py` | 按句聚合切片 + Chroma 灌库 |
| `backend/tools.py` | fit/salary/active 本地工具 |
| `backend/eval.py` | 固定 10 题评测（`python3 backend/eval.py`） |
| `web/src/features/{match,quiz,jobs}` | 三页前端 |
