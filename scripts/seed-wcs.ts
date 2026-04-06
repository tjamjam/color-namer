/**
 * Seeds Supabase with color naming data from the WCS + BK datasets.
 *
 * - BK English (lang_id=206): seeded as language='en'
 *
 * Run from repo root:
 *   npx tsx scripts/seed-wcs.ts
 */

import fs from "fs"
import path from "path"
import Database from "better-sqlite3"
import { createClient } from "@supabase/supabase-js"

// ---- Env ---------------------------------------------------------------------

const envPath = path.join(__dirname, "..", ".env.local")
if (!fs.existsSync(envPath)) {
  console.error("Missing .env.local")
  process.exit(1)
}

const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=")
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] as [string, string]
    })
)

const SUPABASE_URL = env["PLASMO_PUBLIC_SUPABASE_URL"]
const SERVICE_ROLE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing PLASMO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ---- Load WCS database -------------------------------------------------------

const wcsDbPath = path.join(__dirname, "..", "..", "colorful-language", "wcs.db")
if (!fs.existsSync(wcsDbPath)) {
  console.error(`wcs.db not found at ${wcsDbPath}`)
  process.exit(1)
}

const db = new Database(wcsDbPath, { readonly: true })

interface DbChip { cnum: number; r: number; g: number; b: number }
interface Term { term: string; count: number; label: string | null }
interface LangInfo { id: number; name: string; source: string }

const chips = db.prepare("SELECT cnum, r, g, b FROM chips ORDER BY cnum").all() as DbChip[]
const languages = db.prepare("SELECT id, name, source FROM languages WHERE source = 'bk' AND id = 206").all() as LangInfo[]

const termsForChipAndLang = db.prepare(`
  SELECT t.term, t.count, tl.label
  FROM terms t
  LEFT JOIN term_labels tl ON tl.lang_id = t.lang_id AND tl.abbr = t.term
  WHERE t.lang_id = ? AND t.cnum = ?
  ORDER BY t.count DESC
`)

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
}

// ---- Build rows ---------------------------------------------------------------

interface Row {
  color_hex: string
  language: string
  name: string
  count: number
}

console.log(`Seeding ${chips.length} WCS chips × ${languages.length} BK language(s)...\n`)

const countMap = new Map<string, number>()

for (const lang of languages) {
  const langCode = lang.id === 206 ? "en" : lang.name
  for (const chip of chips) {
    const hex = toHex(chip.r, chip.g, chip.b)
    const terms = termsForChipAndLang.all(lang.id, chip.cnum) as Term[]
    for (const t of terms) {
      const name = (t.label ?? t.term).toLowerCase()
      const key = `${hex}||${langCode}||${name}`
      countMap.set(key, (countMap.get(key) ?? 0) + t.count)
    }
  }
}

db.close()

const rows: Row[] = Array.from(countMap.entries()).map(([key, count]) => {
  const [color_hex, language, name] = key.split("||")
  return { color_hex, language, name, count }
})

console.log(`Built ${rows.length} aggregated rows\n`)

// ---- Upsert into color_name_counts -------------------------------------------

const BATCH = 500

async function main() {
  console.log("Clearing existing color_name_counts...")
  const { error: clearError } = await supabase.from("color_name_counts").delete().neq("color_hex", "")
  if (clearError) { console.error("Clear error:", clearError.message); process.exit(1) }

  let inserted = 0
  let errors = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from("color_name_counts")
      .upsert(batch, { onConflict: "color_hex,language,name" })

    if (error) {
      errors++
      if (errors <= 3) console.error(`\n  Batch error: ${error.message}`)
    } else {
      inserted += batch.length
    }
    process.stdout.write(`\r  ${inserted.toLocaleString()} / ${rows.length} rows — ${Math.round((i + batch.length) / rows.length * 100)}%`)
  }

  console.log(`\n\nDone. ${inserted.toLocaleString()} rows upserted, ${errors} errors.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
