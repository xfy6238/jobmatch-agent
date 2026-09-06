"""求职 Agent MVP 服务：match 匹配诊断 + quiz 模拟面试.

跑法：
  cd code && python3 ingest.py && uvicorn app:app --port 8321
无 Key 可演示（检索+规则排序）；有 OPENAI_API_KEY（OpenAI 兼容接口，
可选 OPENAI_BASE_URL）则生成话术/题目/打分走大模型，否则规则模板。
"""

import importlib.util
import json
import os
import re
import urllib.request
import uuid
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_sibling_tools():
    path = os.path.join(BASE_DIR, "tools.py")
    spec = importlib.util.spec_from_file_location("jobagent_tools", path)
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

try:
    from fastapi import FastAPI
except ImportError:  # pragma: no cover
    FastAPI = None

app = FastAPI(title="求职Agent MVP") if FastAPI else None
_sessions = {}  # quiz_id -> {job, questions, idx, scores}（内存缓存，DB 持久化见 memory.py）


def _load_sibling_memory():
    path = os.path.join(BASE_DIR, "memory.py")
    spec = importlib.util.spec_from_file_location("jobagent_memory", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load memory module from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


try:
    _memory = _load_sibling_memory()  # SQLite 持久化；异常则回退纯内存
    _memory.init_db()
except Exception as _mem_e:  # noqa: BLE001 - 保证可演示
    _memory = None
    print(f"[memory] disabled, RAM-only: {_mem_e}")


# ---------- LLM（opencode-go / Responses API） ----------
LLM_BASE = os.environ.get("LLM_BASE_URL", "https://opencode.ai/zen/go/v1")
LLM_MODEL = os.environ.get("LLM_MODEL", "muse-spark-1.3-contributor")
LLM_KEY_FILE = os.environ.get("LLM_KEY_FILE", "/tmp/pi_auth_copy.json")  # noqa: S108 - 用户授权拷入的凭据副本


def _resolve_key():
    key = (
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("LLM_API_KEY")
        or os.environ.get("OPENCODE_API_KEY")  # ~/.zshrc 已配Go key
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


def llm_generate(system, user, max_tokens=800):
    """走 Responses API；无 Key 返回 None 让调用方降级为规则模板."""
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
            "max_output_tokens": max(
                8192, max_tokens * 8
            ),  # 推理占用大量预算，输出预算给足
        }
    ).encode()
    try:
        req = urllib.request.Request(  # noqa: S310 - endpoint scheme allow-listed above
            endpoint,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310 - endpoint scheme allow-listed above
            data = json.loads(resp.read().decode())
        if data.get("error"):
            print(f"[llm] api error: {data['error']}")
            return None
        text = _extract_text(data)
        return text or None
    except Exception as e:  # noqa: BLE001 - 降级为规则模板
        print(f"[llm] fallback to rules: {e}")
        return None


# ---------- 混合检索接入（hybrid） ----------
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


def _load_sibling_hybrid():
    """懒导 hybrid.py（与 tools/memory 同方式，避免硬依赖）。"""
    path = os.path.join(BASE_DIR, "hybrid.py")
    spec = importlib.util.spec_from_file_location("jobagent_hybrid", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load hybrid module from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _current_hybrid_alpha():
    # 每次调用重读 env，保证网格评测 HYBRID_ALPHA=xx 即时生效；非法值回退默认值
    if "HYBRID_ALPHA" in os.environ:
        return _parse_hybrid_alpha(os.environ.get("HYBRID_ALPHA"), default=HYBRID_ALPHA)
    return HYBRID_ALPHA


def _current_hybrid_enabled():
    if "HYBRID_ENABLED" in os.environ:
        return _parse_hybrid_enabled(
            os.environ.get("HYBRID_ENABLED"), default=HYBRID_ENABLED
        )
    return HYBRID_ENABLED


def hybrid_retrieve_urls(query, top_k=20):
    """混合检索封装：启用且 hybrid 可导入则调 hybrid.hybrid_retrieve，否则回退 retrieve_urls。"""
    if not _current_hybrid_enabled():
        return retrieve_urls(query, top_k=top_k)
    try:
        try:
            import hybrid as _hyb  # type: ignore  # cd code 直跑时首选
        except ImportError:
            _hyb = _load_sibling_hybrid()
        alpha = _current_hybrid_alpha()
        urls = _hyb.hybrid_retrieve(query, top_k=top_k, alpha=alpha)
        return urls or retrieve_urls(query, top_k=top_k)
    except Exception as e:  # noqa: BLE001 - 异常回退纯向量，保证可演示
        print(f"[hybrid] fallback to vector: {e}")
        try:
            return retrieve_urls(query, top_k=top_k)
        except Exception:
            return []


# ---------- 检索 ----------
def _collection():
    import chromadb

    client = chromadb.PersistentClient(path=CHROMA_DIR)
    return client.get_collection("jobs")


def retrieve_urls(profile, top_k=20):
    try:
        col = _collection()
        res = col.query(query_texts=[profile], n_results=top_k)
        metas = (res.get("metadatas") or [[]])[0]
        urls, seen = [], set()
        for m in metas:
            u = (m or {}).get("url")
            if u and u not in seen:
                seen.add(u)
                urls.append(u)
        return urls
    except Exception as e:  # noqa: BLE001 - 空库时降级为规则排序
        print(f"[retrieve] fallback: {e}")
        return []


def _job_by_url(url):
    for j in load_jobs():
        if j.get("url") == url:
            return j
    return None


def _jd_text(url):
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


# ---------- Skill-1 匹配诊断 ----------
def match_jobs(profile, filters=None):
    filters = filters or {}
    min_mid = filters.get("min_mid", 17)
    jobs = load_jobs()
    urls = hybrid_retrieve_urls(profile or DEFAULT_PROFILE, top_k=20)
    pool = [_job_by_url(u) for u in urls]
    pool = [j for j in pool if j]
    if len(pool) < 10:  # 检索不足时补全，避免漏掉高优
        ids = {j.get("url") for j in pool}
        pool += [j for j in jobs if j.get("url") not in ids]
    # 过滤：匿名已在数据层剔除；默认隐藏17K以下；兼容猎聘“—”占位
    cand = []
    for j in pool:
        company = (j.get("company") or "").strip()
        if not company or company == "—" or "某" in company:
            continue
        mid = j.get("sal_mid") or parse_mid(j.get("salary", ""))
        if min_mid and mid and mid < min_mid:
            continue
        if filters.get("keyword") and j.get("keyword") != filters["keyword"]:
            continue
        cand.append(j)
    top3 = fit_rerank(cand, limit=3)
    out = []
    for j in top3:
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
    # LLM 润色（可选）
    polished = llm_generate(
        "你是求职顾问，只基于给定岗位片段推荐，禁止编造公司名。",
        f"画像：{profile}\n岗位：{json.dumps(out, ensure_ascii=False)[:3000]}\n"
        "给每条补1句改简历建议。",
    )
    return {"top3": out, "polish": polished, "mode": "llm" if polished else "rules"}


# ---------- Skill-2 模拟面试 ----------
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


def quiz_start(job_url):
    job = _job_by_url(job_url) or {}
    jd = _jd_text(job_url)
    # 无详情正文时回退到标题+技能扫描（开源版默认无详情库，保证 hot 可用）
    if not jd:
        jd = " ".join(
            [str(job.get("title", ""))] + [str(s) for s in (job.get("skills") or [])]
        )
    hot = []
    # 预编译热点正则（静态白名单，非用户输入，规避 ReDoS 误报）
    _HOT_PATTERNS = [
        ("RAG", re.compile(r"rag|检索|向量", re.I)),
        ("Prompt", re.compile(r"prompt|提示词", re.I)),
        ("部署", re.compile(r"docker|k8s|部署|推理", re.I)),
        ("MCP", re.compile(r"mcp|tool|工具调用", re.I)),
    ]
    for label, rx in _HOT_PATTERNS:
        if jd and rx.search(jd):
            hot.append(label)
    questions = [
        {
            "qid": i,
            "kind": k,
            "q": q,
            "points": ["结合JD原文", "讲具体做法", "讲量化结果"],
        }
        for i, (k, q) in enumerate(_Q_TEMPLATES)
    ]
    llm_q = llm_generate(
        "你是面试官，按 JD 出5道题（2项目+2技术+1场景），带考察点。",
        f"JD：{(job.get('title', '') + ' ' + jd)[:2500]}",
    )
    qid = uuid.uuid4().hex[:8]
    _sessions[qid] = {"job": job, "questions": questions, "scores": {}}
    try:
        if _memory is not None:
            _memory.save_session(qid, job, questions, hot, llm_q)
    except Exception as e:  # noqa: BLE001 - DB 异常回退纯内存
        print(f"[memory] save fallback: {e}")
    return {
        "quiz_id": qid,
        "job": {k: job.get(k) for k in ("title", "company", "salary", "url")},
        "hot": hot,
        "questions": questions,
        "llm": llm_q,
    }


def quiz_answer(quiz_id, qid, answer):
    sess = _sessions.get(quiz_id)
    if sess is None and _memory is not None:  # 惰性从 DB 恢复
        try:
            _m = _memory.load_session(quiz_id)
            if _m:
                sess = {
                    "job": _m.get("job", {}),
                    "questions": _m.get("questions", []),
                    "scores": _m.get("scores", {}),
                }
                _sessions[quiz_id] = sess
        except Exception as e:  # noqa: BLE001
            print(f"[memory] load fallback: {e}")
    if not sess:
        return {"error": "quiz_id 不存在，请先 start"}
    qs = sess["questions"]
    q = next((x for x in qs if x["qid"] == qid), None)
    if not q:
        return {"error": "qid 不存在"}
    # 规则打分：按回答长度分档
    base = 2 if len(answer or "") > 150 else (1 if len(answer or "") > 50 else 0)
    score = min(2, base)
    fb = f"长度分{score}/2；建议：{q['points'][0]}、{q['points'][1]}。"
    llm_fb = llm_generate(
        "你是面试官，按要点打分0-2并给3条可执行改进。",
        f"题：{q['q']}\n回答：{answer[:1500]}",
    )
    sess["scores"][qid] = score
    followup = f"追问：{q['q']}里你说的第一步，具体工具/参数是什么？"
    try:
        if _memory is not None:
            _memory.update_score(quiz_id, qid, score, llm_fb or fb, followup)
    except Exception as e:  # noqa: BLE001
        print(f"[memory] update fallback: {e}")
    return {
        "score": score,
        "feedback": llm_fb or fb,
        "followup": followup,
        "mode": "llm" if llm_fb else "rules",
    }


if app:

    @app.get("/api/health")
    def health():
        try:
            n = len(load_jobs())
        except RuntimeError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "jobs": n, "llm": bool(_resolve_key()), "model": LLM_MODEL}

    @app.post("/api/match")
    def api_match(body: dict):
        return match_jobs(body.get("profile") or DEFAULT_PROFILE, body.get("filters"))

    @app.post("/api/quiz/start")
    def api_quiz_start(body: dict):
        return quiz_start(body.get("jobUrl", ""))

    @app.post("/api/quiz/answer")
    def api_quiz_answer(body: dict):
        return quiz_answer(
            body.get("quiz_id", ""), body.get("qid", -1), body.get("answer", "")
        )
