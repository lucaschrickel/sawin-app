"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-line bg-surface px-[13px] text-base text-ink outline-none placeholder:text-muted-2 focus:border-(--focus-ring) focus:shadow-[0_0_0_1px_var(--focus-ring)] disabled:bg-surface-muted disabled:text-muted aria-[invalid=true]:border-tone-red-fg";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-[42px]", className)} {...props} />;
}

/**
 * Passwortfeld mit Augen-Symbol zum Ein- und Ausblenden. Standard: ausgeblendet.
 * Der Knopf ist ein Umschalter (aria-pressed) mit fester Beschriftung „Passwort anzeigen“,
 * per Tab erreichbar und mit Leertaste oder Enter bedienbar.
 */
export function PasswortInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [sichtbar, setSichtbar] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={sichtbar ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        onClick={() => setSichtbar((s) => !s)}
        aria-label="Passwort anzeigen"
        aria-pressed={sichtbar}
        aria-controls={props.id}
        title={sichtbar ? "Passwort verbergen" : "Passwort anzeigen"}
        data-passwort-auge
        className="absolute inset-y-0 right-0 inline-flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted hover:text-ink focus-visible:-outline-offset-2"
      >
        {sichtbar ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
      </button>
    </div>
  );
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
