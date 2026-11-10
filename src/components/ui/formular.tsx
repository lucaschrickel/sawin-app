"use client";

import { startTransition, type ComponentProps } from "react";

/**
 * Formular für Server-Aktionen (mit useActionState). Anders als <form action={…}> setzt React die Felder nach der
 * Aktion nicht zurück: Meldet der Server einen Fehler, bleiben alle Eingaben erhalten. Die Browser-Prüfung
 * (required, type=email …) läuft wie gewohnt vor dem Absenden.
 */
export function Formular({ aktion, ...props }: Omit<ComponentProps<"form">, "action" | "onSubmit"> & { aktion: (fd: FormData) => void }) {
  return (
    <form
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => aktion(fd));
      }}
    />
  );
}
