const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const eurRound = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/** 1.234,56 € */
export const eur = (n: number) => eurFmt.format(n);
/** 1.235 € */
export const eurK = (n: number) => eurRound.format(n);
/** 17.10.2026 */
export const datum = (d: Date | string) => dateFmt.format(typeof d === "string" ? new Date(d) : d);
