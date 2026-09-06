import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Job } from "../../types";
import { FilterBar, type FilterState } from "./components/FilterBar";
import { JobTable } from "./components/JobTable";

const PAGE_SIZE = 20;

function matchesKeyword(jobKw: string | undefined, filterKw: string): boolean {
  if (filterKw === "全部") return true;
  if (!jobKw) return false;
  if (filterKw === "AI应用")
    return jobKw === "AI应用开发" || jobKw === "AI应用";
  return jobKw === filterKw;
}

function matchesSource(
  jobSource: string | undefined,
  filterSource: string,
): boolean {
  if (filterSource === "全部") return true;
  if (!jobSource) return false;
  if (filterSource === "Boss") return jobSource.includes("Boss");
  if (filterSource === "猎聘") return jobSource.includes("猎聘");
  return jobSource === filterSource;
}

function sortJobs(list: Job[], sort: string): Job[] {
  const copy = [...list];
  if (sort === "active") {
    copy.sort((a, b) => (a.activeMins ?? 1e9) - (b.activeMins ?? 1e9));
    return copy;
  }
  if (sort === "salary") {
    copy.sort((a, b) => (b.sal_mid ?? 0) - (a.sal_mid ?? 0));
    return copy;
  }
  if (sort === "fit") {
    copy.sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1));
    return copy;
  }
  // default: fit → active → salary
  copy.sort((a, b) => {
    const fitD = (b.fit ?? -1) - (a.fit ?? -1);
    if (fitD !== 0) return fitD;
    const actD = (a.activeMins ?? 1e9) - (b.activeMins ?? 1e9);
    if (actD !== 0) return actD;
    return (b.sal_mid ?? 0) - (a.sal_mid ?? 0);
  });
  return copy;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-[16px] border border-[#e8e6e1] p-4">
      <div className="text-[10px] tracking-[0.14em] font-medium text-[#78716c] uppercase">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[22px] font-medium leading-none tracking-tight text-[#1c1917] tabular-nums">
          {value}
        </span>
        <span className="text-[11px] text-[#78716c] leading-none">{sub}</span>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    keyword: "全部",
    source: "全部",
    district: "全部",
    minMid: "",
    sort: "default",
    q: "",
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/jobs.json");
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const data = (await r.json()) as Job[] | { jobs: Job[] };
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as { jobs: Job[] }).jobs)
            ? (data as { jobs: Job[] }).jobs
            : [];
        if (!cancelled) {
          if (list.length === 0) setError("本地 jobs.json 为空");
          setJobs(list);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const handleReset = () => {
    setFilters({
      keyword: "全部",
      source: "全部",
      district: "全部",
      minMid: "",
      sort: "default",
      q: "",
    });
  };

  useEffect(() => {
    setPage(1);
  }, [
    filters.keyword,
    filters.source,
    filters.district,
    filters.minMid,
    filters.sort,
    filters.q,
  ]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const min = filters.minMid ? Number(filters.minMid) : null;
    const list = jobs.filter((j) => {
      const company = (j.company || "").trim();
      if (!company || company === "—" || company.includes("某")) return false;
      if (!matchesKeyword(j.keyword, filters.keyword)) return false;
      if (!matchesSource(j.source, filters.source)) return false;
      if (
        filters.district !== "全部" &&
        (j.district ?? "") !== filters.district
      )
        return false;
      if (min != null && (j.sal_mid ?? 0) < min) return false;
      if (q) {
        const hay = `${j.title} ${j.company}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortJobs(list, filters.sort);
  }, [jobs, filters]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const handleDiagnose = (job: Job) => {
    try {
      localStorage.setItem("lastJobUrl", job.url);
    } catch {
      /* ignore */
    }
    navigate(`/quiz?jobUrl=${encodeURIComponent(job.url)}`);
  };

  const handleQuickMatch = (job: Job) => {
    try {
      sessionStorage.setItem(
        "quickMatchHint",
        `以「${job.title} @ ${job.company}」为目标，粘贴你的画像自动匹配 Top3`,
      );
    } catch {
      /* ignore */
    }
    navigate("/");
  };

  if (loading) {
    return (
      <div className="space-y-4" style={{ ["--accent" as string]: "#57534e" }}>
        <div className="bg-white rounded-[16px] border border-[#e8e6e1] overflow-hidden">
          <div className="h-px bg-[var(--accent)]" />
          <div className="p-5 md:p-6">
            <div className="h-7 w-44 bg-[#e8e6e1]/50 rounded animate-pulse" />
            <div className="mt-2 h-4 w-[68%] max-w-[560px] bg-[#e8e6e1]/35 rounded animate-pulse" />
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[78px] bg-[#fafaf8] border border-[#e8e6e1] rounded-[16px] animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[16px] border border-[#e8e6e1] p-4 md:p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-9 bg-[#e8e6e1]/30 rounded-xl animate-pulse"
              />
            ))}
          </div>
          <div className="mt-4 h-9 bg-[#e8e6e1]/25 rounded-xl animate-pulse" />
        </div>
        <div className="bg-white rounded-[16px] border border-[#e8e6e1] p-6">
          <div className="h-4 w-28 bg-[#e8e6e1]/40 rounded mx-auto animate-pulse" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[52px] bg-[#fafaf8] border border-[#e8e6e1]/60 rounded-xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="bg-white rounded-[16px] border border-[#e8e6e1] overflow-hidden text-center"
        style={{ ["--accent" as string]: "#57534e" }}
      >
        <div className="h-px bg-[var(--accent)]" />
        <div className="p-10">
          <div className="font-serif text-[16px] leading-tight text-[#1c1917]">
            加载未完成
          </div>
          <div className="mt-2 text-[13px] leading-relaxed text-[#78716c]">
            {error} · 已尝试 /jobs.json（虚构示例数据）
          </div>
          <button
            onClick={() => location.reload()}
            className="mt-5 inline-flex items-center text-[13px] text-[#57534e] hover:text-[#1c1917] underline decoration-[#e8e6e1] underline-offset-4 hover:decoration-[#78716c] transition"
          >
            重试加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ ["--accent" as string]: "#57534e" }}>
      {/* 顶部统计：serif 26 + 13 muted + 1px accent 线 + 纸质极简 4卡 */}
      <div className="bg-white rounded-[16px] border border-[#e8e6e1] overflow-hidden">
        <div className="h-px bg-[var(--accent)]" />
        <div className="p-5 md:p-6">
          <div>
            <h1 className="font-serif text-[26px] leading-none tracking-tight text-[#1c1917]">
              岗位库 20条示例岗位
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[#78716c]">
              虚构数据开箱即用 · 支持关键词/来源/区域/薪资/排序/模糊搜索 ·
              前端分页每页20条
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="总数" value={String(jobs.length)} sub="示例岗位" />
            <StatCard label="来源" value="Demo" sub="虚构数据" />
            <StatCard
              label="薪资 ≥17K"
              value={String(jobs.filter((j) => (j.sal_mid ?? 0) >= 17).length)}
              sub="条"
            />
            <StatCard
              label="高优 fit≥5"
              value={String(jobs.filter((j) => (j.fit ?? 0) >= 5).length)}
              sub="条"
            />
          </div>
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        total={filtered.length}
      />

      <JobTable
        jobs={paged}
        total={filtered.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onDiagnose={handleDiagnose}
        onQuickMatch={handleQuickMatch}
      />

      <div className="text-center text-[11px] tracking-wide leading-relaxed text-[#78716c]/70">
        数据来自 public/jobs.json（虚构示例）· 本地筛选 · 外链直达 JD ·
        匹配诊断写入 localStorage(lastJobUrl)
      </div>
    </div>
  );
}
