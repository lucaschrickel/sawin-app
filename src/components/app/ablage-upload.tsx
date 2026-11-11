"use client";

import { Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { jetztNachladen, ordnerAnlegen, uploadAbschliessenAktion, uploadVorbereitenAktion } from "@/app/(app)/ablage/aktionen";

type Bezug = { anfrage_id?: string; auftrag_id?: string; ticket_id?: string };

const bezugFelder = (fd: FormData, b: Bezug) => {
  for (const [k, v] of Object.entries(b)) if (v) fd.set(k, v);
};

/**
 * Upload in drei Schritten: Upload-Adresse vom Server, Datei direkt in den privaten Zwischenspeicher (auch große
 * Scans), danach prüft der Server Typ und Größe und überträgt nach OneDrive.
 */
export function AblageUpload({ bezug, unterordner }: { bezug: Bezug; unterordner: string[] }) {
  const [meldung, setMeldung] = useState<{ ok?: string; fehler?: string }>({});
  const [laeuft, starten] = useTransition();
  const datei = useRef<HTMLInputElement>(null);
  const [ordner, setOrdner] = useState(unterordner.includes("04 Auftrag") ? "04 Auftrag" : (unterordner[0] ?? ""));

  const hochladen = () =>
    starten(async () => {
      const f = datei.current?.files?.[0];
      if (!f) return setMeldung({ fehler: "Bitte eine Datei wählen." });
      setMeldung({});
      const fd = new FormData();
      bezugFelder(fd, bezug);
      fd.set("name", f.name);
      fd.set("groesse", String(f.size));
      fd.set("unterordner", ordner);
      const v = await uploadVorbereitenAktion(fd);
      if (!v.ok || !v.url || !v.id) return setMeldung({ fehler: v.fehler ?? "Upload nicht möglich." });
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", f);
      const antwort = await fetch(v.url, { method: "PUT", body, headers: { "x-upsert": "true" } }).catch(() => null);
      if (!antwort?.ok) {
        await uploadAbschliessenAktion(v.id); // verwirft die unvollständige Datei
        return setMeldung({ fehler: "Die Datei konnte nicht hochgeladen werden. Bitte erneut versuchen." });
      }
      const r = await uploadAbschliessenAktion(v.id);
      if (r.fehler) return setMeldung({ fehler: r.fehler });
      setMeldung({ ok: r.hinweis });
      if (datei.current) datei.current.value = "";
    });

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-muted p-2.5" data-ablage-upload>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={datei} type="file" name="datei" aria-label="Datei für den OneDrive-Ordner" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx,.xlsx" className="min-w-0 flex-1 text-xs file:mr-2 file:rounded-xs file:border file:border-line file:bg-surface file:px-2 file:py-1 file:text-xs" />
        {unterordner.length > 0 && (
          <select aria-label="Unterordner" value={ordner} onChange={(e) => setOrdner(e.target.value)} className="h-8 max-w-full rounded-xs border border-line bg-surface px-2 text-xs">
            {unterordner.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        <Button size="xs" onClick={hochladen} disabled={laeuft} data-ablage-hochladen>
          <Upload className="size-3.5" /> {laeuft ? "Lädt …" : "Hochladen"}
        </Button>
      </div>
      {meldung.fehler && <p role="alert" className="text-xs text-tone-red-fg">{meldung.fehler}</p>}
      {meldung.ok && <p role="status" className="text-xs text-tone-green-fg">{meldung.ok}</p>}
    </div>
  );
}

/** „Ordner anlegen“ (ältere Aufträge, Tickets) und „Jetzt übertragen“ (Zwischenspeicher) */
export function AblageAktionen({ bezug, ordnerFehlt, wartend, verbunden }: { bezug: Bezug; ordnerFehlt: boolean; wartend: number; verbunden: boolean }) {
  const [meldung, setMeldung] = useState<string>();
  const [laeuft, starten] = useTransition();
  if (!ordnerFehlt && !(wartend && verbunden)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ordnerFehlt && (
        <Button
          size="xs"
          disabled={laeuft}
          data-ablage-ordner-anlegen
          onClick={() =>
            starten(async () => {
              const fd = new FormData();
              bezugFelder(fd, bezug);
              const r = await ordnerAnlegen(fd);
              setMeldung(r.fehler);
            })
          }
        >
          Ordner anlegen
        </Button>
      )}
      {wartend > 0 && verbunden && (
        <Button size="xs" disabled={laeuft} onClick={() => starten(async () => setMeldung((await jetztNachladen()).fehler))}>
          {wartend === 1 ? "1 Datei" : `${wartend} Dateien`} jetzt übertragen
        </Button>
      )}
      {meldung && <p className="w-full text-xs text-tone-amber-fg">{meldung}</p>}
    </div>
  );
}
