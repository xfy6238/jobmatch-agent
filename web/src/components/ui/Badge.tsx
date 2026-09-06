type BadgeProps = {
  children: React.ReactNode;
  variant?: "violet" | "blue" | "slate" | "emerald" | "amber";
  size?: "sm" | "md";
  className?: string;
};

/**
 * Editorial calm · 素雅纸质
 * violet = 实心 ink (fit ≥8) · blue = 线框 ink (fit ≥5) · slate = 淡 muted
 * emerald/amber 保留兼容，仅作柔和区分，整体保持暖纸线框
 */
const variantMap: Record<NonNullable<BadgeProps["variant"]>, string> = {
  // ≥8 实心 accent（素雅 sage，非笨重黑）
  violet: "bg-[var(--accent)] text-white border-[var(--accent)]",
  // ≥5 线框 accent 淡
  blue: "bg-[var(--accent-soft)] text-ink border-[var(--accent-line)]",
  // 其余淡
  slate: "bg-[#fafaf8] text-[#78716c] border-[#e8e6e1]",
  emerald: "bg-white text-[#57534e] border-[#e8e6e1]",
  amber: "bg-[#fafaf8] text-[#78716c]/80 border-[#e8e6e1]",
};

export function Badge({
  children,
  variant = "slate",
  size = "sm",
  className = "",
}: BadgeProps) {
  const sz =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] tracking-wide tabular-nums"
      : "px-2.5 py-1 text-[13px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium leading-none ${variantMap[variant]} ${sz} ${className}`}
    >
      {children}
    </span>
  );
}

export function fitVariant(fit?: number): BadgeProps["variant"] {
  if (fit == null) return "slate";
  if (fit >= 8) return "violet";
  if (fit >= 5) return "blue";
  return "slate";
}

export function activeVariant(mins?: number): BadgeProps["variant"] {
  // 徽章本体保持 muted，活跃度由 6px 圆点传达，variant 仅作兼容
  if (mins == null) return "slate";
  if (mins <= 180) return "slate";
  return "slate";
}

/** 6px 石/accent 点：越小越深（sage 渐变，非黑） */
export function activeDotCls(mins?: number): string {
  if (mins == null) return "bg-[#e8e6e1]";
  if (mins <= 60) return "bg-[var(--accent)]";
  if (mins <= 180) return "bg-[#6b7c6e]";
  if (mins <= 720) return "bg-[#78716c]";
  return "bg-[#a8a29e]";
}
