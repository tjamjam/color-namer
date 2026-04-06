import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

export const supabase = createClient<Database>(
  process.env.PLASMO_PUBLIC_SUPABASE_URL!,
  process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!
)
