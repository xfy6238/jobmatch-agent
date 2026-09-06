"""求职Agent LangGraph 状态图：固定 S1→S2 重构.

S1 分支: parse → retrieve → rerank → polish → END
S2 分支: quiz_build → END
另提供统一图 unified_graph，按 job_url 是否为空路由（条件边）。

- 节点为纯函数，复用 tools/app 相同规则（不直接实现 LLM，由 _local_llm_generate 统一走 Responses API，无 Key 秒回 None）。
- run_s1 / run_s2 保持与 app.match_jobs / app.quiz_start 完全一致的返回 shape，前端零改。
- langgraph 未安装或编译失败时，run_* 自动回退到 app 原逻辑（再回退本地复刻逻辑），保证可演示。
"""

import importlib.util
import json
import os
import re
import urllib.request
import uuid
from typing import Any
from urllib.parse import urlparse

try:
    from typing import TypedDict  # py3.13 内置
except ImportError:  # pragma: no cover
    from typing_extensions import TypedDict  # type: ignore

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_sibling_tools():
    path = os.path.join(BASE_DIR, "tools.py")
    spec = importlib.util.spec_from_file_location("jobagent_tools_g", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load tools module from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_tools = _load_sibling_tools()
fit_rerank = _tools.fit_rerank
gap_analysis = _tools.gap_analysis
load_jobs = _tools.load_jobs
parse_mid = _tools.parse_mid

JOBS_JSON = os.environ.get(
    "JOBS_JSON",
    os.path.join(BASE_DIR, "..", "data", "sample_jobs.json"),
)
BOSS_DETAILS = os.environ.get("BOSS_DETAILS", "/tmp/ai_agent_boss_details.json")  # noqa: S108
LIEPIN_DETAILS = os.environ.get("LIEPIN_DETAILS", "/tmp/ai_agent_liepin_details.json")  # noqa: S108
CHROMA_DIR = os.environ.get("CHROMA_DIR", os.path.join(BASE_DIR, "chroma_db"))
DEFAULT_PROFILE = "3年 Python后端 + RAG问答项目 + LangChain + Docker部署"

LLM_BASE = os.environ.get("LLM_BASE_URL", "https://opencode.ai/zen/go/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "muse-spark-1.3-contributor")
LLM_KEY_FILE = os.environ.get("LLM_KEY_FILE", "/tmp/pi_auth_copy.json")  # noqa: S108


# ---------- 混合检索接入（与 app.py 同规则：HYBRID_ENABLED + 懒导 hybrid） ----------
def _parse_hybrid_alpha(raw, default=0.6):
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return default
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _parse_hybrid_enabled(raw, default=True):
    if raw is None:
        return default
    return str(raw).strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
        "disable",
        "disabled",
    )


HYBRID_ALPHA = _parse_hybrid_alpha(os.environ.get("HYBRID_ALPHA", 0.6), default=0.6)
HYBRID_ENABLED = _parse_hybrid_enabled(
    os.environ.get("HYBRID_ENABLED", "true"), default=True
)


def _load_sibling_hybrid_g():
    path = os.path.join(BASE_DIR, "hybrid.py")
    spec = importlib.util.spec_from_file_location("jobagent_hybrid_g", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load hybrid module from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _current_hybrid_alpha_g():
    if "HYBRID_ALPHA" in os.environ:
        return _parse_hybrid_alpha(os.environ.get("HYBRID_ALPHA"), default=HYBRID_ALPHA)
    return HYBRID_ALPHA


def _current_hybrid_enabled_g():
    if "HYBRID_ENABLED" in os.environ:
        return _parse_hybrid_enabled(
            os.environ.get("HYBRID_ENABLED"), default=HYBRID_ENABLED
        )
    return HYBRID_ENABLED


def _hybrid_retrieve_urls_g(query, top_k=20) -> list[str]:
    """graph 侧混合检索：优先 app.hybrid_retrieve_urls，其次直调 hybrid，失败抛给调用方回退。"""
    if not _current_hybrid_enabled_g():
        raise RuntimeError("hybrid disabled")
    try:
        import app as _app  # type: ignore

        fn = getattr(_app, "hybrid_retrieve_urls", None)
        if callable(fn):
            got = fn(query, top_k=top_k)
            if isinstance(got, list) and got:
                return [str(u) for u in got if u]
    except Exception as _e:  # noqa: BLE001 - app 委托失败则直调 hybrid
        print(f"[retrieve] app hybrid delegate fallback: {_e}")
    try:
        import hybrid as _hyb  # type: ignore
    except ImportError:
        _hyb = _load_sibling_hybrid_g()
    return (
        _hyb.hybrid_retrieve(query, top_k=top_k, alpha=_current_hybrid_alpha_g()) or []
    )


# 预编译热点正则（静态白名单，与 app._HOT_PATTERNS 一致）
_HOT_PATTERNS = [
    ("RAG", re.compile(r"rag|检索|向量", re.I)),
    ("Prompt", re.compile(r"prompt|提示词", re.I)),
    ("部署", re.compile(r"docker|k8s|部署|推理", re.I)),
    ("MCP", re.compile(r"mcp|tool|工具调用", re.I)),
]

_Q_TEMPLATES = [
    (
        "项目深挖",
        "讲一个你从0到1落地的 AI 应用：需求、架构（RAG/工具/记忆怎么拆）、你负责哪块？",
    ),
    ("RAG", "RAG 切片多大、向量库用的哪个？引用漂移时你怎么排查？"),
    ("Prompt", "Prompt 模板怎么收敛幻觉？禁编造公司名这类约束你怎么写？"),
    ("部署", "推理部署怎么做（Docker/K8s）？延迟/成本怎么 trade-off？"),
    ("场景", "HR 3天没回，你的跟进话术是什么？结合这个 JD 的业务说。"),
]

# 图内会话备份（主存仍写 app._sessions，保证 app.quiz_answer 可读）
_GRAPH_SESSIONS: dict[str, dict[str, Any]] = {}


# ---------- State ----------
class GraphState(TypedDict, total=False):
    profile: str
    filters: dict
    top3: list
    polish: str | None
    mode: str
    job_url: str
    job: dict
    hot: list
    questions: list
    quiz_id: str
    scores: dict
    followups: dict
    # 内部流转（允许透传，不污染 run_* 返回 shape）
    llm: str | None
    _pool: list
    _urls: list
    _trace: list


# ---------- 本地复刻 helpers（与 app.py 同规则，便于无 app 导入时独立运行） ----------
def _resolve_key():
    key = (
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("LLM_API_KEY")
        or os.environ.get("OPENCODE_API_KEY")
    )
    if key:
        return key
    try:
        with open(LLM_KEY_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("opencode-go", {}).get("key")
    except (FileNotFoundError, json.JSONDecodeError, OSError, AttributeError):
        return None


def _extract_text(data):
    for part in data.get("output", []):
        if part.get("type") != "message":
            continue
        texts = [c.get("text", "") for c in part.get("content", []) if c.get("text")]
        if texts:
            return "\n".join(texts).strip()
    return ""


def _local_llm_generate(system, user, max_tokens=800):
    """与 app.llm_generate 同语义：无 Key 秒回 None；异常回 None。"""
    # 优先复用 app 实现（懒导入，避免循环 import）
    try:
        import app as _app  # type: ignore

        if hasattr(_app, "llm_generate"):
            return _app.llm_generate(system, user, max_tokens=max_tokens)
    except Exception as _e:  # noqa: BLE001 - app 不可用则走本地 Responses 实现
        print(f"[llm] app delegate fallback: {_e}")
    api_key = _resolve_key()
    if not api_key:
        return None
    parts = urlparse(LLM_BASE)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        print("[llm] refuse non-http endpoint")
        return None
    endpoint = parts.geturl().rstrip("/") + "/responses"
    payload = json.dumps(
        {
            "model": LLM_MODEL,
            "input": f"{system}\n\n{user}",
            "max_output_tokens": max(8192, max_tokens * 8),
        }
    ).encode()
    try:
        req = urllib.request.Request(  # noqa: S310 - scheme allow-listed
            endpoint,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310
            data = json.loads(resp.read().decode())
        if data.get("error"):
            print(f"[llm] api error: {data['error']}")
            return None
        text = _extract_text(data)
        return text or None
    except Exception as e:  # noqa: BLE001 - 降级规则模板
        print(f"[llm] fallback to rules: {e}")
        return None


def _local_retrieve_urls(profile, top_k=20) -> list[str]:
    # 优先走混合（与 app.hybrid_retrieve_urls 同规则），失败回退原 app.retrieve_urls
    try:
        hyb_urls: list[str] = _hybrid_retrieve_urls_g(profile, top_k=top_k)
        if hyb_urls:
            return list(hyb_urls)
    except Exception as _he:  # noqa: BLE001 - 禁用/异常则回退纯向量
        print(f"[retrieve] hybrid fallback: {_he}")
    try:
        import app as _app  # type: ignore

        if hasattr(_app, "retrieve_urls"):
            return _app.retrieve_urls(profile, top_k=top_k) or []
    except Exception as _e:  # noqa: BLE001 - 回退本地 chroma 检索
        print(f"[retrieve] app delegate fallback: {_e}")
    try:
        import chromadb

        client = chromadb.PersistentClient(path=CHROMA_DIR)
        col = client.get_collection("jobs")
        res = col.query(query_texts=[profile], n_results=top_k)
        metas = (res.get("metadatas") or [[]])[0]
        urls, seen = [], set()
        for m in metas:
            u = (m or {}).get("url")
            if u and u not in seen:
                seen.add(u)
                urls.append(u)
        return urls
    except Exception as e:  # noqa: BLE001
        print(f"[retrieve] fallback: {e}")
        return []


def _local_job_by_url(url: str) -> dict[str, Any] | None:
    try:
        import app as _app  # type: ignore

        if hasattr(_app, "_job_by_url"):
            return _app._job_by_url(url)
    except Exception as _e:  # noqa: BLE001 - 回退本地 load_jobs 查找
        print(f"[job] app delegate fallback: {_e}")
    try:
        for j in load_jobs():
            if j.get("url") == url:
                return j
    except Exception:
        return None
    return None


def _local_jd_text(url: str) -> str:
    try:
        import app as _app  # type: ignore

        if hasattr(_app, "_jd_text"):
            return _app._jd_text(url) or ""
    except Exception as _e:  # noqa: BLE001 - 回退本地 JSON 详情查找
        print(f"[jd] app delegate fallback: {_e}")
    for path in (BOSS_DETAILS, LIEPIN_DETAILS):
        try:
            with open(path, encoding="utf-8") as f:
                items = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            continue
        for it in items:
            if it.get("url") == url and len(it.get("postDescription", "")) >= 500:
                return it["postDescription"]
    return ""


def _persist_quiz_session(qid, job, questions, hot, llm_q):
    """会话同时写 app._sessions（保证 quiz_answer 可读）+ 本地备份 + memory 落盘。"""
    _GRAPH_SESSIONS[qid] = {"job": job, "questions": questions, "scores": {}}
    try:
        import app as _app  # type: ignore

        if hasattr(_app, "_sessions"):
            _app._sessions[qid] = {"job": job, "questions": questions, "scores": {}}
        _mem = getattr(_app, "_memory", None)
        if _mem is not None:
            try:
                _mem.save_session(qid, job, questions, hot, llm_q)
            except Exception as e:  # noqa: BLE001
                print(f"[memory] save fallback: {e}")
            return
    except Exception as e:  # noqa: BLE001
        print(f"[persist] app sessions fallback: {e}")
    # app 不可用时，直写 memory.py（与 app 同表结构）
    try:
        path = os.path.join(BASE_DIR, "memory.py")
        spec = importlib.util.spec_from_file_location("jobagent_memory_g", path)
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            mod.save_session(qid, job, questions, hot, llm_q)
    except Exception as e:  # noqa: BLE001
        print(f"[memory] direct save fallback: {e}")


# ---------- 节点函数（纯函数：输入 state dict → 返回增量 dict） ----------
def n_parse(state: GraphState) -> dict[str, Any]:
    trace = list(state.get("_trace") or []) + ["parse"]
    profile = state.get("profile") or ""
    if not isinstance(profile, str):
        profile = str(profile)
    profile = profile.strip() or DEFAULT_PROFILE
    filters = state.get("filters") or {}
    if not isinstance(filters, dict):
        filters = {}
    else:
        filters = dict(filters)
    job_url = state.get("job_url") or ""
    if not isinstance(job_url, str):
        job_url = str(job_url)
    job_url = job_url.strip()
    return {"profile": profile, "filters": filters, "job_url": job_url, "_trace": trace}


def n_retrieve(state: GraphState) -> dict[str, Any]:
    trace = list(state.get("_trace") or []) + ["retrieve"]
    profile = state.get("profile") or DEFAULT_PROFILE
    urls = _local_retrieve_urls(profile, top_k=20)
    pool = [_local_job_by_url(u) for u in urls]
    pool = [j for j in pool if j]
    if len(pool) < 10:
        try:
            jobs = load_jobs()
        except Exception:
            jobs = []
        ids = {j.get("url") for j in pool}
        pool += [j for j in jobs if j.get("url") not in ids]
    return {"_pool": pool, "_urls": urls, "_trace": trace}


def n_rerank(state: GraphState) -> dict[str, Any]:
    trace = list(state.get("_trace") or []) + ["rerank"]
    profile = state.get("profile") or DEFAULT_PROFILE
    filters = state.get("filters") or {}
    if not isinstance(filters, dict):
        filters = {}
    pool = state.get("_pool")
    if pool is None:
        urls = _local_retrieve_urls(profile, top_k=20)
        pool = [_local_job_by_url(u) for u in urls]
        pool = [j for j in pool if j]
        if len(pool) < 10:
            try:
                jobs = load_jobs()
            except Exception:
                jobs = []
            ids = {j.get("url") for j in pool}
            pool += [j for j in jobs if j.get("url") not in ids]
    min_mid = filters.get("min_mid", 17)
    keyword = filters.get("keyword")
    cand = []
    for j in pool:
        company = (j.get("company") or "").strip()
        if not company or company == "—" or "某" in company:
            continue
        mid = j.get("sal_mid") or parse_mid(j.get("salary", ""))
        if min_mid and mid and mid < min_mid:
            continue
        if keyword and j.get("keyword") != keyword:
            continue
        cand.append(j)
    top_raw = fit_rerank(cand, limit=3)
    out = []
    for j in top_raw:
        reasons, gaps = gap_analysis(profile, j)
        out.append(
            {
                "title": j.get("title"),
                "company": j.get("company"),
                "salary": j.get("salary"),
                "active": j.get("activeDesc"),
                "url": j.get("url"),
                "fit": j.get("fit"),
                "reasons": reasons,
                "gaps": gaps,
                "cite": f"引用：{j.get('title')} · {j.get('company')} · {j.get('salary')}",
            }
        )
    return {"top3": out, "_trace": trace}


def n_polish(state: GraphState) -> dict[str, Any]:
    trace = list(state.get("_trace") or []) + ["polish"]
    profile = state.get("profile") or DEFAULT_PROFILE
    top3 = state.get("top3") or []
    polished = _local_llm_generate(
        "你是求职顾问，只基于给定岗位片段推荐，禁止编造公司名。",
        f"画像：{profile}\n岗位：{json.dumps(top3, ensure_ascii=False)[:3000]}\n"
        "给每条补1句改简历建议。",
    )
    return {"polish": polished, "mode": "llm" if polished else "rules", "_trace": trace}


def n_quiz_build(state: GraphState) -> dict[str, Any]:
    trace = list(state.get("_trace") or []) + ["quiz_build"]
    job_url = state.get("job_url") or ""
    if not isinstance(job_url, str):
        job_url = str(job_url)
    job_url = job_url.strip()
    job = _local_job_by_url(job_url) or {}
    jd = _local_jd_text(job_url)
    hot: list[str] = []
    for label, rx in _HOT_PATTERNS:
        try:
            if jd and rx.search(jd):
                hot.append(label)
        except Exception as _e:  # noqa: BLE001 - 单个热点正则失败跳过
            print(f"[hot] pattern {label} fallback: {_e}")
            continue
    questions = [
        {
            "qid": i,
            "kind": k,
            "q": q,
            "points": ["结合JD原文", "讲具体做法", "讲量化结果"],
        }
        for i, (k, q) in enumerate(_Q_TEMPLATES)
    ]
    llm_q = _local_llm_generate(
        "你是面试官，按 JD 出5道题（2项目+2技术+1场景），带考察点。",
        f"JD：{(job.get('title', '') + ' ' + jd)[:2500]}",
    )
    qid = uuid.uuid4().hex[:8]
    _persist_quiz_session(qid, job, questions, hot, llm_q)
    job_brief = {k: job.get(k) for k in ("title", "company", "salary", "url")}
    return {
        "quiz_id": qid,
        "job": job_brief,
        "hot": hot,
        "questions": questions,
        "llm": llm_q,
        "scores": {},
        "followups": {},
        "_trace": trace,
    }


# ---------- 构图 ----------
_GRAPH_OK = False
_GRAPH_ERR: str | None = None
s1_graph = None
s2_graph = None
graph = None  # 统一图（条件路由），可用时提供

try:
    from langgraph.graph import END, StateGraph

    _b1 = StateGraph(GraphState)
    _b1.add_node("parse", n_parse)
    _b1.add_node("retrieve", n_retrieve)
    _b1.add_node("rerank", n_rerank)
    _b1.add_node("polish", n_polish)
    _b1.set_entry_point("parse")
    _b1.add_edge("parse", "retrieve")
    _b1.add_edge("retrieve", "rerank")
    _b1.add_edge("rerank", "polish")
    _b1.add_edge("polish", END)
    s1_graph = _b1.compile()

    _b2 = StateGraph(GraphState)
    _b2.add_node("quiz_build", n_quiz_build)
    _b2.set_entry_point("quiz_build")
    _b2.add_edge("quiz_build", END)
    s2_graph = _b2.compile()

    # 统一图：按 job_url 是否为空路由 S1 / S2
    def _route(state: GraphState) -> str:
        if (state.get("job_url") or "").strip():
            return "quiz_build"
        return "parse"

    try:
        _ba = StateGraph(GraphState)
        _ba.add_node("parse", n_parse)
        _ba.add_node("retrieve", n_retrieve)
        _ba.add_node("rerank", n_rerank)
        _ba.add_node("polish", n_polish)
        _ba.add_node("quiz_build", n_quiz_build)
        if hasattr(_ba, "set_conditional_entry_point"):
            _ba.set_conditional_entry_point(
                _route, {"parse": "parse", "quiz_build": "quiz_build"}
            )  # type: ignore
        else:  # 旧版 API 回退：默认进 S1
            _ba.set_entry_point("parse")
        _ba.add_edge("parse", "retrieve")
        _ba.add_edge("retrieve", "rerank")
        _ba.add_edge("rerank", "polish")
        _ba.add_edge("polish", END)
        _ba.add_edge("quiz_build", END)
        graph = _ba.compile()
    except Exception as _ue:  # noqa: BLE001 - 统一图失败不影响 s1/s2
        print(f"[graph] unified compile fallback: {_ue}")
        graph = None

    _GRAPH_OK = True
except Exception as _ge:  # noqa: BLE001 - 保证可演示
    _GRAPH_ERR = str(_ge)
    print(f"[graph] disabled, direct fallback: {_ge}")
    s1_graph = None
    s2_graph = None
    graph = None


# ---------- 本地直跑（终极回退，不经图） ----------
def _local_match_jobs(profile, filters=None):
    st: GraphState = {
        "profile": profile or DEFAULT_PROFILE,
        "filters": dict(filters or {}),
        "job_url": "",
        "_trace": [],
    }
    st.update(n_parse(st))  # type: ignore
    st.update(n_retrieve(st))  # type: ignore
    st.update(n_rerank(st))  # type: ignore
    st.update(n_polish(st))  # type: ignore
    return {
        "top3": st.get("top3", []),
        "polish": st.get("polish"),
        "mode": st.get("mode") or "rules",
    }


def _local_quiz_start(job_url: str):
    st: GraphState = {"job_url": job_url or "", "_trace": []}
    st.update(n_quiz_build(st))  # type: ignore
    return {
        "quiz_id": st.get("quiz_id", ""),
        "job": st.get("job", {}),
        "hot": st.get("hot", []),
        "questions": st.get("questions", []),
        "llm": st.get("llm"),
    }


# ---------- 对外入口（shape 与 app 完全一致） ----------
def run_s1(profile: str, filters: dict | None = None):
    """S1 匹配诊断 → {top3, polish, mode}."""
    filters = dict(filters or {})
    if _GRAPH_OK and s1_graph is not None:
        try:
            out = s1_graph.invoke(
                {
                    "profile": profile or DEFAULT_PROFILE,
                    "filters": filters,
                    "job_url": "",
                    "_trace": [],
                }
            )
            if "top3" in out:
                return {
                    "top3": out.get("top3", []),
                    "polish": out.get("polish"),
                    "mode": out.get("mode")
                    or ("llm" if out.get("polish") else "rules"),
                }
        except Exception as e:  # noqa: BLE001
            print(f"[graph s1] fallback: {e}")
    try:
        import app as _app  # type: ignore

        return _app.match_jobs(profile, filters)
    except Exception as e:  # noqa: BLE001
        print(f"[graph s1] app fallback failed, local: {e}")
        return _local_match_jobs(profile, filters)


def run_s2(job_url: str):
    """S2 模拟面试 → {quiz_id, job, hot, questions, llm}."""
    job_url = (job_url or "").strip()
    if _GRAPH_OK and s2_graph is not None:
        try:
            out = s2_graph.invoke({"job_url": job_url, "_trace": []})
            if "quiz_id" in out:
                return {
                    "quiz_id": out.get("quiz_id", ""),
                    "job": out.get("job", {}),
                    "hot": out.get("hot", []),
                    "questions": out.get("questions", []),
                    "llm": out.get("llm"),
                }
        except Exception as e:  # noqa: BLE001
            print(f"[graph s2] fallback: {e}")
    try:
        import app as _app  # type: ignore

        return _app.quiz_start(job_url)
    except Exception as e:  # noqa: BLE001
        print(f"[graph s2] app fallback failed, local: {e}")
        return _local_quiz_start(job_url)


if __name__ == "__main__":
    print(f"[graph] ok={_GRAPH_OK} err={_GRAPH_ERR} llm_has_key={bool(_resolve_key())}")
    # S1 轨迹
    try:
        if _GRAPH_OK and s1_graph is not None:
            s1_out = s1_graph.invoke(
                {"profile": "3年 Python后端", "filters": {}, "job_url": "", "_trace": []}
            )
            print("[s1] trace =", s1_out.get("_trace"))
            print("[s1] mode =", s1_out.get("mode"))
            top3 = s1_out.get("top3") or []
            print("[s1] top1 =", (top3[0].get("company") if top3 else None))
        r1 = run_s1("3年 Python后端", {})
        print(
            "[s1] run_s1 mode =",
            r1.get("mode"),
            "top1 =",
            (r1["top3"][0]["company"] if r1.get("top3") else None),
        )
    except Exception as e:  # noqa: BLE001
        print(f"[s1] failed: {e}")
    # S2 轨迹
    _TEST_URL = "https://example.com/jobs/samp-01"
    try:
        if _GRAPH_OK and s2_graph is not None:
            s2_out = s2_graph.invoke({"job_url": _TEST_URL, "_trace": []})
            print("[s2] trace =", s2_out.get("_trace"))
            print("[s2] quiz_id =", s2_out.get("quiz_id"), "hot =", s2_out.get("hot"))
        r2 = run_s2(_TEST_URL)
        print("[s2] run_s2 quiz_id =", r2.get("quiz_id"), "hot =", r2.get("hot"))
    except Exception as e:  # noqa: BLE001
        print(f"[s2] failed: {e}")
