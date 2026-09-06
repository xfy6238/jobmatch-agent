#!/bin/bash
# jobmatch-agent 一键演示（开源版）
# 数据：data/sample_jobs.json（20 条虚构样例，开箱即用）
# 换成你自己的 JD：export JOBS_JSON=/path/to/your_jobs.json
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
WEB="$ROOT/web"
LOG_DIR="${LOG_DIR:-/tmp}"

echo "[1/3] ingest 样例数据 → Chroma（可选；跳过也能跑规则排序）"
if [ -n "${SKIP_INGEST:-}" ]; then
  echo "  SKIP_INGEST 已设，跳过灌库"
else
  (cd "$BACKEND" && python3 ingest.py) || echo "  ingest 失败，继续（将回退规则排序）"
fi

echo "[2/3] 后端 8321"
if curl -s http://127.0.0.1:8321/api/health | grep -q '"ok":true'; then
  echo "  后端已在 8321，无需重起"
else
  nohup uvicorn app:app --port 8321 --host 127.0.0.1 --app-dir "$BACKEND" >"$LOG_DIR/jobmatch.log" 2>&1 &
  for i in 1 2 3 4 5; do
    sleep 2
    if curl -s http://127.0.0.1:8321/api/health | grep -q '"ok":true'; then
      echo "  后端就绪：http://127.0.0.1:8321/api/health"
      break
    fi
    echo "  等待后端... $i"
  done
fi

echo "[3/3] 前端 5173/5174"
cd "$WEB"
if [ ! -d node_modules ]; then
  echo "  首次安装依赖..."
  (pnpm install || npm install)
fi
(pnpm dev --host 127.0.0.1 --port 5173 || npm run dev -- --host 127.0.0.1 --port 5173) >"$LOG_DIR/jobmatch-vite.log" 2>&1 &
VITE_PID=$!
sleep 2
for P in 5173 5174 5175; do
  if curl -s "http://127.0.0.1:$P/" | grep -q "id=\"root\""; then
    URL="http://127.0.0.1:$P/"
    break
  fi
done
URL="${URL:-http://127.0.0.1:5173/}"
echo "  前端就绪：$URL"
echo "  后端日志：tail -f $LOG_DIR/jobmatch.log"
echo "  前端日志：tail -f $LOG_DIR/jobmatch-vite.log"
if command -v open >/dev/null 2>&1; then
  sleep 1
  open "$URL" 2>/dev/null || true
fi
echo "—— 演示就绪：$URL + http://127.0.0.1:8321/api/health ——"
echo "—— 无 Key 评测：cd backend && python3 eval.py（规则模式应 10/10） ——"
wait $VITE_PID
