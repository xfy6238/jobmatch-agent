import type { Job } from "../../../types";
import { Badge, fitVariant, activeDotCls } from "../../../components/ui/Badge";

type Props = {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onDiagnose: (job: Job) => void;
  onQuickMatch: (job: Job) => void;
};

function FitBadge({ fit }: { fit?: number }) {
  const v = fitVariant(fit);
  return (
    <Badge variant={v} className="tabular-nums">
      {fit != null ? `fit ${fit}` : "—"}
    </Badge>
  );
}

function ActiveCell({ mins, desc }: { mins?: number; desc?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeDotCls(mins)}`}
        aria-hidden
      />
      <span className="text-[13px] leading-none text-[#57534e] tabular-nums">
        {desc ?? "—"}
      </span>
    </span>
  );
}

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return <span className="text-[13px] text-[#a8a29e]">—</span>;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#e8e6e1] bg-[#fafaf8] text-[11px] leading-none tracking-wide text-[#78716c]">
      {tier}
    </span>
  );
}

export function JobTable({
  jobs,
  total,
  page,
  pageSize,
  onPageChange,
  onDiagnose,
  onQuickMatch,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) {
    return (
      <div
        className="bg-white rounded-[16px] border border-[#e8e6e1] overflow-hidden text-center"
        style={{ ["--accent" as string]: "#57534e" }}
      >
        <div className="h-px bg-[var(--accent)] opacity-60" />
        <div className="px-6 py-10">
          <div className="font-serif text-[16px] leading-tight text-[#1c1917]">
            无匹配结果
          </div>
          <div className="mt-2 text-[13px] leading-relaxed text-[#78716c]">
            试试放宽关键词、区域或降低薪资门槛，也可重置筛选后重新搜索
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-[16px] border border-[#e8e6e1] overflow-hidden"
      style={{ ["--accent" as string]: "#57534e" }}
    >
      {/* desktop table: 粘性头 */}
      <div className="hidden md:block overflow-auto max-h-[72vh]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-white border-b border-[#e8e6e1]">
            <tr>
              <th className="text-left font-medium text-[11px] tracking-[0.12em] uppercase text-[#78716c] px-4 py-3 whitespace-nowrap">
                岗位
              </th>
              <th className="text-left font-medium text-[11px] tracking-[0.12em] uppercase text-[#78716c] px-3 py-3 whitespace-nowrap">
                关键词
              </th>
              <th className="text-left font-medium text-[11px] tracking-[0.12em] uppercase text-[#78716c] px-3 py-3 whitespace-nowrap">
                区域
              </th>
              <th className="text-left font-medium text-[11px] tracking-[0.12em] uppercase text-[#78716c] px-3 py-3 whitespace-nowrap">
                薪资
              </th>
              <th className="text-left font-medium text-[11px] tracking-[0.12em] uppercase text-[#78716c] px-3 py-3 whitespace-nowrap">
                活跃
              </th>
              <th className="text-left font-medium text-[11px] tracking-[0.12em] uppercase text-[#78716c] px-3 py-3 whitespace-nowrap">
                匹配
              </th>
              <th className="text-left font-medium text-[11px] tracking-[0.12em] uppercase text-[#78716c] px-3 py-3 whitespace-nowrap">
                档位
              </th>
              <th className="text-right font-medium text-[11px] tracking-[0.12em] uppercase text-[#78716c] px-4 py-3 whitespace-nowrap">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.url}
                className="h-[52px] border-b border-[#e8e6e1]/60 last:border-b-0 hover:bg-[#fafaf8] hover:border-[#e8e6e1] transition-colors"
              >
                <td className="px-4 py-3 min-w-[220px] max-w-[320px]">
                  <div
                    className="font-medium leading-tight line-clamp-2 text-[13px] text-[#1c1917]"
                    title={job.title}
                  >
                    {job.title}
                  </div>
                  <div
                    className="text-[13px] leading-none text-[#78716c] truncate mt-1"
                    title={job.company}
                  >
                    {job.company}
                  </div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-[#fafaf8] border border-[#e8e6e1] text-[11px] tracking-wide text-[#78716c]">
                    {job.keyword ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-[13px] text-[#57534e]">
                  {job.district || "杭州"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap font-medium tabular-nums text-[13px] text-[#1c1917]">
                  {job.salary}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <ActiveCell mins={job.activeMins} desc={job.activeDesc} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <FitBadge fit={job.fit} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <TierBadge tier={job.tier} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] leading-none text-[#57534e] hover:text-[#1c1917] underline decoration-[#e8e6e1] underline-offset-4 hover:decoration-[#1c1917] transition"
                    >
                      查看JD
                    </a>
                    <button
                      onClick={() => onDiagnose(job)}
                      className="text-[13px] leading-none text-[#57534e] hover:text-[#1c1917] underline decoration-[#e8e6e1] underline-offset-4 hover:decoration-[#1c1917] transition"
                    >
                      匹配诊断
                    </button>
                    <button
                      onClick={() => onQuickMatch(job)}
                      className="text-[13px] leading-none text-[#78716c] hover:text-[#1c1917] underline decoration-[#e8e6e1] underline-offset-4 hover:decoration-[#78716c] transition"
                    >
                      画像匹配
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards: 白底细边 16px 圆角 内边16 间距12 */}
      <div className="md:hidden p-3 grid gap-3 bg-[#fafaf8]/40">
        {jobs.map((job) => (
          <div
            key={job.url + "-m"}
            className="bg-white rounded-[16px] border border-[#e8e6e1] p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-snug line-clamp-2 text-[13px] text-[#1c1917]">
                  {job.title}
                </div>
                <div className="text-[13px] text-[#78716c] truncate mt-1">
                  {job.company}
                </div>
              </div>
              <FitBadge fit={job.fit} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex px-2 py-0.5 rounded-full bg-[#fafaf8] border border-[#e8e6e1] text-[11px] tracking-wide text-[#78716c]">
                {job.keyword ?? "—"}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded-full bg-[#fafaf8] border border-[#e8e6e1] text-[11px] tracking-wide text-[#78716c]">
                {job.district || "杭州"}
              </span>
              <span className="inline-flex px-2 py-0.5 rounded-full bg-[#fafaf8] border border-[#e8e6e1] text-[11px] tracking-wide tabular-nums text-[#57534e]">
                {job.salary}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#fafaf8] border border-[#e8e6e1] text-[11px] tracking-wide text-[#57534e]">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeDotCls(job.activeMins)}`}
                />
                {job.activeDesc ?? "—"}
              </span>
              {job.tier && <TierBadge tier={job.tier} />}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#e8e6e1]/60">
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center py-2 text-[13px] leading-none text-[#57534e] hover:text-[#1c1917] underline decoration-[#e8e6e1] underline-offset-4 hover:decoration-[#1c1917] transition"
              >
                查看JD
              </a>
              <button
                onClick={() => onDiagnose(job)}
                className="inline-flex items-center justify-center py-2 text-[13px] leading-none text-[#57534e] hover:text-[#1c1917] underline decoration-[#e8e6e1] underline-offset-4 hover:decoration-[#1c1917] transition"
              >
                匹配诊断
              </button>
              <button
                onClick={() => onQuickMatch(job)}
                className="inline-flex items-center justify-center py-2 text-[13px] leading-none text-[#78716c] hover:text-[#1c1917] underline decoration-[#e8e6e1] underline-offset-4 hover:decoration-[#78716c] transition"
              >
                画像匹配
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 分页：极简 文本链 + 当前页 ink底 paper字 28px圆 + 总数 11px muted 居中 */}
      <div className="flex flex-col items-center gap-2.5 px-4 py-4 border-t border-[#e8e6e1] bg-white">
        <div className="text-[11px] tracking-wide text-[#78716c] tabular-nums text-center">
          共 {total} 条 · 第 {page}/{totalPages} 页 · 每页 {pageSize} 条
        </div>
        <div className="flex items-center gap-1.5">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-2 py-1 text-[13px] leading-none text-[#78716c] hover:text-[#1c1917] underline decoration-transparent hover:decoration-[#78716c] underline-offset-4 disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed transition"
          >
            上一页
          </button>
          <div className="hidden sm:flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => {
                if (totalPages <= 7) return true;
                if (n === 1 || n === totalPages) return true;
                if (Math.abs(n - page) <= 1) return true;
                if (page <= 3 && n <= 4) return true;
                if (page >= totalPages - 2 && n >= totalPages - 3) return true;
                return false;
              })
              .reduce<(number | string)[]>((acc, n, idx, arr) => {
                const prev = arr[idx - 1];
                if (
                  prev != null &&
                  typeof prev === "number" &&
                  typeof n === "number" &&
                  n - (prev as number) > 1
                )
                  acc.push("…");
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) =>
                typeof n === "string" ? (
                  <span
                    key={`e-${i}`}
                    className="px-1 text-[13px] text-[#a8a29e]"
                  >
                    {n}
                  </span>
                ) : (
                  <button
                    key={n}
                    onClick={() => onPageChange(n as number)}
                    className={`w-7 h-7 grid place-items-center rounded-full text-[13px] tabular-nums leading-none border transition ${
                      n === page
                        ? "bg-[var(--accent-soft)] text-ink border-[var(--accent-line)]"
                        : "bg-white text-[#78716c] border-transparent hover:border-[#e8e6e1] hover:text-[#1c1917]"
                    }`}
                    aria-current={n === page ? "page" : undefined}
                  >
                    {n}
                  </button>
                ),
              )}
          </div>
          {/* 移动端仅显示当前页 pill + 总页 */}
          <div className="sm:hidden flex items-center gap-1">
            <span className="w-7 h-7 grid place-items-center rounded-full bg-[var(--accent-soft)] text-ink text-[13px] tabular-nums leading-none border border-[var(--accent-line)]">
              {page}
            </span>
            <span className="text-[13px] text-[#a8a29e]">/ {totalPages}</span>
          </div>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-2 py-1 text-[13px] leading-none text-[#78716c] hover:text-[#1c1917] underline decoration-transparent hover:decoration-[#78716c] underline-offset-4 disabled:opacity-30 disabled:no-underline disabled:cursor-not-allowed transition"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
