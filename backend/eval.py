#!/usr/bin/env python3
"""
M4 演示与评测脚本 — 固定 10 题评测集
直接 import app 的函数跑分，每题 0/1，容错单题异常记 0 分继续跑。
约束：不改 app.py / tools.py / ingest.py，只新增本文件。
"""

import os
import sys
import traceback

# 保证可 import 同目录的 app/tools
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# 评分结果容器
results = []  # 每项 (题号, 是否通过, 备注)
score = 0

# 默认画像（与 app.DEFAULT_PROFILE 保持一致）
DEFAULT_PROFILE = "3年 Python后端 + RAG问答项目 + LangChain + Docker部署"

# 用于 T6-T9 共享的上下文
_top3 = None
_mode = None
_first_url = None
_quiz_ret = None
_quiz_id = None
_first_qid = None


def _mark(tid, ok, note=""):
    """记录单题结果（中文备注，便于排查）"""
    global score
    if ok:
        score += 1
        print(f"[{tid}] ✅ 通过 {note}")
    else:
        print(f"[{tid}] ❌ 失败 {note}")
    results.append((tid, ok, note))


# ---------- 尝试导入 app 函数（整体异常则按规范重试一次） ----------
_import_ok = False
_import_err = ""
# 预先声明，避免 possibly-unbound 误报（实际由 import 赋值）
match_jobs = None  # type: ignore
quiz_start = None  # type: ignore
quiz_answer = None  # type: ignore
parse_mid = None  # type: ignore
# 单次导入：失败即打印快照并退出（无后台并发修改场景）
if True:
    try:
        from app import match_jobs as _mj  # type: ignore  # noqa: E402,I001
        from app import quiz_answer as _qa  # type: ignore  # noqa: E402,I001
        from app import quiz_start as _qs  # type: ignore  # noqa: E402,I001
        from tools import parse_mid as _pm  # type: ignore  # noqa: E402,I001

        match_jobs = _mj  # type: ignore
        quiz_answer = _qa  # type: ignore
        quiz_start = _qs  # type: ignore
        parse_mid = _pm  # type: ignore
        _import_ok = True
    except Exception as e:
        _import_err = f"{e}\n{traceback.format_exc()}"
        print("[import] 失败，放弃评测：")
        print(_import_err)
        print("\n--- 文件内容快照（便于排查） ---")
        for fname in ("app.py", "tools.py", "eval.py"):
            fpath = os.path.join(BASE_DIR, fname)
            print(f"\n===== {fname} =====")
            try:
                with open(fpath, encoding="utf-8") as f:
                    print(f.read()[:4000])
            except Exception as fe:
                print(f"读取失败: {fe}")
        print("\nSCORE 0/10（import 失败，未执行题目）")
        sys.exit(0)

if not _import_ok:
    # 已在上层处理
    sys.exit(1)
# 断言已绑定，消除后续 possibly-unbound 告警
assert match_jobs is not None  # type: ignore
assert quiz_start is not None  # type: ignore
assert quiz_answer is not None  # type: ignore
assert parse_mid is not None  # type: ignore

print("=" * 60)
print("M4 评测开始 — 固定 10 题")
print("=" * 60)

# ---------- T1：默认画像 Top3 非空且每条含 url 且无公司名含"某" ----------
try:
    ret = match_jobs(DEFAULT_PROFILE)
    _top3 = ret.get("top3") or []
    _mode = ret.get("mode")
    # 供后续题目复用
    if _top3:
        _first_url = (_top3[0] or {}).get("url")
    ok = True
    note = ""
    if not isinstance(_top3, list) or len(_top3) < 3:
        ok = False
        note = (
            f"Top3 数量不足：{len(_top3) if isinstance(_top3, list) else type(_top3)}"
        )
    else:
        for i, j in enumerate(_top3):
            url = (j or {}).get("url")
            comp = (j or {}).get("company") or ""
            if not url:
                ok = False
                note = f"第 {i + 1} 条缺少 url"
                break
            if "某" in comp:
                ok = False
                note = f"第 {i + 1} 条公司名含'某'：{comp}"
                break
        if ok:
            note = f"Top3={len(_top3)}，首条 {(_top3[0].get('company') or '')[:20]} | {(_top3[0].get('title') or '')[:20]}"
    _mark("T1 匹配-Top3可用", ok, note)
