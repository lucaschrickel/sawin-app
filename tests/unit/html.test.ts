// Unit-Tests für die Bereinigung formatierter Texte (Whitelist, XSS). Aufruf: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { htmlBereinigen, istHtml } from "../../src/lib/html.ts";
import { htmlZuText } from "../../src/lib/beleg-typen.ts";

describe("htmlBereinigen", () => {
  it("lässt die erlaubten Formatierungen stehen", () => {
    const html = '<p><strong>Fett</strong> <em>kursiv</em> <u>unter</u> <span style="color: #a33a2e">rot</span></p><ul><li><p>eins</p></li></ul><ol><li><p>zwei</p></li></ol>';
    assert.equal(htmlBereinigen(html), html.replace("color: #a33a2e", "color:#a33a2e"));
  });
  it("entfernt Skripte, Ereignisse, Links, Bilder und fremde Stile", () => {
    const html = '<p onclick="x()">Hallo<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">Link</a></p><span style="color:red;background:url(x)">x</span><style>p{}</style>';
    const s = htmlBereinigen(html);
    assert.doesNotMatch(s, /script|onclick|onerror|img|href|javascript|background|<a|<style/i);
    assert.match(s, /Hallo/);
    assert.match(s, /Link/, "Text des Links bleibt");
  });
  it("Farbe nur als Hex oder rgb; sonst wird der span entfernt, der Text bleibt", () => {
    assert.equal(htmlBereinigen('<p><span style="color: rgb(10, 20, 30)">a</span></p>'), '<p><span style="color:rgb(10, 20, 30)">a</span></p>');
    assert.equal(htmlBereinigen('<p><span style="color: expression(alert(1))">a</span></p>'), "<p>a</p>");
    assert.equal(htmlBereinigen('<p><span style="font-weight: bold">a</span></p>'), '<p><span style="font-weight:bold">a</span></p>');
  });
  it("reiner Text wird zu Absätzen, leerer Inhalt zu ''", () => {
    assert.equal(htmlBereinigen("Zeile 1\nZeile 2\n\nAbsatz <b>"), "<p>Zeile 1<br />Zeile 2</p><p>Absatz &lt;b&gt;</p>");
    assert.equal(htmlBereinigen("<p></p>"), "");
    assert.equal(htmlBereinigen("  "), "");
    assert.equal(htmlBereinigen(null), "");
  });
  it("istHtml erkennt bereinigtes HTML, nicht Text mit spitzen Klammern", () => {
    assert.equal(istHtml("<p>a</p>"), true);
    assert.equal(istHtml("a < b"), false);
  });
});

describe("htmlZuText (Lexware)", () => {
  it("Aufzählung, Nummerierung und Absätze als reiner Text", () => {
    const t = htmlZuText('<p><strong>Titel</strong></p><ul><li><p>eins</p></li><li><p>zwei</p></li></ul><ol><li><p>a</p></li><li><p>b</p></li></ol><p><span style="color:#a33a2e">rot</span></p>');
    assert.match(t, /• eins/);
    assert.match(t, /• zwei/);
    assert.match(t, /1\. a/);
    assert.match(t, /2\. b/);
    assert.doesNotMatch(t, /<|style/);
  });
});
