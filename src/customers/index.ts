import type { ComponentType } from "react";
import type { CustomerConfig, SlotName } from "./types";
import { sawin } from "./sawin";

/**
 * Kundenregister. Jede Instanz (ein Vercel-Projekt je Kunde) setzt
 * NEXT_PUBLIC_CUSTOMER_ID auf die id des Kunden. Kundeneigener Code liegt
 * ausschließlich in src/customers/<id>/.
 */
const customers: Record<string, CustomerConfig> = {
  [sawin.id]: sawin,
};

export function getCustomer(): CustomerConfig {
  const id = process.env.NEXT_PUBLIC_CUSTOMER_ID ?? "sawin";
  const customer = customers[id];
  if (!customer) {
    throw new Error(`Unbekannter Kunde: ${id}. Bitte in src/customers/index.ts registrieren.`);
  }
  return customer;
}

/** Liefert die Sonderkomponente des Kunden, sonst den Basis-Baustein. */
export function resolveSlot<P extends object>(
  name: SlotName,
  fallback: ComponentType<P>,
): ComponentType<P> {
  const override = getCustomer().overrides[name] as ComponentType<P> | undefined;
  return override ?? fallback;
}
