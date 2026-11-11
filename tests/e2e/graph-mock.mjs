// Nachgebauter Microsoft-Graph-Server für die Browser-Tests der OneDrive-Ablage (nur die genutzten Aufrufe).
// Die App wird mit MS_GRAPH_BASIS=http://127.0.0.1:<port>/v1.0 und MS_LOGIN_BASIS=http://127.0.0.1:<port>/login gestartet.
import http from "node:http";
import { randomUUID } from "node:crypto";

export const MOCK = { site: "mock-site", liste: "mock-liste", drive: "mock-drive", token: "mock-token" };

export function startGraphMock(port) {
  const items = new Map(); // id → { id, name, parent, folder, size, inhalt }
  const root = { id: "root", name: "root", parent: null, folder: true };
  items.set("root", root);
  const sitzungen = new Map();
  let offline = false;
  const aufrufe = [];

  const webUrl = (it) => `https://mock.sharepoint.test/${pfadVon(it)}`;
  const pfadVon = (it) => (it.parent && it.parent !== "root" ? `${pfadVon(items.get(it.parent))}/${it.name}` : it.parent ? it.name : "");
  const kind = (parent, name) => [...items.values()].find((x) => x.parent === parent && x.name.toLowerCase() === name.toLowerCase());
  const json = (it) => ({ id: it.id, name: it.name, webUrl: webUrl(it), ...(it.folder ? { folder: { childCount: 0 } } : { file: {}, size: it.size }), parentReference: { driveId: MOCK.drive } });
  const antwort = (res, status, daten) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(daten === undefined ? "" : JSON.stringify(daten));
  };
  const lesen = (req) => new Promise((ok) => { const teile = []; req.on("data", (c) => teile.push(c)); req.on("end", () => ok(Buffer.concat(teile))); });
  const datei = (parent, name, inhalt) => {
    const vorhanden = kind(parent, name);
    const it = vorhanden ?? { id: randomUUID(), name, parent, folder: false };
    it.size = inhalt.length;
    it.inhalt = inhalt;
    items.set(it.id, it);
    return it;
  };

  const server = http.createServer(async (req, res) => {
    if (offline && !req.url.startsWith("/_")) return req.socket.destroy();
    const url = new URL(req.url, "http://x");
    const p = decodeURIComponent(url.pathname);
    const body = await lesen(req);
    aufrufe.push(`${req.method} ${p}`);
    // Steuerung für den Test
    if (p === "/_zustand") return antwort(res, 200, [...items.values()].filter((x) => x.id !== "root").map((x) => ({ id: x.id, pfad: pfadVon(x), folder: x.folder, size: x.size })));
    if (p === "/_aufrufe") return antwort(res, 200, aufrufe);
    // Anmeldung
    if (/^\/login\/[^/]+\/oauth2\/v2\.0\/token$/.test(p)) {
      const f = new URLSearchParams(body.toString());
      if (f.get("grant_type") !== "client_credentials" || !f.get("client_secret")) return antwort(res, 401, { error: "invalid_client" });
      return antwort(res, 200, { access_token: MOCK.token, expires_in: 3600, token_type: "Bearer" });
    }
    // Upload-Sitzung (ohne Token)
    const sitz = /^\/upload\/(.+)$/.exec(p);
    if (sitz && req.method === "PUT") {
      const s = sitzungen.get(sitz[1]);
      if (!s) return antwort(res, 404, { error: { code: "itemNotFound" } });
      const [, start, , gesamt] = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers["content-range"] ?? "") ?? [];
      s.teile.push(body);
      s.gesamt = Number(gesamt);
      const bisher = s.teile.reduce((a, b) => a + b.length, 0);
      if (bisher >= s.gesamt) return antwort(res, 201, json(datei(s.parent, s.name, Buffer.concat(s.teile))));
      return antwort(res, 202, { nextExpectedRanges: [`${bisher}-`], start });
    }
    if (req.headers.authorization !== `Bearer ${MOCK.token}`) return antwort(res, 401, { error: { code: "InvalidAuthenticationToken" } });
    let m;
    if ((m = /^\/v1\.0\/sites\/([^/]+)\/lists\/([^/]+)\/drive$/.exec(p))) {
      return m[1] === MOCK.site && m[2] === MOCK.liste ? antwort(res, 200, { id: MOCK.drive, name: "Dokumente", webUrl: "https://mock.sharepoint.test" }) : antwort(res, 403, { error: { code: "accessDenied" } });
    }
    const d = `/v1.0/drives/${MOCK.drive}`;
    if (!p.startsWith(d)) return antwort(res, 404, { error: { code: "itemNotFound" } });
    const rest = p.slice(d.length);
    if (rest === "/root") return antwort(res, 200, json(root));
    if ((m = /^\/root:\/(.+)$/.exec(rest))) {
      let it = root;
      for (const teil of m[1].split("/")) {
        it = kind(it.id, teil);
        if (!it) return antwort(res, 404, { error: { code: "itemNotFound" } });
      }
      return antwort(res, 200, json(it));
    }
    if ((m = /^\/items\/([^/:]+)\/children$/.exec(rest)) && req.method === "POST") {
      const b = JSON.parse(body.toString());
      if (!items.has(m[1])) return antwort(res, 404, { error: { code: "itemNotFound" } });
      if (kind(m[1], b.name)) return antwort(res, 409, { error: { code: "nameAlreadyExists" } });
      const it = { id: randomUUID(), name: b.name, parent: m[1], folder: true };
      items.set(it.id, it);
      return antwort(res, 201, json(it));
    }
    if ((m = /^\/items\/([^/:]+):\/(.+):\/content$/.exec(rest)) && req.method === "PUT") {
      if (!items.has(m[1])) return antwort(res, 404, { error: { code: "itemNotFound" } });
      return antwort(res, 201, json(datei(m[1], m[2], body)));
    }
    if ((m = /^\/items\/([^/:]+):\/(.+):\/createUploadSession$/.exec(rest)) && req.method === "POST") {
      const id = randomUUID();
      sitzungen.set(id, { parent: m[1], name: m[2], teile: [] });
      return antwort(res, 200, { uploadUrl: `http://127.0.0.1:${port}/upload/${id}` });
    }
    if ((m = /^\/items\/([^/:]+):\/(.+)$/.exec(rest)) && req.method === "GET") {
      const it = kind(m[1], m[2]);
      return it ? antwort(res, 200, json(it)) : antwort(res, 404, { error: { code: "itemNotFound" } });
    }
    if ((m = /^\/items\/([^/:]+)$/.exec(rest))) {
      const it = items.get(m[1]);
      if (!it) return antwort(res, 404, { error: { code: "itemNotFound" } });
      if (req.method === "PATCH") {
        const b = JSON.parse(body.toString());
        if (b.name) {
          if (kind(it.parent, b.name) && kind(it.parent, b.name) !== it) return antwort(res, 409, { error: { code: "nameAlreadyExists" } });
          it.name = b.name;
        }
      }
      return antwort(res, 200, json(it));
    }
    return antwort(res, 400, { error: { code: "invalidRequest", message: `${req.method} ${p}` } });
  });
  return new Promise((ok) =>
    server.listen(port, "127.0.0.1", () =>
      ok({
        zustand: () => [...items.values()].filter((x) => x.id !== "root").map((x) => ({ pfad: pfadVon(x), folder: x.folder, size: x.size })),
        setOffline: (wert) => (offline = wert),
        stop: () => new Promise((fertig) => server.close(fertig)),
      }),
    ),
  );
}
