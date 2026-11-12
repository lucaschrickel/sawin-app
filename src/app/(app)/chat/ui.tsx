"use client";

import { Camera, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bestaetigen } from "@/components/ui/bestaetigen";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { erwaehnungAnfuegen, textTeile, type ChatPerson } from "@/lib/chat-logik";
import type { ChatNachricht } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { chatFotoVorbereiten, chatGelesen, chatStand, nachrichtLoeschen, nachrichtSenden } from "./aktionen";

type Bezug = { auftrag_id?: string; ticket_id?: string };

const zeit = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/**
 * Chat je Auftrag bzw. Ticket (CLAUDE.md „Chat“). Neue Nachrichten anderer erscheinen über eine Abfrage alle 10 Sekunden,
 * solange der Reiter sichtbar ist; beim Öffnen und bei neuen Nachrichten gilt alles als gelesen.
 */
export function ChatPanel({ bezug, nachrichten, personen, stand }: { bezug: Bezug; nachrichten: ChatNachricht[]; personen: ChatPerson[]; stand: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [meldung, setMeldung] = useState<{ fehler?: string; ok?: string }>({});
  const [laeuft, starten] = useTransition();
  const liste = useRef<HTMLDivElement>(null);
  const fotoFeld = useRef<HTMLInputElement>(null);
  const eingabe = useRef<HTMLTextAreaElement>(null);
  const bekannt = useRef(stand);
  const kuerzel = personen.map((p) => p.kuerzel);
  const bezugText = JSON.stringify(bezug);

  // Lesestand beim Öffnen und bei jedem neuen Stand; Abfrage alle 10 s, solange die Seite sichtbar ist
  useEffect(() => {
    bekannt.current = stand;
    void chatGelesen(JSON.parse(bezugText));
  }, [stand, bezugText]);
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const neu = await chatStand(JSON.parse(bezugText)).catch(() => bekannt.current);
      if (neu && neu !== bekannt.current) {
        bekannt.current = neu;
        router.refresh();
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [bezugText, router]);
  useEffect(() => {
    liste.current?.scrollTo({ top: liste.current.scrollHeight });
  }, [nachrichten.length]);

  const senden = () =>
    starten(async () => {
      setMeldung({});
      let pfad: string | null = null;
      if (foto) {
        const v = await chatFotoVorbereiten(foto.size);
        if (!v.url || !v.pfad) return setMeldung({ fehler: v.fehler ?? "Das Foto kann gerade nicht hochgeladen werden." });
        const typ = foto.type || (/\.(heic|heif)$/i.test(foto.name) ? "image/heic" : "application/octet-stream");
        const antwort = await fetch(v.url, { method: "PUT", body: foto, headers: { "content-type": typ, "x-upsert": "false" } }).catch(() => null);
        if (!antwort?.ok) return setMeldung({ fehler: "Das Foto konnte nicht hochgeladen werden. Bitte erneut versuchen." });
        pfad = v.pfad;
      }
      const r = await nachrichtSenden(bezug, text, pfad);
      if (r.fehler) return setMeldung({ fehler: r.fehler });
      setText("");
      setFoto(null);
      if (fotoFeld.current) fotoFeld.current.value = "";
      setMeldung({ ok: r.hinweis });
      eingabe.current?.focus();
    });

  return (
    <section className="flex flex-col rounded-lg border border-line-soft bg-surface" data-chat>
      <div ref={liste} className="flex max-h-[58vh] min-h-[200px] flex-col gap-3 overflow-y-auto px-5 py-4" data-chat-liste>
        {nachrichten.length ? (
          nachrichten.map((n) => (
            <article key={n.id} className={cn("flex max-w-[78%] flex-col gap-1", n.eigene && "self-end items-end")} data-chat-nachricht={n.id}>
              <div className="flex items-center gap-2 text-xs text-muted-2">
                <span className="font-semibold text-ink-3">{n.autor.name}</span>
                {n.autor.kuerzel && <span className="font-mono">{n.autor.kuerzel}</span>}
                <span className="tabular">{zeit(n.created_at)}</span>
                {n.eigene && (
                  <Bestaetigen titel="Nachricht löschen?" text="Die Nachricht wird für alle ausgeblendet." knopf="Löschen" gefahr ausfuehren={() => starten(async () => setMeldung({ fehler: (await nachrichtLoeschen(n.id)).fehler }))}>
                    <button type="button" aria-label="Nachricht löschen" className="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs hover:bg-surface-sunken hover:text-ink" data-chat-loeschen={n.id}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </Bestaetigen>
                )}
              </div>
              <div className={cn("rounded-md px-3.5 py-2.5 text-[14.5px]", n.eigene ? "bg-tone-brand-bg text-tone-brand-fg" : "bg-surface-sunken text-ink")}>
                {n.text && (
                  <p className="break-words whitespace-pre-wrap">
                    {textTeile(n.text, kuerzel).map((t, i) => (t.erwaehnung ? <span key={i} className="font-semibold text-accent-text" data-erwaehnung>{t.text}</span> : <span key={i}>{t.text}</span>))}
                  </p>
                )}
                {n.foto && (
                  <a href={n.foto} target="_blank" rel="noopener" className={cn("block", n.text && "mt-2")} data-chat-foto>
                    {/* eslint-disable-next-line @next/next/no-img-element -- kurzlebige signierte Adresse aus dem privaten Speicher */}
                    <img src={n.foto} alt="Foto im Chat" className="max-h-64 max-w-full rounded-sm object-contain" loading="lazy" />
                  </a>
                )}
              </div>
            </article>
          ))
        ) : (
          <p className="text-sm text-muted">Noch keine Nachrichten. Mit @Kürzel benachrichtigen Sie eine Kollegin oder einen Kollegen.</p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line-soft px-5 py-3.5">
        <Textarea
          ref={eingabe}
          name="nachricht"
          aria-label="Nachricht"
          className="min-h-[72px] text-[14.5px]"
          maxLength={4000}
          value={text}
          placeholder="Nachricht schreiben … (Strg+Enter sendet)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              senden();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {personen.length > 0 && (
            <select
              aria-label="Person erwähnen"
              className="h-9 rounded-sm border border-line bg-surface px-2 text-sm"
              value=""
              data-chat-erwaehnen
              onChange={(e) => {
                if (!e.target.value) return;
                setText((t) => erwaehnungAnfuegen(t, e.target.value));
                eingabe.current?.focus();
              }}
            >
              <option value="">@ erwähnen</option>
              {personen.map((p) => (
                <option key={p.id} value={p.kuerzel}>
                  {p.kuerzel} · {p.name}
                </option>
              ))}
            </select>
          )}
          <input ref={fotoFeld} type="file" accept="image/jpeg,image/png,image/heic,.heic" className="sr-only" tabIndex={-1} aria-label="Foto anhängen" data-chat-foto-datei onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          <Button size="sm" onClick={() => fotoFeld.current?.click()} data-chat-foto-knopf>
            <Camera className="size-4" /> Foto
          </Button>
          {foto && (
            <span className="inline-flex items-center gap-1 text-xs text-muted" data-chat-foto-gewaehlt>
              {foto.name}
              <button type="button" aria-label="Foto entfernen" className="cursor-pointer rounded-xs p-0.5 hover:bg-surface-sunken" onClick={() => { setFoto(null); if (fotoFeld.current) fotoFeld.current.value = ""; }}>
                <X className="size-3.5" />
              </button>
            </span>
          )}
          <span className="flex-1" />
          <Button size="sm" variant="primary" disabled={laeuft || (!text.trim() && !foto)} onClick={senden} data-chat-senden>
            <Send className="size-4" /> {laeuft ? "Sendet …" : "Senden"}
          </Button>
        </div>
        {meldung.fehler && <p role="alert" className="text-sm text-tone-red-fg">{meldung.fehler}</p>}
        {meldung.ok && <p role="status" className="text-sm text-tone-green-fg" data-chat-meldung>{meldung.ok}</p>}
      </div>
    </section>
  );
}

/** Anzahl ungelesener Nachrichten (Reiter, Liste, Board) */
export function ChatZahl({ n, className }: { n: number | undefined; className?: string }) {
  if (!n) return null;
  return (
    <span title={n === 1 ? "1 ungelesene Nachricht" : `${n} ungelesene Nachrichten`} className={cn("inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink tabular", className)} data-chat-ungelesen={n}>
      {n}
    </span>
  );
}
