# 数据说明

## 开箱即用：`sample_jobs.json`（20 条虚构样例）

- 所有公司名、薪资、链接均为**虚构**（`example.com` 占位），仅用于跑通匹配→面试→评测全链路。
- 默认画像（`backend/app.py` 的 `DEFAULT_PROFILE`）：`3年 Python后端 + RAG问答项目 + LangChain + Docker部署`，
  在样例库上的期望 Top3 是 `samp-01 / samp-02 / samp-03`（或同档高优岗）。

## 换成你自己的 JD（推荐）

JSON 须为数组，每条至少含以下字段（与 `backend/tools.py` 的排序/过滤逻辑对应）：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `title` | 岗位标题 | `AI Agent应用开发工程师` |
| `company` | 公司名（勿用“某”“—”占位，后端会过滤） | `云杉示例科技` |
| `salary` | 薪资文本，需含 `xx-yyK` 区间以便解析 | `20-40K` |
| `sal_mid` | 薪资中位（可空，后端回退解析 `salary`） | `30.0` |
| `url` | 唯一键 + 引用回跳 | `https://example.com/jobs/samp-01` |
| `skills` | 技能**数组**（缺口/热点分析用） | `["Python","RAG","Docker"]` |
| `keyword` | 分类（前端筛选项用） | `AI Agent` |
| `fit` | 匹配分（排序第一键） | `9` |
| `activeMins` | HR 活跃分钟数（排序第二键，越小越活跃） | `5` |
| `district` / `activeDesc` / `source` / `exp` / `edu` / `industry` / `scale` | 展示与筛选 | — |

```bash
export JOBS_JSON=/path/to/your_jobs.json
python3 backend/ingest.py   # 可选：建向量库；不建也能跑（自动回退规则排序）
python3 backend/eval.py     # 10 题评测
```

把大库放 `data/` 下自用即可：`data/*.json`（除样例外）已在 `.gitignore` 中，**不要提交真实抓取数据**。
