# web 前端（JobMatch Agent 三页）

> 完整说明见仓库根 `README.md`。这里只记前端启动方式。

```bash
cd web
pnpm install   # 或 npm install
pnpm dev --port 5173   # vite proxy /api → http://127.0.0.1:8321（见 vite.config.ts）
```

* 三页：`/` 匹配诊断 S1｜`/quiz` 模拟面试 S2｜`/jobs` 岗位库（读 `public/jobs.json` 虚构示例）。
* 生产构建：`pnpm run build`（`tsc -b && vite build`，产物 `dist/` 不进仓库）。
