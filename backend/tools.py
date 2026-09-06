"""本地工具：salary / active / fit，复用 HTML 面板现有规则，无外部依赖."""

import json
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_JSON = os.environ.get(
    "JOBS_JSON",
    os.path.join(BASE_DIR, "..", "data", "sample_jobs.json"),
)

_KW_MEDIAN = {
    "AI开发": 23.5,
    "AI Agent": 23.0,
    "大模型": 22.5,
    "AI应用开发": 22.5,
    "Flutter": 20.0,
    "前端": 21.5,
    "客户端": 22.5,
}

_jobs_cache = None


def load_jobs():
    global _jobs_cache
    if _jobs_cache is None:
        try:
            with open(JOBS_JSON, encoding="utf-8") as f:
                _jobs_cache = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
            raise RuntimeError(f"cannot read jobs data {JOBS_JSON}: {e}") from e
    return _jobs_cache


def parse_mid(salary):
    if not salary:
        return None
    m = re.search(r"(\d+)-(\d+)[Kk]", salary)
    if not m:
        return None
    try:
        return (int(m.group(1)) + int(m.group(2))) / 2
    except ValueError:
        return None


def salary_tool(keyword=None):
    """返回薪资中位：指定关键词或全量."""
    jobs = load_jobs()
    if keyword:
        vals = [
            j.get("sal_mid")
            for j in jobs
            if j.get("keyword") == keyword and j.get("sal_mid")
        ]
    else:
        vals = [j.get("sal_mid") for j in jobs if j.get("sal_mid")]
    vals = sorted(v for v in vals if v is not None)
    median = vals[len(vals) // 2] if vals else None
    return {
        "keyword": keyword or "全量",
        "median": median,
        "kw_table": dict(_KW_MEDIAN),
    }


def active_rank(job):
    mins = job.get("activeMins", 99999)
    try:
        mins = int(mins)
    except (TypeError, ValueError):
        mins = 99999
    return mins


def fit_rerank(candidates, limit=3):
    """复用面板规则：fit↓ → active↑ → salary↓."""

    def key(j):
        try:
            fit = float(j.get("fit") or 0)
        except (TypeError, ValueError):
            fit = 0
        mid = j.get("sal_mid") or parse_mid(j.get("salary", "")) or 0
        return (-fit, active_rank(j), -(mid or 0))

    ranked = sorted(candidates, key=key)
    return ranked[:limit]


def gap_analysis(profile_text, job):
    """规则版缺口分析：命中 RAG/Prompt/MCP/部署/语言五选."""
    text = ((profile_text or "") + " " + " ".join(job.get("skills", []))).lower()
    title = job.get("title", "")
    gaps, reasons = [], []
    checks = [
        ("RAG/检索", ["rag", "检索", "向量"]),
        ("Prompt 工程", ["prompt", "提示词"]),
        ("MCP/工具调用", ["mcp", "tool", "工具调用"]),
        ("推理部署", ["docker", "k8s", "部署", "推理"]),
        ("LangChain", ["langchain", "langgraph"]),
    ]
    for label, kws in checks:
        if not any(k in text for k in kws):
            gaps.append(f"缺{label}：JD 要 {label}，画像未体现，建议补 Demo")
        else:
            reasons.append(f"匹配{label}")
    if "AI" in title or "Agent" in title:
        reasons.append("方向匹配：AI 应用/Agent")
    if job.get("district") in ("滨江区", "余杭区", "西湖区"):
        reasons.append(f"区域匹配：{job.get('district')}")
    return reasons[:3], gaps[:3]
