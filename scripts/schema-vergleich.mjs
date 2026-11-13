// Schema von Staging und Produktion vergleichen (nur lesend, nur Katalog, keine Fachdaten):
// Tabellen mit RLS, Spalten, Policies, Trigger, Funktionen (Prüfsumme der Definition ohne Zeilenende-Unterschiede
// CR/LF aus Git unter Windows), Rechte, Buckets, Erweiterungen.
//   node scripts/schema-vergleich.mjs
// Liest SUPABASE_DB_URL (Staging) und SUPABASE_DB_URL_PROD aus .env.local; gibt nur Objektnamen aus.
import { existsSync } from "node:fs";
import pg from "pg";
import { refAusDb } from "./testprojekt.mjs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const ABFRAGEN = {
  tabellen: `select n.nspname || '.' || c.relname || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity as x
               from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where c.relkind in ('r', 'p', 'v') and n.nspname in ('public', 'app', 'audit')`,
  spalten: `select table_schema || '.' || table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable || ' def=' || coalesce(column_default, '') as x
              from information_schema.columns where table_schema in ('public', 'app', 'audit')`,
  policies: `select schemaname || '.' || tablename || '.' || policyname || ' ' || cmd || ' ' || roles::text || ' ' || coalesce(qual, '') || ' | ' || coalesce(with_check, '') as x
               from pg_policies where schemaname in ('public', 'app', 'audit', 'storage')`,
  trigger: `select c.relnamespace::regnamespace || '.' || c.relname || '.' || t.tgname || ' ' || pg_get_triggerdef(t.oid) as x
              from pg_trigger t join pg_class c on c.oid = t.tgrelid
             where not t.tgisinternal and c.relnamespace::regnamespace::text in ('public', 'app', 'audit', 'storage')`,
  funktionen: `select p.oid::regprocedure::text || ' ' || md5(replace(pg_get_functiondef(p.oid), chr(13), '')) || ' definer=' || p.prosecdef as x
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname in ('public', 'app', 'audit') and p.prokind = 'f'`,
  funktionsrechte: `select p.oid::regprocedure::text || ' ' || coalesce(array_to_string(array(select unnest(p.proacl)::text order by 1), ','), 'default') as x
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'app', 'audit')`,
  tabellenrechte: `select table_schema || '.' || table_name || ' ' || grantee || ' ' || string_agg(privilege_type, ',' order by privilege_type) as x
                     from information_schema.role_table_grants
                    where table_schema in ('public', 'app', 'audit') and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
                    group by table_schema, table_name, grantee`,
  buckets: `select id || ' public=' || public || ' limit=' || coalesce(file_size_limit::text, '') || ' mime=' || coalesce(array_to_string(allowed_mime_types, ','), '') as x from storage.buckets`,
  erweiterungen: `select extname || ' ' || extnamespace::regnamespace as x from pg_extension`,
};

async function lesen(url) {
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const erg = {};
    for (const [k, sql] of Object.entries(ABFRAGEN)) erg[k] = new Set((await db.query(sql)).rows.map((r) => r.x));
    return erg;
  } finally {
    await db.end();
  }
}

const staging = process.env.SUPABASE_DB_URL, prod = process.env.SUPABASE_DB_URL_PROD;
if (!staging || !prod) throw new Error("SUPABASE_DB_URL und SUPABASE_DB_URL_PROD werden benötigt");
console.log(`Staging ${refAusDb(staging)} ↔ Produktion ${refAusDb(prod)}`);
const [s, p] = await Promise.all([lesen(staging), lesen(prod)]);
let abweichungen = 0;
for (const k of Object.keys(ABFRAGEN)) {
  const nurS = [...s[k]].filter((x) => !p[k].has(x));
  const nurP = [...p[k]].filter((x) => !s[k].has(x));
  abweichungen += nurS.length + nurP.length;
  console.log(`${k.padEnd(16)} Staging ${String(s[k].size).padStart(4)}  Produktion ${String(p[k].size).padStart(4)}  ${nurS.length + nurP.length ? "ABWEICHUNG" : "gleich"}`);
  for (const x of nurS) console.log(`   nur Staging:    ${x.slice(0, 160)}`);
  for (const x of nurP) console.log(`   nur Produktion: ${x.slice(0, 160)}`);
}
console.log(abweichungen ? `${abweichungen} Abweichungen` : "Schema identisch");
