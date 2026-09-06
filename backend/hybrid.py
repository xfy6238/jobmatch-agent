"""混合检索：BM25（293 岗位）+ 向量（Chroma）加权。

语料：每条 doc = f"{title} {company} {skills} {keyword} {district} {salary}"，
若该 url 有详情 JD 则拼接前 800 字。
只改本文件，不动 app / graph 链路（下游子代理再接入）。

对外：
  hybrid_retrieve(query, top_k=20, alpha=0.6) -> list[str]  # 与 retrieve_urls 同 shape
  bm25_scores(query, top_n=20)   -> list[(url, score)] 降序
  vector_scores(query, top_n=20) -> list[(url, score)] 降序
  BM25(corpus)                   # score(query_tokens, doc_id) / batch_scores(query)

BM25 索引首次调用时懒初始化并缓存（293 条，毫秒级）。
"""

import json
import math
import os
import re
from collections import Counter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_JSON = os.environ.get(
    "JOBS_JSON",
    os.path.join(BASE_DIR, "..", "data", "sample_jobs.json"),
)
BOSS_DETAILS = os.environ.get("BOSS_DETAILS", "/tmp/ai_agent_boss_details.json")  # noqa: S108
LIEPIN_DETAILS = os.environ.get("LIEPIN_DETAILS", "/tmp/ai_agent_liepin_details.json")  # noqa: S108
CHROMA_DIR = os.environ.get("CHROMA_DIR", os.path.join(BASE_DIR, "chroma_db"))

POOL_N = 20  # 每侧候选池固定 Top20
JD_SNIPPET_LEN = 800  # 详情 JD 拼接上限
MIN_JD_LEN = 50  # 低于此长度视为无有效详情

# 停用词 20 个（单字为主，tokenize 后过滤）
_STOPWORDS = frozenset(
    [
        "的",
        "了",
        "在",
        "和",
        "与",
        "等",
        "及",
        "为",
        "是",
        "有",
        "我",
        "你",
        "他",
        "她",
        "它",
        "不",
        "也",
        "都",
        "就",
        "把",
    ]
)

_TOKEN_RE = re.compile(r"[\w]+|[\u4e00-\u9fff]")
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def tokenize(text):
    """简易中文友好分词：英文按词、中文按词+单字兼得，长度>=1，去停用词."""
    toks = []
    for t in _TOKEN_RE.findall((text or "").lower()):
        if not t or t in _STOPWORDS:
            continue
        toks.append(t)
        # 含中文且长度>1：额外展开单字，保证"智能体"能命中"ai智能体"这类混排词
        if len(t) > 1 and _CJK_RE.search(t):
            for ch in t:
                if _CJK_RE.match(ch) and ch not in _STOPWORDS:
                    toks.append(ch)
    return toks


class BM25:
    """经典 BM25：k1=1.5, b=0.75，idf 平滑 Robertson-Spärck Jones 变体."""

    def __init__(self, corpus, k1=1.5, b=0.75):
        self.corpus = list(corpus)
        self.k1 = k1
        self.b = b
        self.N = len(self.corpus)
        self.doc_tokens = [tokenize(d) for d in self.corpus]
        self.doc_len = [len(t) for t in self.doc_tokens]
        self.avgdl = sum(self.doc_len) / self.N if self.N else 0.0
        self.tf = [Counter(t) for t in self.doc_tokens]
        df = Counter()
        for t in self.doc_tokens:
            for term in set(t):
                df[term] += 1
        self.df = df
        self.idf = {
            term: math.log((self.N - f + 0.5) / (f + 0.5) + 1.0)
            for term, f in df.items()
        }

    def score(self, query_tokens, doc_id):
        """单篇打分."""
        if not query_tokens or doc_id < 0 or doc_id >= self.N:
            return 0.0
        tf_d = self.tf[doc_id]
        dl = self.doc_len[doc_id]
        if not dl or not self.avgdl:
            return 0.0
        norm = 1.0 - self.b + self.b * dl / self.avgdl
        s = 0.0
        for t in query_tokens:
            f = tf_d.get(t)
            if not f:
                continue
            idf = self.idf.get(t)
            if idf is None:
                continue
            s += idf * f * (self.k1 + 1.0) / (f + self.k1 * norm)
        return s

    def batch_scores(self, query):
        """整库打分，与 corpus 等长，顺序对齐."""
        qt = tokenize(query)
        return [self.score(qt, i) for i in range(self.N)]


# ---------- 懒初始化缓存 ----------
_jobs_cache = None  # list[dict]
_urls_cache = None  # list[str]，与 corpus 等长
_details_cache = None  # dict url -> postDescription
_bm25_cache = None  # BM25 实例


def _load_jobs():
    global _jobs_cache
    if _jobs_cache is None:
        try:
            with open(JOBS_JSON, encoding="utf-8") as f:
                _jobs_cache = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
            raise RuntimeError(f"cannot read jobs data {JOBS_JSON}: {e}") from e
    return _jobs_cache


