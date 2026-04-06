import { useState, useEffect, useRef, useMemo } from "react"
import { CHIPS, luminance, uiColor } from "~lib/palette"
import { supabase } from "~lib/supabase"
import ResultsCanvas from "~components/ResultsCanvas"
import { useTranslations } from "~lib/i18n"
import type { Chip } from "~lib/palette"
import type { ClusterDef } from "~components/ResultsCanvas"
import type { ColorVisionType } from "~lib/storage"

import leoProfanity from "leo-profanity"

const LEO_SUPPORTED = new Set(["en", "fr", "ru"])

async function checkSpelling(word: string): Promise<string[]> {
  if (word.length < 2) return []
  try {
    const res = await fetch(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=10`
    )
    const data: { word: string }[] = await res.json()
    if (data[0]?.word === word) return []
    return data
      .map((d) => d.word)
      .filter((w) => !/[\s-]/.test(w))  // single words only
      .slice(0, 3)
  } catch {
    return []
  }
}

interface Result {
  name: string
  count: number
  pct: number
}

type RGB = [number, number, number]

function buildClusters(
  results: Result[],
  pools: RGB[][],
  submittedName: string,
  screenW: number,
  screenH: number,
): ClusterDef[] {
  const maxR    = Math.min(screenW, screenH) * 0.28
  const minR    = 55
  const spreadR = Math.min(screenW, screenH) * 0.24
  const n       = results.length

  return results.map((r, i) => {
    let x = screenW / 2
    let y = screenH / 2
    if (n === 2) {
      x = screenW / 2 + (i === 0 ? -spreadR : spreadR)
    } else if (n > 2) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      x = screenW / 2 + Math.cos(angle) * spreadR
      y = screenH / 2 + Math.sin(angle) * spreadR
    }
    return {
      name:   r.name,
      pct:    r.pct,
      count:  r.count,
      pool:   pools[i] ?? [],
      x,
      y,
      r:      minR + (maxR - minR) * (r.pct / 100),
      isUser: r.name === submittedName,
    }
  })
}

export default function ColorNamingUI({
  chip,
  userToken,
  cvdType,
  onSubmitted,
  onNext,
}: {
  chip: Chip
  userToken: string
  cvdType: ColorVisionType
  onSubmitted: () => void
  onNext: () => void
}) {
  const [input, setInput] = useState("")
  const [submittedName, setSubmittedName] = useState<string | null>(null)
  const [results, setResults] = useState<Result[] | null>(null)
  const [pools, setPools] = useState<RGB[][]>([])
  const [cvdFallback, setCvdFallback] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oneWordWarning, setOneWordWarning] = useState(false)
  const [profane, setProfane] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const oneWordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const t         = useTranslations()
  const lum       = luminance(chip.rgb)
  const col       = uiColor(chip.rgb)
  const glassBase = lum > 0.55 ? "rgba(0,0,0," : "rgba(255,255,255,"
  const glassBg   = `${glassBase}0.08)`
  const glassBorder = `${glassBase}0.12)`
  const language       = navigator.language.split("-")[0]
  const isCvdFiltered  = cvdType !== "none" && cvdType !== "unknown"
  const MIN_CVD_RESULTS = 3

  useEffect(() => {
    leoProfanity.loadDictionary(LEO_SUPPORTED.has(language) ? language : "en")
  }, [language])

  useEffect(() => {
    setResults(null)
    setPools([])
    setSubmittedName(null)
    setInput("")
    setOneWordWarning(false)
    setProfane(false)
    setSubmitError(false)
    setCvdFallback(false)
    setSuggestions([])
    if (oneWordTimerRef.current) clearTimeout(oneWordTimerRef.current)
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 300)
    return () => clearTimeout(focusTimer)
  }, [chip])

  useEffect(() => {
    if (results === null) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Enter") onNext() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [results, onNext])

  const clusters = useMemo<ClusterDef[]>(() => {
    if (!results || pools.length !== results.length || results.length === 0) return []
    return buildClusters(results, pools, submittedName ?? "", window.innerWidth, window.innerHeight)
  }, [results, pools, submittedName])

  function sanitize(str: string) {
    return str.replace(/[^a-zA-Z0-9'-]/g, "").trim().toLowerCase()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    if (/\s/.test(raw)) {
      setInput(raw.replace(/\s/g, ""))
      setOneWordWarning(true)
      if (oneWordTimerRef.current) clearTimeout(oneWordTimerRef.current)
      oneWordTimerRef.current = setTimeout(() => setOneWordWarning(false), 2000)
    } else {
      setInput(raw)
    }
    setProfane(false)
    setSuggestions([])
  }

  async function handleBlur() {
    if (language !== "en") return
    const name = sanitize(input)
    if (!name || name.length < 2) return
    const s = await checkSpelling(name)
    setSuggestions(s)
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

  async function handleSubmit() {
    const name = sanitize(input)
    if (!name || loading) return

    if (leoProfanity.check(name)) {
      setProfane(true)
      return
    }
    setProfane(false)

    // Spell-check gate: first Enter shows suggestions, second Enter submits anyway
    if (language === "en" && suggestions.length === 0) {
      const s = await checkSpelling(name)
      if (s.length > 0) {
        setSuggestions(s)
        return
      }
    }
    setSuggestions([])

    setLoading(true)

    const { error } = await supabase.from("submissions").insert({
      color_hex:  chip.hex,
      name,
      locale:     navigator.language,
      language,
      user_token: userToken,
      cvd_type:   cvdType,
    })

    const isDuplicate = error?.code === "23505"
    if (error && !isDuplicate) {
      setSubmitError(true)
      setLoading(false)
      return
    }

    onSubmitted()

    let data = await fetchResults()

    // Fall back to general results if not enough CVD-specific responses
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
  }

  const labelStyle: React.CSSProperties = {
    fontSize:       15,
    fontWeight:     500,
    letterSpacing:  "0.04em",
    textTransform:  "lowercase",
    opacity:        0.85,
    color:          col,
    transition:     "color 0.8s ease",
    margin:         0,
  }

  const buttonStyle: React.CSSProperties = {
    fontFamily:         "'Noto Sans', -apple-system, sans-serif",
    fontSize:           13,
    fontWeight:         500,
    letterSpacing:      "0.04em",
    padding:            "10px 24px",
    borderRadius:       8,
    border:             `1px solid ${glassBorder}`,
    background:         glassBg,
    color:              col,
    cursor:             "pointer",
    backdropFilter:     "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    transition:         "color 0.8s ease, border-color 0.8s ease",
  }

  // ---- Results view ----------------------------------------------------------

  if (results !== null) {
    return (
      <>
        {clusters.length > 0 && <ResultsCanvas clusters={clusters} />}

        {/* "you said X" + optional CVD fallback — top center */}
        <div style={{
          position:       "fixed",
          top:            48,
          left:           0,
          right:          0,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            6,
          pointerEvents:  "none",
        }}>
          <p style={{ ...labelStyle, fontSize: 14, letterSpacing: "0.03em" }}>
            {t("youSaid", submittedName ?? "")}
          </p>
          {cvdFallback && (
            <p style={{
              ...labelStyle,
              fontSize:   11,
              opacity:    0.45,
              textAlign:  "center",
              maxWidth:   320,
            }}>
              {t("cvdFallback")}
            </p>
          )}
        </div>

        {/* Cluster labels */}
        {clusters.map((c) => (
          <div
            key={c.name}
            style={{
              position:       "fixed",
              left:           c.x,
              top:            c.y + c.r + 14,
              transform:      "translate(-50%, 0)",
              textAlign:      "center",
              pointerEvents:  "none",
            }}>
            <div style={{
              fontSize:      14,
              fontWeight:    c.isUser ? 600 : 400,
              letterSpacing: "0.03em",
              color:         col,
              opacity:       0.9,
              transition:    "color 0.8s ease",
            }}>
              {c.name}
            </div>
            <div style={{
              fontSize:   12,
              color:      col,
              opacity:    0.55,
              marginTop:  3,
              transition: "color 0.8s ease",
            }}>
              {Math.round(c.pct)}% &middot; {c.count.toLocaleString()}
            </div>
          </div>
        ))}

        {/* First to name */}
        {results.length === 0 && (
          <p style={{
            ...labelStyle,
            position:  "fixed",
            top:       "50%",
            left:      "50%",
            transform: "translate(-50%, -50%)",
            opacity:   0.6,
            fontSize:  13,
          }}>
            {t("firstToName")}
          </p>
        )}


        {/* next color button — bottom center */}
        <div style={{
          position:       "fixed",
          bottom:         40,
          left:           0,
          right:          0,
          display:        "flex",
          justifyContent: "center",
        }}>
          <button onClick={onNext} style={buttonStyle}>
            {t("nextColor")}
          </button>
        </div>
      </>
    )
  }

  // ---- Loading view ----------------------------------------------------------

  if (loading) {
    return (
      <>
        <style>{`
          @keyframes cl-spin { to { transform: rotate(360deg); } }
        `}</style>
        <div style={{
          width:           44,
          height:          44,
          borderRadius:    "50%",
          border:          `2px solid ${glassBase}0.15)`,
          borderTopColor:  col,
          animation:       "cl-spin 0.8s linear infinite",
          opacity:         0.7,
        }} />
      </>
    )
  }

  // ---- Input view ------------------------------------------------------------

  return (
    <div style={{ "--ui-color": col, maxWidth: 440, width: "100%", textAlign: "center" } as React.CSSProperties}>
      <p style={{ ...labelStyle, marginBottom: 16 }}>{t("prompt")}</p>
      <div style={{
        display:            "flex",
        borderRadius:       12,
        overflow:           "hidden",
        backdropFilter:     "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        background:         glassBg,
        border:             `1px solid ${glassBorder}`,
        transition:         "background 0.8s ease, border-color 0.8s ease",
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          maxLength={30}
          placeholder={t("placeholder")}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex:       1,
            padding:    "14px 18px",
            fontFamily: "'Noto Sans', -apple-system, sans-serif",
            fontSize:   16,
            fontWeight: 400,
            background: "transparent",
            border:     "none",
            outline:    "none",
            color:      col,
            transition: "color 0.8s ease",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          aria-label="Submit"
          style={{
            padding:    "14px 20px",
            fontSize:   18,
            fontWeight: 500,
            background: "transparent",
            border:     "none",
            color:      col,
            cursor:     loading ? "default" : "pointer",
            opacity:    loading ? 0.3 : 0.6,
            transition: "opacity 0.2s, color 0.8s ease",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = "1" }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = "0.6" }}>
          →
        </button>
      </div>
      <p style={{ marginTop: 10, fontSize: 12, letterSpacing: "0.08em", color: col, opacity: 0.4, transition: "color 0.8s ease" }}>
        {chip.hex}
      </p>

      {/* Inline feedback — only one shown at a time, priority: submitError > profane > one-word > suggestions */}
      {submitError && (
        <p style={{ marginTop: 8, fontSize: 12, letterSpacing: "0.04em", color: col, opacity: 0.65, transition: "color 0.8s ease" }}>
          {t("submitError")}
        </p>
      )}
      {!submitError && profane && (
        <p style={{ marginTop: 8, fontSize: 12, letterSpacing: "0.04em", color: col, opacity: 0.65, transition: "color 0.8s ease" }}>
          {t("keepItClean")}
        </p>
      )}
      {!submitError && !profane && oneWordWarning && (
        <p style={{ marginTop: 8, fontSize: 12, letterSpacing: "0.04em", color: col, opacity: 0.65, transition: "color 0.8s ease" }}>
          {t("oneWordOnly")}
        </p>
      )}
      {!submitError && !profane && !oneWordWarning && suggestions.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <p style={{ fontSize: 12, letterSpacing: "0.04em", color: col, opacity: 0.55, margin: 0, transition: "color 0.8s ease" }}>
            {t("didYouMean")}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => { setInput(s); setSuggestions([]) }}
                style={{
                  padding:            "13px 28px",
                  borderRadius:       12,
                  border:             `1px solid ${glassBorder}`,
                  background:         glassBg,
                  color:              col,
                  fontSize:           17,
                  fontWeight:         500,
                  fontFamily:         "'Noto Sans', -apple-system, sans-serif",
                  letterSpacing:      "0.03em",
                  cursor:             "pointer",
                  backdropFilter:     "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  transition:         "color 0.8s ease, border-color 0.8s ease",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
