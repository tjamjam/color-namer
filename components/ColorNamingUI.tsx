import { useState, useEffect, useRef, useMemo } from "react"
import { CHIPS, luminance, uiColor } from "~lib/palette"
import ResultsCanvas from "~components/ResultsCanvas"
import { useTranslations } from "~lib/i18n"
import { useColorResults, MAX_DISPLAYED } from "~lib/useColorResults"
import type { Chip } from "~lib/palette"
import type { ClusterDef } from "~components/ResultsCanvas"
import type { ColorVisionType } from "~lib/storage"

import leoProfanity from "leo-profanity"

const LEO_SUPPORTED = new Set(["en", "fr", "ru"])

async function fetchSuggestions(word: string): Promise<string[]> {
  if (word.length < 2) return []
  try {
    const res = await fetch(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=10`
    )
    const data: { word: string }[] = await res.json()
    return data
      .map((d) => d.word)
      .filter((w) => !/[\s-]/.test(w))
  } catch {
    return []
  }
}

async function checkSpelling(name: string): Promise<string[]> {
  const tokens = name.split(" ")
  if (tokens.some((t) => t.length < 2)) return []

  const perToken = await Promise.all(tokens.map(fetchSuggestions))

  const allExact = tokens.every((t, i) => perToken[i][0] === t)
  if (allExact) return []

  const altsPerToken = tokens.map((t, i) => {
    const list = perToken[i]
    if (list.length === 0) return [t]
    if (list[0] === t) return [t]
    return list.slice(0, 3)
  })

  const phrases: string[] = []
  const expand = (idx: number, acc: string[]) => {
    if (idx === altsPerToken.length) {
      phrases.push(acc.join(" "))
      return
    }
    for (const w of altsPerToken[idx]) expand(idx + 1, [...acc, w])
  }
  expand(0, [])

  return Array.from(new Set(phrases)).filter((p) => p !== name).slice(0, 3)
}

type RGB = [number, number, number]

function buildClusters(
  results: { name: string; pct: number; count: number }[],
  pools: RGB[][],
  submittedName: string,
  screenW: number,
  screenH: number,
): ClusterDef[] {
  const TOP_RESERVE    = 80
  const BOTTOM_RESERVE = 150
  const usableH = Math.max(screenH - TOP_RESERVE - BOTTOM_RESERVE, 200)
  const centerX = screenW / 2
  const centerY = TOP_RESERVE + usableH / 2

  const n       = Math.min(results.length, MAX_DISPLAYED)
  const sinHalf = n >= 3 ? Math.sin(Math.PI / n) : 1

  // Adjacent-pair non-overlap requires spread >= maxR / sin(pi/n).
  // Combined with band fit (spread + maxR <= usableH/2), this bounds maxR.
  const heightCap = n >= 3 ? usableH / (2 * (1 + 1 / sinHalf)) : usableH / 2
  const maxR = Math.max(55, Math.min(heightCap, 220))
  const minR = 55

  const tightSpread = n <= 1 ? 0 : maxR / sinHalf
  const spreadY = tightSpread
  const spreadX = Math.max(
    tightSpread,
    Math.min(screenW / 2 - maxR - 24, screenW * 0.30)
  )

  return results.slice(0, MAX_DISPLAYED).map((r, i) => {
    let x = centerX
    let y = centerY
    if (n === 2) {
      x = centerX + (i === 0 ? -spreadX : spreadX)
    } else if (n > 2) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      x = centerX + Math.cos(angle) * spreadX
      y = centerY + Math.sin(angle) * spreadY
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
  const language = navigator.language.split("-")[0]

  const {
    results, pools, submittedName, cvdFallback,
    loading, submitError, reset, submit,
  } = useColorResults(chip, language, cvdType, userToken)

  const [input,               setInput]               = useState("")
  const [tooManyWordsWarning, setTooManyWordsWarning] = useState(false)
  const [profane,             setProfane]             = useState(false)
  const [suggestions,         setSuggestions]         = useState<string[]>([])
  const inputRef        = useRef<HTMLInputElement>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const t         = useTranslations()
  const lum       = luminance(chip.rgb)
  const col       = uiColor(chip.rgb)
  const glassBase = lum > 0.55 ? "rgba(0,0,0," : "rgba(255,255,255,"
  const glassBg   = `${glassBase}0.08)`
  const glassBorder = `${glassBase}0.12)`

  useEffect(() => {
    leoProfanity.loadDictionary(LEO_SUPPORTED.has(language) ? language : "en")
  }, [language])

  useEffect(() => {
    reset()
    setInput("")
    setTooManyWordsWarning(false)
    setProfane(false)
    setSuggestions([])
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
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
    return str
      .replace(/[^a-zA-Z0-9'\- ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const cleaned = raw.replace(/^\s+/, "").replace(/\s+/g, " ")
    const tooManySpaces = (cleaned.match(/ /g) ?? []).length > 1
    const next = tooManySpaces ? cleaned.split(" ").slice(0, 2).join(" ") : cleaned

    if (next !== raw) {
      setTooManyWordsWarning(true)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      warningTimerRef.current = setTimeout(() => setTooManyWordsWarning(false), 2000)
    }
    setInput(next)
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

    await submit(name, onSubmitted)
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

        {/* "you said X" + optional CVD fallback, top center */}
        <div
          role="status"
          aria-live="polite"
          style={{
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
          <h1 style={{ ...labelStyle, fontSize: 14, letterSpacing: "0.03em" }}>
            {t("youSaid", submittedName ?? "")}
          </h1>
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
              opacity:    0.8,
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
      <h1 id="cn-prompt" style={{ ...labelStyle, marginBottom: 16 }}>{t("prompt")}</h1>
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
          aria-labelledby="cn-prompt"
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
            opacity:    loading ? 0.3 : 0.85,
            transition: "opacity 0.2s, color 0.8s ease",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = "1" }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = "0.85" }}>
          →
        </button>
      </div>
      <p style={{ marginTop: 10, fontSize: 12, letterSpacing: "0.08em", color: col, opacity: 0.7, transition: "color 0.8s ease" }}>
        {chip.hex}
      </p>

      {/* Inline feedback, only one shown at a time, priority: submitError > profane > one-word > suggestions */}
      <div role="status" aria-live="polite">
      {submitError && (
        <p style={{ marginTop: 8, fontSize: 12, letterSpacing: "0.04em", color: col, opacity: 0.85, transition: "color 0.8s ease" }}>
          {t("submitError")}
        </p>
      )}
      {!submitError && profane && (
        <p style={{ marginTop: 8, fontSize: 12, letterSpacing: "0.04em", color: col, opacity: 0.85, transition: "color 0.8s ease" }}>
          {t("keepItClean")}
        </p>
      )}
      {!submitError && !profane && tooManyWordsWarning && (
        <p style={{ marginTop: 8, fontSize: 12, letterSpacing: "0.04em", color: col, opacity: 0.85, transition: "color 0.8s ease" }}>
          {t("tooManyWords")}
        </p>
      )}
      {!submitError && !profane && !tooManyWordsWarning && suggestions.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <p style={{ fontSize: 12, letterSpacing: "0.04em", color: col, opacity: 0.8, margin: 0, transition: "color 0.8s ease" }}>
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
    </div>
  )
}
