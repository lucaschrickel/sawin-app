import type { NextConfig } from "next";

/**
 * Sicherheits-Header (OWASP ASVS Level 1). Die vollständige Content-Security-Policy mit Nonce je Anfrage setzt der Proxy
 * (src/lib/csp.ts); die Grundregeln hier (frame-ancestors, base-uri, form-action, object-src) gelten zusätzlich auch
 * für Dateien, die nicht über den Proxy laufen. Mit Nonce muss jede Seite je Anfrage gerendert werden: deshalb ohne
 * Cache Components / Partial Prerendering (Messung der Seitenwechsel in docs/sicherheit.md, M3).
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // fontkit misst Textbreiten im PDF-Briefkopf (Produktzeile); als Node-Paket laden, nicht bündeln
  serverExternalPackages: ["fontkit"],
  // Schriften für die serverseitig erzeugten PDFs (werden per Dateipfad gelesen, nicht importiert)
  outputFileTracingIncludes: {
    "/pdf/**": ["./node_modules/@fontsource/inter/files/inter-latin-{400,600,700}-{normal,italic}.woff"],
    "/beleg/**": ["./node_modules/@fontsource/inter/files/inter-latin-{400,600,700}-{normal,italic}.woff"],
  },
  async headers() {
    return [
      // Alles außer den PDFs: nie in Frames
      { source: "/((?!pdf/).*)", headers: securityHeaders },
      // PDFs der App (Belegvorschau): nur in Seiten derselben Herkunft einbettbar
      {
        source: "/pdf/:path*",
        headers: securityHeaders.map((h) =>
          h.key === "X-Frame-Options"
            ? { ...h, value: "SAMEORIGIN" }
            : h.key === "Content-Security-Policy"
              ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }
              : h,
        ),
      },
    ];
  },
};

export default nextConfig;