except Exception as e:
    _mark("T1 匹配-Top3可用", False, f"异常: {e}")
    traceback.print_exc()

# ---------- T2：缺口命中 — 任一条 gaps 合并文本含 RAG/Prompt/MCP/部署/LangChain 任一 ----------
try:
    if _top3 is None:
        ret = match_jobs(DEFAULT_PROFILE)
        _top3 = ret.get("top3") or []
    gaps_text = ""
    for j in _top3 or []:
        gaps = (j or {}).get("gaps") or []
        if isinstance(gaps, list):
            gaps_text += " ".join(str(x) for x in gaps) + " "
        else:
            gaps_text += str(gaps) + " "
    keywords = ["RAG", "Prompt", "MCP", "部署", "LangChain"]
    hit = any(k in gaps_text for k in keywords)
    # 也兼容小写命中（RAG/Prompt 大小写不敏感场景）
    if not hit:
        lower = gaps_text.lower()
        hit = any(k.lower() in lower for k in keywords)
    _mark(
        "T2 缺口命中",
        hit,
        f"gaps 合并: {gaps_text[:120].strip()}..."
        if gaps_text.strip()
        else "gaps 为空",
    )
except Exception as e:
    _mark("T2 缺口命中", False, f"异常: {e}")
    traceback.print_exc()

# ---------- T3：17K 以下默认不出现 — Top3 的 sal_mid（或 salary 解析）全部 ≥17 或无薪资 ----------
try:
    if _top3 is None:
        ret = match_jobs(DEFAULT_PROFILE)
        _top3 = ret.get("top3") or []
    ok = True
    note_parts = []
    for i, j in enumerate(_top3 or []):
        # 优先取 sal_mid，回退到 salary 解析
        mid = (j or {}).get("sal_mid")
        if mid is None:
            sal = (j or {}).get("salary") or ""
            try:
                mid = parse_mid(sal)
            except Exception:
                mid = None
        if mid is None:
            note_parts.append(f"#{i + 1} 无薪资视为通过")
            continue
        try:
            mid_f = float(mid)
        except Exception:
            ok = False
            note_parts.append(f"#{i + 1} sal_mid 解析失败:{mid}")
            break
        if mid_f < 17:
            ok = False
            note_parts.append(
                f"#{i + 1} 中位 {mid_f} <17 (salary={(j or {}).get('salary')})"
            )
            break
        else:
            note_parts.append(f"#{i + 1} {mid_f}≥17")
    _mark("T3 薪资过滤≥17K", ok, "；".join(note_parts) if note_parts else "无数据")
except Exception as e:
    _mark("T3 薪资过滤≥17K", False, f"异常: {e}")
    traceback.print_exc()

# ---------- T4：引用可回跳 — 每条 cite 含标题+公司+薪资 ----------
try:
    if _top3 is None:
        ret = match_jobs(DEFAULT_PROFILE)
        _top3 = ret.get("top3") or []
    ok = True
    note = ""
    for i, j in enumerate(_top3 or []):
        cite = (j or {}).get("cite") or ""
        title = (j or {}).get("title") or ""
        comp = (j or {}).get("company") or ""
        sal = (j or {}).get("salary") or ""
        # 标题/公司/薪资均应在 cite 中出现（空值跳过对应检查，避免误判）
        miss = []
        if title and title not in cite:
            miss.append("标题")
        if comp and comp not in cite:
            miss.append("公司")
        if sal and sal not in cite:
            miss.append("薪资")
        if miss:
            ok = False
            note = f"第 {i + 1} 条 cite 缺失 {','.join(miss)} | cite={cite[:80]}"
            break
        if not cite:
            ok = False
            note = f"第 {i + 1} 条 cite 为空"
            break
    if ok:
        note = f"3 条 cite 均含标题/公司/薪资，例：{(_top3[0].get('cite') or '')[:60]}"
    _mark("T4 引用可回跳", ok, note)
