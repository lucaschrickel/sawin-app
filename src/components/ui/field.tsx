"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-line bg-surface px-[13px] text-base text-ink outline-none placeholder:text-muted-2 focus:border-accent focus:shadow-[0_0_0_3px_var(--focus-ring)] disabled:bg-surface-muted disabled:text-muted aria-[invalid=true]:border-tone-red-fg";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-[42px]", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-[84px] resize-y py-2.5", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-sm font-medium text-ink-3", className)} {...props} />;
}

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
};

/** Beschriftetes Formularfeld mit Hinweis und Fehlermeldung (barrierefrei verknüpft). */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": descId, "aria-invalid": error ? true : undefined })}
      {(error || hint) && (
        <small id={descId} className={cn("text-xs", error ? "text-tone-red-fg" : "text-muted-2")}>
          {error ?? hint}
        </small>
      )}
    </div>
  );
}
