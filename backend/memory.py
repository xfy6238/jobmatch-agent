"""SQLite 长记忆持久化：quiz 会话落盘（替代纯内存 _sessions）.

使用 backend/sessions.db（本地自动创建，不进仓库），新增表 sessions。DB 异常时由调用方回退纯内存。
"""

import datetime
import json
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("MEMORY_DB", os.path.join(BASE_DIR, "sessions.db"))


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db(db_path=None):
    path = db_path or DB_PATH
    conn = sqlite3.connect(path, timeout=10)
    try:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              job_json TEXT,
              questions_json TEXT,
              scores_json TEXT,
              followups_json TEXT,
              hot_json TEXT,
              llm_text TEXT,
              created_at TEXT,
              updated_at TEXT
            )"""
        )
        conn.commit()
    finally:
        conn.close()


def save_session(quiz_id, job, questions, hot, llm):
    """新建/覆盖会话基本信息；已存在的 scores/followups 予以保留."""
    init_db()
    now = _now()
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT scores_json, followups_json, created_at FROM sessions WHERE id=?",
            (quiz_id,),
        )
        row = cur.fetchone()
        if row:
            scores_s, followups_s, created_at = row
            scores_s = scores_s or "{}"
            followups_s = followups_s or "{}"
        else:
            scores_s, followups_s, created_at = "{}", "{}", now
        conn.execute(
            """INSERT OR REPLACE INTO sessions
               (id, job_json, questions_json, scores_json, followups_json,
                hot_json, llm_text, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                quiz_id,
                json.dumps(job or {}, ensure_ascii=False),
                json.dumps(questions or [], ensure_ascii=False),
                scores_s,
                followups_s,
                json.dumps(hot or [], ensure_ascii=False),
                llm or "",
                created_at,
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def load_session(quiz_id):
    """返回 dict|None：{job, questions, scores, followups, hot, llm, created_at, updated_at}."""
    init_db()
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT job_json, questions_json, scores_json, followups_json,"
            " hot_json, llm_text, created_at, updated_at"
            " FROM sessions WHERE id=?",
            (quiz_id,),
        )
        row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return None
    job_s, qs_s, scores_s, fus_s, hot_s, llm_t, created_at, updated_at = row

    def _j(s, default):
        try:
            return json.loads(s) if s else default
        except (json.JSONDecodeError, TypeError):
            return default

    return {
        "quiz_id": quiz_id,
        "job": _j(job_s, {}),
        "questions": _j(qs_s, []),
        "scores": _j(scores_s, {}),
        "followups": _j(fus_s, {}),
        "hot": _j(hot_s, []),
        "llm": llm_t or "",
        "created_at": created_at,
        "updated_at": updated_at,
    }


def update_score(quiz_id, qid, score, feedback, followup):
    """合并写入单题得分/反馈/追问；会话不存在返回 False."""
    init_db()
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT scores_json, followups_json FROM sessions WHERE id=?", (quiz_id,)
        )
        row = cur.fetchone()
        if not row:
            return False
        try:
            scores = json.loads(row[0]) if row[0] else {}
        except (json.JSONDecodeError, TypeError):
            scores = {}
        try:
            followups = json.loads(row[1]) if row[1] else {}
        except (json.JSONDecodeError, TypeError):
            followups = {}
        key = str(qid)
        scores[key] = {"score": score, "feedback": feedback}
        followups[key] = followup
        conn.execute(
            "UPDATE sessions SET scores_json=?, followups_json=?, updated_at=?"
            " WHERE id=?",
            (
                json.dumps(scores, ensure_ascii=False),
                json.dumps(followups, ensure_ascii=False),
                _now(),
                quiz_id,
            ),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def list_sessions(limit=20):
    init_db()
    conn = _connect()
    try:
        cur = conn.execute(
            "SELECT id, job_json, updated_at FROM sessions"
            " ORDER BY updated_at DESC LIMIT ?",
            (limit,),
        )
        out = []
        for sid, job_s, updated_at in cur.fetchall():
            try:
                job = json.loads(job_s) if job_s else {}
            except (json.JSONDecodeError, TypeError):
                job = {}
            out.append({"quiz_id": sid, "job": job, "updated_at": updated_at})
        return out
    finally:
        conn.close()


def delete_expired(days=7):
    """删除 updated_at 早于 N 天的会话，返回删除行数."""
    init_db()
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)
    ).isoformat()
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM sessions WHERE updated_at < ?", (cutoff,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()
