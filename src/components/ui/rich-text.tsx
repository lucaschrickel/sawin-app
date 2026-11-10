"use client";

import { Color, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Underline } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/*
  Formatierbarer Text (CLAUDE.md „Formatierte Texte“): fett, kursiv, unterstrichen, Aufzählung, Nummerierung,
  Schriftfarbe. TipTap (ProseMirror) statt execCommand. Die Format-Leiste schwebt über dem Feld, solange es den Fokus
  hat, und verschiebt das Layout nicht. Wert ist HTML; der Server bereinigt es nach der Whitelist (src/lib/html.ts).
  Schriftfarben: kleine Auswahl und freie Farbe (als Hex gespeichert, einzige erlaubte feste Farbe neben den Tokens).
*/

const FARBEN = [
  { name: "Rot", wert: "#a33a2e" },
  { name: "Blau", wert: "#1f5aa6" },
  { name: "Grün", wert: "#2f6b3a" },
  { name: "Sand", wert: "#8a6140" },
];

type Props = {
  wert: string;
  onChange: (html: string) => void;
  /** Beschriftung für Screenreader */
  label: string;
  placeholder?: string;
  className?: string;
};

export function RichText({ wert, onChange, label, placeholder, className }: Props) {
  const [fokus, setFokus] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false, strike: false, link: false }),
      TextStyle,
      Color,
    ],
    content: wert || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
        "data-placeholder": placeholder ?? "",
        class: cn(
          "min-h-[34px] w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[13.5px] leading-relaxed text-ink outline-none",
          "focus:border-(--focus-ring) focus:shadow-[0_0_0_1px_var(--focus-ring)]",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-5",
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
    onFocus: () => setFokus(true),
    onBlur: () => setFokus(false),
  });

  // Wert von außen (z. B. Artikel aus dem Katalog, Vorlage) übernehmen, solange nicht getippt wird
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const jetzt = editor.isEmpty ? "" : editor.getHTML();
    if ((wert || "") !== jetzt) editor.commands.setContent(wert || "", { emitUpdate: false });
  }, [editor, wert]);

  const stand = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            fett: e.isActive("bold"),
            kursiv: e.isActive("italic"),
            unter: e.isActive("underline"),
            punkte: e.isActive("bulletList"),
            nummern: e.isActive("orderedList"),
            farbe: (e.getAttributes("textStyle").color as string | undefined) ?? null,
            leer: e.isEmpty,
          }
        : null,
  });

  const knopf = (aktiv: boolean | undefined) =>
    cn("inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-surface-sunken hover:text-ink", aktiv && "bg-surface-sunken text-ink");
  const halten = (e: React.MouseEvent) => e.preventDefault(); // Fokus im Feld lassen

  return (
    <div className={cn("relative", className)} data-richtext>
      {editor && fokus && (
        <div
          role="toolbar"
          aria-label="Formatierung"
          className="absolute -top-9 left-0 z-20 flex items-center gap-0.5 rounded-md border border-line bg-surface px-1 py-0.5 shadow-pop"
          onMouseDown={halten}
        >
          <button type="button" aria-label="Fett" aria-pressed={stand?.fett} data-format="bold" className={knopf(stand?.fett)} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="size-3.5" />
          </button>
          <button type="button" aria-label="Kursiv" aria-pressed={stand?.kursiv} data-format="italic" className={knopf(stand?.kursiv)} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="size-3.5" />
          </button>
          <button type="button" aria-label="Unterstrichen" aria-pressed={stand?.unter} data-format="underline" className={knopf(stand?.unter)} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline className="size-3.5" />
          </button>
          <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
          <button type="button" aria-label="Aufzählung" aria-pressed={stand?.punkte} data-format="bulletList" className={knopf(stand?.punkte)} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="size-3.5" />
          </button>
          <button type="button" aria-label="Nummerierung" aria-pressed={stand?.nummern} data-format="orderedList" className={knopf(stand?.nummern)} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="size-3.5" />
          </button>
          <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
          <button type="button" aria-label="Schriftfarbe Standard" title="Standard" className={knopf(!stand?.farbe)} onClick={() => editor.chain().focus().unsetColor().run()}>
            <span className="size-3.5 rounded-full border border-line-strong bg-ink" />
          </button>
          {FARBEN.map((f) => (
            <button
              key={f.wert}
              type="button"
              aria-label={`Schriftfarbe ${f.name}`}
              title={f.name}
              data-format={`farbe-${f.name.toLowerCase()}`}
              className={knopf(stand?.farbe === f.wert)}
              onClick={() => editor.chain().focus().setColor(f.wert).run()}
            >
              <span className="size-3.5 rounded-full" style={{ background: f.wert }} />
            </button>
          ))}
          <label className={cn(knopf(false), "relative cursor-pointer")} title="Andere Farbe">
            <span className="size-3.5 rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" aria-hidden="true" />
            <input
              type="color"
              aria-label="Andere Schriftfarbe"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={stand?.farbe && /^#[0-9a-f]{6}$/i.test(stand.farbe) ? stand.farbe : "#a33a2e"}
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            />
          </label>
        </div>
      )}
      <EditorContent editor={editor} />
      {placeholder && stand?.leer && !fokus && (
        <span className="pointer-events-none absolute top-1.5 left-2.5 text-[13.5px] text-muted-2" aria-hidden="true">
          {placeholder}
        </span>
      )}
    </div>
  );
}
