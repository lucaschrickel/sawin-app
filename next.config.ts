import type { NextConfig } from "next";

/**
 * Sicherheits-Header (OWASP ASVS Level 1).
 * Eine vollständige Content-Security-Policy mit Nonce folgt, sobald die
 * Supabase-URL feststeht (siehe CLAUDE.md, Abschnitt Sicherheit).
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
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Jede App-Seite liest die Sitzung (Cookies) und lädt Daten des Benutzers; sofortige Navigation ohne Server ist
    // dort nicht möglich (loading.tsx zeigt den Platzhalter). Die Dev-Prüfung „instant navigation“ läuft deshalb nur für
    // Seiten, die ausdrücklich `export const instant = …` setzen (Guide „Authentication with Cache Components“).
    instantInsights: { validationLevel: "manual-warning" },
  },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
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
