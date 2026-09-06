"""M1 数据灌库：岗位 JSON + 可选详情 JD -> Chroma 本地库.

开箱自带 data/sample_jobs.json（20 条虚构样例，无需详情文件即可跑通）。
换成你自己的数据：把同 schema 的 JSON 传给 JOBS_JSON 环境变量即可。

输入（默认路径，可用环境变量覆盖）：
  JOBS_JSON=../data/sample_jobs.json (默认，可用 JOBS_JSON 环境变量覆盖)
  BOSS_DETAILS=/tmp/ai_agent_boss_details.json
  LIEPIN_DETAILS=/tmp/ai_agent_liepin_details.json
  CHROMA_DIR=./chroma_db (相对本文件所在 code/ 目录)

切片：JD 正文按句聚合（默认 800 字/重叠 100，可用 CHUNK_SIZE/CHUNK_OVERLAP
环境变量覆盖）；293 条目每条一个 base 文档。每片不超过 size 且尽量在句边界截断，
单句超长才硬切；重叠为字符级但起点回退到句边界/空格。
元数据保留 url/company/title/salary/kind，供引用回跳。
幂等：重跑先清空 collection 再写入。
"""

import contextlib
import json
import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_JSON = os.environ.get(
    "JOBS_JSON",
    os.path.join(BASE_DIR, "..", "data", "sample_jobs.json"),
)
BOSS_DETAILS = os.environ.get("BOSS_DETAILS", "/tmp/ai_agent_boss_details.json")  # noqa: S108 - local ingest cache, env-overridable
LIEPIN_DETAILS = os.environ.get("LIEPIN_DETAILS", "/tmp/ai_agent_liepin_details.json")  # noqa: S108 - local ingest cache, env-overridable
CHROMA_DIR = os.environ.get("CHROMA_DIR", os.path.join(BASE_DIR, "chroma_db"))


def _int_env(name, default):
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default


CHUNK_SIZE = _int_env("CHUNK_SIZE", 800)
CHUNK_OVERLAP = _int_env("CHUNK_OVERLAP", 100)

# 句边界字符：中文句末 + 换行 + 中英文分号 + 空格（重叠回退用）
_SENT_SPLIT_RE = re.compile(r"([。！？\n；;]+)")
_BOUNDARY_CHARS = "。！？\n；; "


def _hard_cut(text, size, overlap):
    """单句超长兜底：纯按字符硬切 size/overlap（调用方已保证 size > overlap >= 0）。"""
    chunks, start = [], 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        chunks.append(text[start:end])
        if end >= n:
            break
        start = end - overlap if overlap > 0 else end
    return chunks


def _overlap_prefix(prev, overlap):
    """取 prev 末尾 overlap 字符，起点回退到最近的句边界/空格之后。

    回退即把起点向前挪到最近的边界之后（重叠略大于 overlap，但从句首开始）；
    若 prev 内无可用边界（如硬切片），则退化为纯字符重叠。
    """
    if overlap <= 0 or not prev:
        return ""
    if len(prev) <= overlap:
        return prev
    start = len(prev) - overlap
    for s in range(start, -1, -1):
        if s == 0 or prev[s - 1] in _BOUNDARY_CHARS:
            return prev[s:]
    return prev[start:]


def chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP) -> list[str]:
    """按句聚合切片：先按中文句末/换行切句（保留分隔符），再按句拼装。

    - 每片长度不超过 size，尽量在句边界处截断；
    - 单句长度 > size 时，对该句按 size/overlap 硬切兜底；
    - overlap 为字符级重叠，但起点回退到最近的句边界或空格；
    - 预算内无法对齐边界时宁可丢弃重叠也不割裂句子，且不产生重复空转。
    """
    try:
        size = int(size)
    except (TypeError, ValueError):
        size = CHUNK_SIZE
    try:
        overlap = int(overlap)
    except (TypeError, ValueError):
        overlap = CHUNK_OVERLAP
    if size <= 0:
        size = CHUNK_SIZE
    if overlap < 0:
        overlap = 0
    if overlap >= size:
        overlap = max(0, size - 1)

    raw = text or ""
    if not raw.strip():
        return []
    # 统一换行、压缩横向空白（保留 \n 作为切句依据）
    norm = raw.replace("\r\n", "\n").replace("\r", "\n")
    norm = re.sub(r"[ \t\x0b\x0c]+", " ", norm).strip()
    if not norm:
        return []
    if len(norm) <= size:
        return [norm]

    # 1) 切句并保留分隔符；纯分隔符片段并入相邻句
    parts = _SENT_SPLIT_RE.split(norm)
    sentences = []
    pending = ""
    for i in range(0, len(parts), 2):
        body = parts[i]
        delim = parts[i + 1] if i + 1 < len(parts) else ""
        if not body.strip():
            if delim:
                if sentences:
                    sentences[-1] += delim
                else:
                    pending += delim
            continue
        sentences.append(pending + body + delim)
        pending = ""
    if pending:
        if sentences:
            sentences[-1] += pending
        else:
            sentences.append(pending)
    sentences = [s for s in sentences if s.strip()]
    if not sentences:
        return [norm]

    # 2) 超长单句硬切兜底，之后所有 units 长度均 <= size
    units = []
    for s in sentences:
        if len(s) <= size:
            units.append(s)
        else:
            units.extend(_hard_cut(s, size, overlap))

    # 3) 按句拼装 + 句边界对齐的字符重叠
    chunks, idx, carry = [], 0, ""
    guard = 0
    while idx < len(units):
        cur = carry
        carry = ""
        start_idx = idx
        while idx < len(units) and len(cur) + len(units[idx]) <= size:
            cur += units[idx]
            idx += 1
        if idx == start_idx:
            # carry 独占导致新句子装不下：丢弃重叠、从句首重开
            # （cur == carry 的内容已在上一片出现过，丢弃不丢信息）
            carry = ""
            guard += 1
            if guard > len(units) * 2 + 10:  # 防御性兜底，不应触发
                chunks.append(units[idx][:size])
                idx += 1
            continue
        chunks.append(cur)
        if idx < len(units):
            carry = _overlap_prefix(cur, overlap)
    return chunks


def load_details():
    details = {}  # url -> postDescription
    for path in (BOSS_DETAILS, LIEPIN_DETAILS):
        try:
            with open(path, encoding="utf-8") as f:
                items = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
            print(f"[ingest] skip {path}: {e}")
            continue
        for it in items:
            jd = (it.get("postDescription") or "").strip()
            url = it.get("url") or ""
            if len(jd) >= 500 and url and url not in details:
                details[url] = jd
    print(f"[ingest] valid detail JDs: {len(details)}")
    return details


