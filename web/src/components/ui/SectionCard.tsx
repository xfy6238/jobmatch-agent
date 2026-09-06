import * as React from "react";

type SectionCardProps = {
  title?: string;
  kicker?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
};

/**
 * Editorial paper card — D1 design system.
 * Single muted palette, hairline line, soft shadow, 20px radius.
 * Use for stats, demo script, section containers.
 */
export function SectionCard({
  title,
  kicker,
  action,
  children,
  className = "",
  padded = true,
}: SectionCardProps) {
  return (
    <section
      className={["card overflow-hidden", padded ? "" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {(kicker || title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--line)]">
          <div className="min-w-0">
            {kicker && (
              <div className="text-[10px] tracking-[0.16em] font-medium text-stone/70 uppercase leading-none">
                {kicker}
              </div>
            )}
            {title && (
              <h3
                className={`font-serif text-[15px] font-[600] tracking-tight text-ink leading-none ${kicker ? "mt-1.5" : ""}`}
              >
                {title}
              </h3>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function CardDivider({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-[var(--line)] ${className}`} />;
}