except Exception as e:
    _mark("T4 引用可回跳", False, f"异常: {e}")
    traceback.print_exc()

# ---------- T5：无 Key 降级 — 确认环境无 OPENAI_API_KEY 时 mode 为 rules ----------
try:
    # 以 match_jobs 的 mode 为准；若之前未取到则重调一次
    if _mode is None:
        ret = match_jobs(DEFAULT_PROFILE)
        _mode = ret.get("mode")
    has_key = bool(os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY"))
    if not has_key:
        try:
            from app import _resolve_key  # 与服务同口径（含授权key文件）

            has_key = bool(_resolve_key())
        except Exception as e:  # key文件缺失即视为无Key
            print(f"[eval] key file unreadable: {e}")
    if has_key:
        # 有 Key 时跳过此题记 1 分并注明（按题面要求）
        _mark(
            "T5 无Key降级",
            True,
            f"检测到 OPENAI_API_KEY/LLM_API_KEY 已配置，跳过校验记 1 分（mode={_mode}）",
        )
    else:
        ok = _mode == "rules"
        _mark("T5 无Key降级", ok, f"无 Key 时 mode={_mode}（期望 rules）")
except Exception as e:
    _mark("T5 无Key降级", False, f"异常: {e}")
    traceback.print_exc()

# ---------- T6：用第一条 Top3 的 url 调 quiz_start，返回 5 道题 ----------
try:
    if not _first_url:
        # 兜底：重取 Top3
        ret = match_jobs(DEFAULT_PROFILE)
        _top3 = ret.get("top3") or []
        _first_url = _top3[0].get("url") if _top3 else None
    if not _first_url:
        _mark("T6 quiz_start 5题", False, "无可用 url（Top3 为空）")
    else:
        _quiz_ret = quiz_start(_first_url)
        qs = (_quiz_ret or {}).get("questions") or []
        ok = isinstance(qs, list) and len(qs) == 5
        # 记录共享上下文
        if _quiz_ret:
            _quiz_id = _quiz_ret.get("quiz_id")
            if qs:
                _first_qid = qs[0].get("qid")
        _mark(
            "T6 quiz_start 5题",
            ok,
            f"url={(_first_url or '')[:55]}... 返回 {len(qs)} 题，quiz_id={_quiz_id}",
        )
except Exception as e:
    _mark("T6 quiz_start 5题", False, f"异常: {e}")
    traceback.print_exc()

# ---------- T7：hot 非空（命中 RAG/Prompt/部署/MCP 至少其一） ----------
try:
    if _quiz_ret is None:
        if not _first_url:
            ret = match_jobs(DEFAULT_PROFILE)
            _first_url = (ret.get("top3") or [{}])[0].get("url")
        _quiz_ret = quiz_start(_first_url) if _first_url else {}
        _quiz_id = _quiz_ret.get("quiz_id")
        _first_qid = ((_quiz_ret.get("questions") or [{}])[0] or {}).get("qid")
    hot = (_quiz_ret or {}).get("hot") or []
    # 规范：hot 命中 RAG/Prompt/部署/MCP 至少其一
    expected = {"RAG", "Prompt", "部署", "MCP"}
    hit = any(h in expected for h in hot) if isinstance(hot, list) else False
    # 兼容大小写
    if not hit and isinstance(hot, list) and hot:
        hit = len([h for h in hot if h]) > 0 and any(str(h) in expected for h in hot)
    _mark("T7 hot命中", hit, f"hot={hot}" if hot else "hot 为空")
except Exception as e:
    _mark("T7 hot命中", False, f"异常: {e}")
    traceback.print_exc()

# T8/T9 共享的回答结果，先初始化避免 possibly-unbound
ans_ret = None  # type: ignore
err_ret = None  # type: ignore

# ---------- T8：quiz_answer 回答 200 字以上得 score==2 ----------
try:
    if not _quiz_id or _first_qid is None:
        # 兜底重建会话
        if not _first_url:
            ret = match_jobs(DEFAULT_PROFILE)
            _first_url = (ret.get("top3") or [{}])[0].get("url")
        _quiz_ret = quiz_start(_first_url) if _first_url else {}
        _quiz_id = _quiz_ret.get("quiz_id")
        _first_qid = ((_quiz_ret.get("questions") or [{}])[0] or {}).get("qid")
    # 构造 200 字以上回答（中文字符计 1）
    long_answer = (
        "我在医疗项目中负责 Flutter 端与 AI 能力集成，主导了 12 个项目的技术治理。"
        "在 RAG 链路中采用 Chroma 向量库，切片 800 字重叠 100，解决引用漂移问题通过对比检索与重排分数定位。"
        "Prompt 模板通过 few-shot 与约束指令收敛幻觉，明确禁止编造公司名并要求引用回跳。"
        "推理部署使用 Docker 与 K8s，权衡延迟与成本时采用批量推理与缓存。"
        "MCP 工具调用通过统一 tool_schema 管理，支持多智能体并行协作与自动化治理。"
    ) * 3  # 约 300+ 字，确保 >200
    # 兜底：若仍不足 200，补齐
    if len(long_answer) < 220:
        long_answer += "补字" * 120
    ans_ret = quiz_answer(_quiz_id, _first_qid, long_answer)
    sc = (ans_ret or {}).get("score")
    ok = sc == 2
    _mark(
        "T8 长回答得2分",
        ok,
        f"len={len(long_answer)} score={sc} feedback={(ans_ret.get('feedback') or '')[:40]}...",
    )
except Exception as e:
    _mark("T8 长回答得2分", False, f"异常: {e}")
    traceback.print_exc()

# ---------- T9：feedback 非空且 followup 非空 ----------
try:
    # 复用 T8 的回答结果，若失败则重新答一次
    if ans_ret is None or not isinstance(ans_ret, dict):
        long_answer = "有效回答内容。" * 60  # 300 字
        ans_ret = quiz_answer(_quiz_id, _first_qid, long_answer)  # type: ignore
    fb = (ans_ret or {}).get("feedback") or ""  # type: ignore
    fu = (ans_ret or {}).get("followup") or ""  # type: ignore
    ok = bool(str(fb).strip()) and bool(str(fu).strip())
    _mark(
        "T9 反馈与追问",
        ok,
        f"feedback 非空={bool(str(fb).strip())} followup 非空={bool(str(fu).strip())}",
    )
except Exception as e:
    _mark("T9 反馈与追问", False, f"异常: {e}")
    traceback.print_exc()

# ---------- T10：错误 quiz_id 返回含 error 字段 ----------
try:
    err_ret = quiz_answer("不存在的quiz_id_123456", 0, "任意回答")
    ok = isinstance(err_ret, dict) and "error" in err_ret and bool(err_ret.get("error"))
    _mark("T10 错误quiz_id容错", ok, f"返回={str(err_ret)[:120]}")
except Exception as e:
    _mark("T10 错误quiz_id容错", False, f"异常: {e}")
    traceback.print_exc()

# ---------- 汇总 ----------
print("=" * 60)
print(f"SCORE {score}/10")
if score >= 8:
    print("✅ 可演示（≥8 分）")
else:
    fails = [tid for tid, ok, _ in results if not ok]
    print(f"❌ 未达演示标准（<8 分），失败题：{', '.join(fails) if fails else '无'}")
    for tid, ok, note in results:
        if not ok:
            print(f"  - {tid}: {note}")
print("=" * 60)
