import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors cursor-pointer disabled:cursor-default disabled:opacity-55 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white border border-ink hover:bg-[#2e2e2e]",
        accent: "bg-accent text-accent-ink border border-accent hover:bg-accent-hover",
        secondary: "bg-surface text-ink border border-line hover:border-line-strong",
        ghost: "bg-transparent text-ink border border-transparent hover:bg-surface-sunken",
        danger: "bg-surface text-tone-red-fg border border-line hover:border-tone-red-fg",
      },
      size: {
        md: "h-[42px] px-[18px] text-base rounded-md",
        sm: "h-9 px-3.5 text-sm rounded-sm",
        xs: "h-[30px] px-[11px] text-[12.5px] font-medium rounded-xs",
        icon: "size-[42px] rounded-full",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
