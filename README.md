# JobMatch Agent — 求职匹配诊断 + 模拟面试（开源示例版）

> 输入一句话画像，输出 Top3 匹配岗位 + 缺口分析；指定任一 JD，5 道面试题 + 打分追问。
> 后端 FastAPI + ChromaDB + LangGraph + 自研 BM25 混合检索；前端 Vite + React 19 + TS。
> **无 API Key 也能完整演示**（检索+规则排序 `rules` 模式）；有 Key 则生成话术走大模型。

![license](https://img.shields.io/badge/license-MIT-green)
![python](https://img.shields.io/badge/python-3.10%2B-blue)
![node](https://img.shields.io/badge/node-20%2B-green)

## 开箱演示（5 分钟）

```bash
git clone https://github.com/xfy6238/jobmatch-agent.git
cd jobmatch-agent
./run_demo.sh   # ingest → 后端 8321 → 前端 5173/5174 → 自动打开浏览器
```

* 三页：`/` 匹配诊断 S1｜`/quiz` 模拟面试 S2｜`/jobs` 岗位库（20 条虚构示例）。
* 无 Key 评测：`cd backend && python3 eval.py` —— 规则模式应 **10/10**。
* 数据：`data/sample_jobs.json`（20 条**虚构**公司/薪资/`example.com` 链接）。
  换成你自己的 JD 见 `data/README.md`（同 schema 的 JSON + `export JOBS_JSON=...` 即可）。

## 目录

* `backend/` — `app.py`（4 接口）/`graph.py`（LangGraph）/`hybrid.py`（BM25+向量）/
  `ingest.py`（切片灌库）/`memory.py`（SQLite 会话）/`tools.py`（本地规则）/`eval.py`（10 题评测）
* `web/` — 三页前端（`src/features/{match,quiz,jobs}`）
* `data/` — `sample_jobs.json` 虚构样例 + `README.md` 字段说明
* `docs/` — `01-prd.md` / `02-architecture.md` / `03-plan-eval.md`

## 环境变量（都有缺省，开箱不用配）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `JOBS_JSON` | `data/sample_jobs.json` | 岗位库 |
| `OPENAI_API_KEY` / `LLM_API_KEY` | — | 有则大模型生成，无则 rules 降级 |
| `LLM_BASE_URL` / `LLM_MODEL` | 见 `docs/03-plan-eval.md` | 可换任意 OpenAI 兼容 Responses API |
| 更多 | — | `CHROMA_DIR` / `HYBRID_ALPHA` / `MEMORY_DB` 等见 `docs/03-plan-eval.md` |

## 声明

* 样例数据全虚构；请勿提交真实抓取的 JD（`data/*.json` 除样例外已 gitignore）。
* 本项目不含爬虫、不做自动投递，仅做匹配诊断与面试练习。
