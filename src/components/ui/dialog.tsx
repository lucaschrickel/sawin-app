"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  wide?: boolean;
};

export function DialogContent({ title, description, wide, className, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-[rgb(15_15_15/0.55)]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-8 left-1/2 z-[101] max-h-[calc(100vh-4rem)] w-[calc(100%-2rem)] -translate-x-1/2 overflow-y-auto rounded-[22px] bg-surface shadow-pop outline-none max-sm:top-0 max-sm:h-full max-sm:max-h-none max-sm:w-full max-sm:rounded-none",
          wide ? "max-w-[920px]" : "max-w-[620px]",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b border-line-soft px-6 py-5">
          <div>
            <DialogPrimitive.Title className="text-xl font-semibold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label="Schließen"
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-sm hover:bg-canvas"
          >
            <X className="size-[18px]" />
          </DialogPrimitive.Close>
        </div>
        <div className="px-6 pt-5 pb-6">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