def main():
    import chromadb

    try:
        with open(JOBS_JSON, encoding="utf-8") as f:
            jobs = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
        print(f"[ingest] FATAL cannot read {JOBS_JSON}: {e}", file=sys.stderr)
        return 1
    print(f"[ingest] jobs: {len(jobs)} from {JOBS_JSON}")
    details = load_details()

    client = chromadb.PersistentClient(path=CHROMA_DIR)
    with contextlib.suppress(Exception):
        client.delete_collection("jobs")
    col = client.get_or_create_collection("jobs")

    ids, docs, metas = [], [], []
    # 1) 293 base 文档
    for i, j in enumerate(jobs):
        skills = ",".join(j.get("skills", [])[:6])
        try:
            fit_val = float(j.get("fit") or 0)
        except (TypeError, ValueError):
            fit_val = 0.0
        doc = (
            f"{j.get('title', '')} {j.get('company', '')} {j.get('salary', '')} "
            f"{j.get('exp', '')} {j.get('edu', '')} {j.get('district', '')} "
            f"{j.get('industry', '')} {skills} {j.get('keyword', '')}"
        ).strip()
        ids.append(f"base-{i}")
        docs.append(doc)
        metas.append(
            {
                "kind": "base",
                "title": j.get("title", "")[:60],
                "company": j.get("company", "")[:40],
                "salary": j.get("salary", ""),
                "url": j.get("url", ""),
                "keyword": j.get("keyword", ""),
                "fit": fit_val,
                "tier": j.get("tier", ""),
            }
        )
    # 2) 详情切片
    n_chunk = 0
    for url, jd in details.items():
        base = next((j for j in jobs if j.get("url") == url), None)
        title = (base or {}).get("title", url[-30:])[:60]
        company = (base or {}).get("company", "")[:40]
        for k, ch in enumerate(chunk_text(jd)):
            ids.append(f"jd-{len(ids)}")
            docs.append(f"{title} {company} {ch}")
            metas.append(
                {
                    "kind": "chunk",
                    "title": title,
                    "company": company,
                    "url": url,
                    "chunk": k,
                }
            )
            n_chunk += 1

    print(f"[ingest] upsert base={len(jobs)} chunks={n_chunk} total={len(ids)}")
    BATCH = 100
    for s in range(0, len(ids), BATCH):
        col.upsert(
            ids=ids[s : s + BATCH],
            documents=docs[s : s + BATCH],
            metadatas=metas[s : s + BATCH],
        )
    print(f"[ingest] done. count={col.count()} dir={CHROMA_DIR}")
    # 验证回跳：统计已索引 url 数
    print(
        "[ingest] verify: urls indexed:",
        len({m.get("url") for m in metas if m.get("url")}),
    )
    return 0


def _selftest():
    """单元自检：3 句长文本演示按句聚合切片 + 边界检查（句中无割裂）。"""
    demo = (
        "第一句介绍求职Agent的RAG切片链路，覆盖JD解析与技能提取。"
        "第二句在句边界处截断！避免把机器学习等实体从中间割裂。"
        "第三句验证重叠回退机制；重叠从句边界开始，保证召回完整。"
    )
    size, overlap = 50, 10
    print(f"[selftest] CHUNK_SIZE={CHUNK_SIZE} CHUNK_OVERLAP={CHUNK_OVERLAP}")
    print(f"[selftest] demo len={len(demo)} size={size} overlap={overlap}")
    print(f"[selftest] demo: {demo}")
    chunks = chunk_text(demo, size, overlap)
    for i, ch in enumerate(chunks):
        print(f"[selftest] chunk{i} len={len(ch)}: {ch}")
    tiny = chunk_text("句1。句2！句3\n句4；", 10, 3)
    print(f"[selftest] tiny: {tiny}")
    ok = True

    def _check(name, cond):
        nonlocal ok
        print(f"[selftest] {'PASS' if cond else 'FAIL'} {name}")
        if not cond:
            ok = False

    _check("non-empty-multi", len(chunks) > 1)
    _check("size-limit", all(len(c) <= size for c in chunks))
    _check(
        "boundary-end",
        all(c and c[-1] in _BOUNDARY_CHARS for c in chunks),
    )
    for ent in ("RAG", "机器学习", "召回完整"):
        _check(f"entity-intact:{ent}", any(ent in c for c in chunks))
    _check("substring", all(c in demo for c in chunks))
    _check("tiny-multi", len(tiny) >= 2)
    _check("tiny-boundary", all(c and c[-1] in _BOUNDARY_CHARS for c in tiny))
    return ok


if __name__ == "__main__":
    if "--selftest" in sys.argv or "--demo" in sys.argv:
        sys.exit(0 if _selftest() else 1)
    try:
        _selftest()  # 单元自检演示（无副作用），不阻塞灌库
    except Exception as e:  # pragma: no cover
        print(f"[selftest] skip: {e}")
    sys.exit(main())
