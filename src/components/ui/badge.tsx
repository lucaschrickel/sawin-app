import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-tight whitespace-nowrap",
  {
    variants: {
      tone: {
        gray: "bg-tone-gray-bg text-tone-gray-fg",
        blue: "bg-tone-blue-bg text-tone-blue-fg",
        green: "bg-tone-green-bg text-tone-green-fg",
        amber: "bg-tone-amber-bg text-tone-amber-fg",
        red: "bg-tone-red-bg text-tone-red-fg",
        dark: "bg-tone-dark-bg text-tone-dark-fg",
        brand: "bg-tone-brand-bg text-tone-brand-fg",
      },
    },
    defaultVariants: { tone: "gray" },
  },
);

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

const dotColor: Record<Tone, string> = {
  gray: "var(--dot-gray)",
  blue: "var(--dot-blue)",
  green: "var(--dot-green)",
  amber: "var(--dot-amber)",
  red: "var(--dot-red)",
  dark: "var(--dot-dark)",
  brand: "var(--dot-brand)",
};

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean };

/** Status-Pille. Mit `dot` für Pipeline-Status, ohne für Belegstatus. */
export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className="size-[7px] rounded-full"
          style={{ background: dotColor[tone ?? "gray"] }}
        />
      )}
      {children}
    </span>
  );
}

export function StatusDot({ tone = "gray", className }: { tone?: Tone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: dotColor[tone] }}
    />
  );
}

/** Kleines Schlagwort, z. B. Produkte oder Herkunft. */
export function Tag({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("rounded-full bg-tone-gray-bg px-2.5 py-[3px] text-xs whitespace-nowrap text-ink-3", className)}
      {...props}
    />
  );
}