def _load_details():
    global _details_cache
    if _details_cache is None:
        details = {}
        for path in (BOSS_DETAILS, LIEPIN_DETAILS):
            try:
                with open(path, encoding="utf-8") as f:
                    items = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError, OSError):
                continue
            for it in items:
                url = it.get("url") or ""
                jd = (it.get("postDescription") or "").strip()
                if url and len(jd) >= MIN_JD_LEN and url not in details:
                    details[url] = jd
        _details_cache = details
    return _details_cache


def _build_corpus(jobs, details):
    docs, urls = [], []
    for j in jobs:
        skills = ",".join(j.get("skills") or [])
        doc = (
            f"{j.get('title', '')} {j.get('company', '')} "
            f"{skills} {j.get('keyword', '')} "
            f"{j.get('district', '')} {j.get('salary', '')}"
        ).strip()
        jd = details.get(j.get("url") or "")
        if jd:
            doc = f"{doc} {jd[:JD_SNIPPET_LEN]}"
        docs.append(doc)
        urls.append(j.get("url") or "")
    return docs, urls


def _ensure_index():
    """首次调用建索引并缓存；返回 (BM25, urls)."""
    global _bm25_cache, _urls_cache
    if _bm25_cache is None or _urls_cache is None:
        jobs = _load_jobs()
        details = _load_details()
        docs, urls = _build_corpus(jobs, details)
        _bm25_cache = BM25(docs)
        _urls_cache = urls
    return _bm25_cache, _urls_cache


# ---------- 向量分 ----------
def _collection():
    import chromadb

    client = chromadb.PersistentClient(path=CHROMA_DIR)
    return client.get_collection("jobs")


def vector_scores(query, top_n=POOL_N):
    """Chroma 距离 → 0-1 分：score = max(0, 1 - d/2)，按 url 去重取最优，降序."""
    if not (query or "").strip() or top_n <= 0:
        return []
    try:
        col = _collection()
        # 多取再按 url 去重，保证去重后仍有 top_n 个
        res = col.query(
            query_texts=[query],
            n_results=max(top_n * 3, 50),
            include=["metadatas", "distances"],
        )
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
    except Exception as e:  # noqa: BLE001 - 空库时返回空，hybrid 降级走 BM25
        print(f"[hybrid:vector] fallback: {e}")
        return []
    best = {}
    for m, d in zip(metas, dists, strict=False):
        u = (m or {}).get("url")
        if not u:
            continue
        try:
            s = max(0.0, 1.0 - float(d) / 2.0)
        except (TypeError, ValueError):
            continue
        if u not in best or s > best[u]:
            best[u] = s
    ranked = sorted(best.items(), key=lambda kv: kv[1], reverse=True)
    return ranked[:top_n]


# ---------- BM25 分 ----------
def bm25_scores(query, top_n=POOL_N):
    """BM25 TopN：同 url 多 doc 取最高分，降序返回 [(url, score)]."""
    if not (query or "").strip() or top_n <= 0:
        return []
    bm25, urls = _ensure_index()
    scores = bm25.batch_scores(query)
    best = {}
    for doc_id, s in enumerate(scores):
        if s <= 0:
            continue
        u = urls[doc_id]
        if not u:
            continue
        if u not in best or s > best[u]:
            best[u] = s
    ranked = sorted(best.items(), key=lambda kv: kv[1], reverse=True)
    return ranked[:top_n]


# ---------- 混合 ----------
def _minmax_norm(pairs):
    """[(url, score)] → {url: 0-1}；全等时全 1.0."""
    if not pairs:
        return {}
    vals = [s for _, s in pairs]
    lo, hi = min(vals), max(vals)
    if hi <= lo:
        return {u: 1.0 for u, _ in pairs}
    span = hi - lo
    return {u: (s - lo) / span for u, s in pairs}


def hybrid_retrieve(query, top_k=20, alpha=0.6):
    """向量 Top20 与 BM25 Top20 各自 min-max 归一后加权。

    final = alpha * vec_norm + (1 - alpha) * bm25_norm，
    缺席一侧计 0，按 final 降序去重，返回 urls 列表。
    """
    if not (query or "").strip() or top_k <= 0:
        return []
    pool_n = max(top_k, POOL_N)
    vec = vector_scores(query, top_n=pool_n)
    bm = bm25_scores(query, top_n=pool_n)
    if not vec and not bm:
        return []
    vn, bn = _minmax_norm(vec), _minmax_norm(bm)
    finals = {}
    for u in set(vn) | set(bn):
        finals[u] = alpha * vn.get(u, 0.0) + (1.0 - alpha) * bn.get(u, 0.0)
    ranked = sorted(finals.items(), key=lambda kv: kv[1], reverse=True)
    return [u for u, _ in ranked[:top_k]]


if __name__ == "__main__":
    for q in ("AI Agent", "Flutter", "智能体"):
        print(q, "->", hybrid_retrieve(q, top_k=5))
