export type FilterState = {
  keyword: string;
  source: string;
  district: string;
  minMid: string;
  sort: string;
  q: string;
};

export const KEYWORD_OPTIONS = [
  "全部",
  "AI开发",
  "AI Agent",
  "大模型",
  "AI应用",
  "Flutter",
  "前端",
  "客户端",
] as const;
export const SOURCE_OPTIONS = ["全部", "示例直聘", "示例猎聘"] as const;
export const DISTRICT_OPTIONS = [
  "全部",
  "滨江区",
  "余杭区",
  "西湖区",
  "萧山区",
  "上城区",
] as const;
export const SALARY_OPTIONS = [
  { label: "不限", value: "" },
  { label: "≥17K", value: "17" },
  { label: "≥20K", value: "20" },
  { label: "≥25K", value: "25" },
] as const;
export const SORT_OPTIONS = [
  { label: "默认 · 匹配→活跃→薪资", value: "default" },
  { label: "活跃优先", value: "active" },
  { label: "薪资优先", value: "salary" },
  { label: "匹配度优先", value: "fit" },
] as const;

type Props = {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  total: number;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[10px] tracking-[0.14em] font-medium text-[#78716c] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

const selectCls =
  "w-full h-9 bg-[#fafaf8] border border-[#e8e6e1] rounded-xl px-3 text-[13px] text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/15 transition";
const inputCls =
  "w-full h-9 bg-[#fafaf8] border border-[#e8e6e1] rounded-xl px-3 text-[13px] text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/15 transition";

export function FilterBar({ filters, onChange, onReset, total }: Props) {
  return (
    <div
      className="bg-white rounded-[16px] border border-[#e8e6e1] p-4 md:p-5"
      style={{ ["--accent" as string]: "#57534e" }}
    >
      {/* 6 控件：移动端 2列网格 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Field label="关键词">
          <select
            value={filters.keyword}
            onChange={(e) => onChange({ keyword: e.target.value })}
            className={selectCls}
          >
            {KEYWORD_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <Field label="来源">
          <select
            value={filters.source}
            onChange={(e) => onChange({ source: e.target.value })}
            className={selectCls}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <Field label="区域">
          <select
            value={filters.district}
            onChange={(e) => onChange({ district: e.target.value })}
            className={selectCls}
          >
            {DISTRICT_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <Field label="薪资下限">
          <select
            value={filters.minMid}
            onChange={(e) => onChange({ minMid: e.target.value })}
            className={selectCls}
          >
            {SALARY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="排序">
          <select
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
            className={`${selectCls} col-span-2 md:col-span-1`}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* 搜索 + 文本链重置 + 总数右对齐 */}
      <div className="mt-4 grid grid-cols-2 md:flex md:items-end gap-3">
        <label className="col-span-2 md:flex-1 flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] tracking-[0.14em] font-medium text-[#78716c] uppercase">
            搜索 · 标题 / 公司
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a29e] text-[13px]">
              ⌕
            </span>
            <input
              value={filters.q}
              onChange={(e) => onChange({ q: e.target.value })}
              placeholder="例如：AI Agent、示例公司、前端…"
              className={`${inputCls} pl-8`}
            />
          </div>
        </label>

        <div className="col-span-2 md:col-auto flex items-center justify-between md:justify-end gap-3 shrink-0 md:pb-[2px]">
          <button
            onClick={onReset}
            className="text-[13px] text-[#78716c] hover:text-[#1c1917] underline decoration-[#e8e6e1] underline-offset-4 hover:decoration-[#78716c] transition"
            type="button"
          >
            重置筛选
          </button>
          <span className="hidden md:inline-flex text-[11px] tracking-wide text-[#78716c] tabular-nums">
            筛选后 {total} 条
          </span>
          <span className="md:hidden text-[11px] tracking-wide text-[#78716c] tabular-nums">
            {total} 条
          </span>
        </div>
      </div>

      {/* 桌面端总数右对齐补充（与设计“总数用 11px muted 右对齐”一致，已在行内右对；移动端已内联展示） */}
      <div className="hidden md:flex justify-end mt-2">
        <span className="text-[11px] tracking-wide text-[#78716c]/70 tabular-nums">
          共 {total} 条结果 · 前端分页每页 20
        </span>
      </div>
    </div>
  );
}
