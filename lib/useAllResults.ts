import { useEffect, useState } from "react"
import { CHIPS } from "~lib/palette"
import { supabase } from "~lib/supabase"
import { MAX_GRID_CLUSTERS } from "~lib/useColorResults"
import type { RGB } from "~lib/useColorResults"

export interface AllResultsCluster {
  name:       string
  count:      number
  pool:       RGB[]   // user's chips for this name
  crowdPool:  RGB[]   // everyone's chips for this name in the user's language
}

const CROWD_POOL_PER_NAME = 60

function hexToRgb(hex: string): RGB | undefined {
  return CHIPS.find((c) => c.hex === hex)?.rgb
}

export function useAllResults(
  userToken: string | null,
  language:  string,
  enabled:   boolean,
) {
  const [clusters,    setClusters]    = useState<AllResultsCluster[] | null>(null)
  const [totalNamed,  setTotalNamed]  = useState(0)
  const [loading,     setLoading]     = useState(false)

  useEffect(() => {
    if (!enabled || !userToken) return
    let cancelled = false
    setLoading(true)

    ;(async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("color_hex, name, created_at")
        .eq("user_token", userToken)
        .eq("language",   language)
        .order("created_at", { ascending: false })

      if (cancelled) return
      if (error || !data) {
        setClusters([])
        setTotalNamed(0)
        setLoading(false)
        return
      }

      // Latest name per chip wins
      const latest = new Map<string, string>()
      for (const r of data) {
        if (!latest.has(r.color_hex)) latest.set(r.color_hex, r.name)
      }

      // Group hexes by name
      const buckets = new Map<string, string[]>()
      for (const [hex, name] of latest) {
        if (!buckets.has(name)) buckets.set(name, [])
        buckets.get(name)!.push(hex)
      }

      // Build user-side clusters first (sorted by user's count, capped)
      const userClusters = Array.from(buckets, ([name, hexes]) => ({
        name,
        count: hexes.length,
        pool:  hexes.map(hexToRgb).filter(Boolean) as RGB[],
      }))
      userClusters.sort((a, b) => b.count - a.count)
      const capped = userClusters.slice(0, MAX_GRID_CLUSTERS)
      const names  = capped.map((c) => c.name)

      // Batch-fetch the crowd pool for each user-named term, in this language.
      // Single round-trip via name = ANY(...). Sorted server-side so we can
      // top-N per name on the client.
      const crowdByName = new Map<string, RGB[]>()
      if (names.length > 0) {
        const { data: crowd } = await supabase
          .from("color_name_counts")
          .select("name, color_hex, count")
          .eq("language", language)
          .in("name", names)
          .order("count", { ascending: false })

        if (cancelled) return
        for (const row of crowd ?? []) {
          const list = crowdByName.get(row.name) ?? []
          if (list.length >= CROWD_POOL_PER_NAME) continue
          const rgb = hexToRgb(row.color_hex)
          if (!rgb) continue
          list.push(rgb)
          crowdByName.set(row.name, list)
        }
      }

      const finalClusters: AllResultsCluster[] = capped.map((c) => ({
        ...c,
        crowdPool: crowdByName.get(c.name) ?? [],
      }))

      setClusters(finalClusters)
      setTotalNamed(latest.size)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [userToken, language, enabled])

  return { clusters, totalNamed, loading }
}
