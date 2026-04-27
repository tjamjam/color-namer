import { useState } from "react"
import { CHIPS } from "~lib/palette"
import { supabase } from "~lib/supabase"
import type { Chip } from "~lib/palette"
import type { ColorVisionType } from "~lib/storage"

export interface Result {
  name:  string
  count: number
  pct:   number
}

export type RGB = [number, number, number]

const MIN_CVD_RESULTS = 3

export function useColorResults(
  chip:       Chip,
  language:   string,
  cvdType:    ColorVisionType,
  userToken:  string,
) {
  const [results,       setResults]       = useState<Result[] | null>(null)
  const [pools,         setPools]         = useState<RGB[][]>([])
  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const [cvdFallback,   setCvdFallback]   = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [submitError,   setSubmitError]   = useState(false)

  const isCvdFiltered = cvdType !== "none" && cvdType !== "unknown"

  function reset() {
    setResults(null)
    setPools([])
    setSubmittedName(null)
    setCvdFallback(false)
    setLoading(false)
    setSubmitError(false)
  }

  async function fetchResults(forceGeneral = false): Promise<Result[]> {
    if (isCvdFiltered && !forceGeneral) {
      const { data, error } = await supabase
        .from("submissions")
        .select("name")
        .eq("color_hex", chip.hex)
        .eq("language", language)
        .eq("cvd_type", cvdType)
  
      if (error || !data?.length) return []

      const counts: Record<string, number> = {}
      data.forEach((r) => { counts[r.name] = (counts[r.name] ?? 0) + 1 })
      const total = data.length
      return Object.entries(counts)
        .map(([name, count]) => ({ name, count, pct: (count / total) * 100 }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 10)
    }

    const { data, error } = await supabase
      .from("color_name_counts")
      .select("name, count")
      .eq("color_hex", chip.hex)
      .eq("language", language)
      .order("count", { ascending: false })
      .limit(10)

    if (error || !data?.length) return []
    const total = data.reduce((sum, r) => sum + r.count, 0)
    return data.map((r) => ({ name: r.name, count: r.count, pct: (r.count / total) * 100 }))
  }

  async function fetchPool(name: string, forceGeneral = false): Promise<RGB[]> {
    if (isCvdFiltered && !forceGeneral) {
      const { data } = await supabase
        .from("submissions")
        .select("color_hex")
        .eq("language", language)
        .eq("cvd_type", cvdType)
        .eq("name", name)
        .limit(60)

      return (data ?? [])
        .map((r) => CHIPS.find((c) => c.hex === r.color_hex)?.rgb)
        .filter(Boolean) as RGB[]
    }

    const { data } = await supabase
      .from("color_name_counts")
      .select("color_hex")
      .eq("language", language)
      .eq("name", name)
      .order("count", { ascending: false })
      .limit(60)

    return (data ?? [])
      .map((r) => CHIPS.find((c) => c.hex === r.color_hex)?.rgb)
      .filter(Boolean) as RGB[]
  }

  async function submit(name: string, onSubmitted: () => void): Promise<boolean> {
    setLoading(true)
    setSubmitError(false)

    const { error } = await supabase.from("submissions").insert({
      color_hex:  chip.hex,
      name,
      locale:     navigator.language,
      language,
      user_token: userToken,
      cvd_type:   cvdType,
    })

    if (error) {
      setSubmitError(true)
      setLoading(false)
      return false
    }

    onSubmitted()

    let data = await fetchResults()

    const usingFallback = isCvdFiltered && data.length < MIN_CVD_RESULTS
    if (usingFallback) data = await fetchResults(true)
    setCvdFallback(usingFallback)

    // Ensure the user's answer appears even if the DB hasn't caught up
    if (!data.find((r) => r.name === name)) {
      data = [{ name, count: 1, pct: 0 }, ...data]
      const total = data.reduce((sum, r) => sum + r.count, 0)
      data = data.map((r) => ({ ...r, pct: (r.count / total) * 100 }))
      data.sort((a, b) => b.pct - a.pct)
    }

    const poolData = await Promise.all(data.map((r) => fetchPool(r.name, usingFallback)))

    setSubmittedName(name)
    setResults(data)
    setPools(poolData)
    setLoading(false)
    return true
  }

  return { results, pools, submittedName, cvdFallback, loading, submitError, reset, submit }
}
