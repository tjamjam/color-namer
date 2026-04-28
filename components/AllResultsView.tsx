import { useEffect, useMemo, useRef, useState } from "react"
import ResultsCanvas from "~components/ResultsCanvas"
import { useAllResults } from "~lib/useAllResults"
import { useTranslations } from "~lib/i18n"
import { CHIPS } from "~lib/palette"
import type { ClusterDef } from "~components/ResultsCanvas"
import type { AllResultsCluster } from "~lib/useAllResults"

const PRIMARY = "rgba(255,255,255,0.9)"
const MUTED   = "rgba(255,255,255,0.6)"
const FAINT   = "rgba(255,255,255,0.4)"

// Same dim neutral the shader uses for an empty crowd half, so the legend
// reads consistently when the sample cluster has no crowd data.
const EMPTY_CROWD = "rgb(46,46,51)"

function rgbCss(rgb: [number, number, number] | undefined, fallback: string) {
  if (!rgb) return fallback
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

// Fixed grid layout. Squares stay a comfortable size for visual comparison;
// the page scrolls vertically when there are too many clusters to fit.
const SQUARE     = 110   // half-side
const COL_GAP    = 28
const LABEL_GAP  = 8
const LABEL_BAND = 28    // label height + breathing room before next row
const TOP_RESERVE    = 80
const BOTTOM_RESERVE = 50
const CELL_W = 2 * SQUARE + COL_GAP
const CELL_H = 2 * SQUARE + LABEL_GAP + LABEL_BAND

interface GridLayout {
  clusters:    ClusterDef[]   // logical positions (top-left origin, full content)
  contentH:    number
  cellW:       number
}

function buildLayout(raw: AllResultsCluster[], W: number): GridLayout {
  const n = raw.length
  if (n === 0) return { clusters: [], contentH: 0, cellW: CELL_W }

  // Min margin so the grid never butts up against the viewport edge.
  const cols   = Math.max(1, Math.floor((W - 40) / CELL_W))
  const rows   = Math.ceil(n / cols)
  const gridW  = cols * CELL_W
  const leftPad = (W - gridW) / 2

  const clusters: ClusterDef[] = raw.map((r, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      name:   r.name,
      pct:    100,
      count:  r.count,
      pool:   r.pool,
      poolR:  r.crowdPool,
      x:      leftPad + col * CELL_W + CELL_W / 2,
      y:      TOP_RESERVE + row * CELL_H + SQUARE,
      r:      SQUARE,
      isUser: false,
    }
  })

  const contentH = TOP_RESERVE + rows * CELL_H + BOTTOM_RESERVE
  return { clusters, contentH, cellW: CELL_W }
}

export default function AllResultsView({
  userToken,
  language,
  onClose,
}: {
  userToken: string
  language:  string
  onClose:   () => void
}) {
  const t = useTranslations()
  const { clusters, totalNamed, loading } = useAllResults(userToken, language, true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }))

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const layout = useMemo(
    () => (clusters ? buildLayout(clusters, size.w) : { clusters: [], contentH: 0, cellW: CELL_W }),
    [clusters, size.w],
  )

  // Canvas covers the viewport (position:fixed), so cluster Y must be in
  // viewport coords. Subtract the current scrollTop from the logical Y.
  const canvasClusters = useMemo<ClusterDef[]>(
    () => layout.clusters.map((c) => ({ ...c, y: c.y - scrollTop })),
    [layout.clusters, scrollTop],
  )

  const isEmpty = clusters !== null && clusters.length === 0

  // Legend samples: first chip from the user's most-used cluster, plus the
  // first chip from that same name's crowd pool. Falls back to the dim
  // neutral when the crowd has nothing for that name.
  const sample      = clusters?.[0]
  const legendLeft  = rgbCss(sample?.pool[0],      EMPTY_CROWD)
  const legendRight = rgbCss(sample?.crowdPool[0], EMPTY_CROWD)

  return (
    <div
      ref={scrollRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("yourColorsTitle")}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{
        position:   "fixed",
        inset:      0,
        zIndex:     200,
        background: "#0a0a0a",
        fontFamily: "'Noto Sans', -apple-system, sans-serif",
        overflowY:  "auto",
      }}>
      {/* Top left: title and count (fixed to viewport) */}
      <div style={{
        position:       "fixed",
        top:            16,
        left:           20,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "flex-start",
        gap:            4,
        pointerEvents:  "none",
        zIndex:         2,
      }}>
        <h1 style={{
          fontSize:       14,
          fontWeight:     500,
          letterSpacing:  "0.04em",
          color:          PRIMARY,
          margin:         0,
        }}>
          {t("yourColorsTitle")}
        </h1>
        <p style={{
          fontSize:       12,
          letterSpacing:  "0.04em",
          color:          MUTED,
          margin:         0,
        }}>
          {t("yourColorsCount", String(totalNamed), String(CHIPS.length))}
        </p>
      </div>

      {/* Top center: legend (fixed to viewport) */}
      {layout.clusters.length > 0 && (
        <div style={{
          position:       "fixed",
          top:            18,
          left:           0,
          right:          0,
          display:        "flex",
          justifyContent: "center",
          alignItems:     "center",
          gap:            14,
          pointerEvents:  "none",
          zIndex:         2,
        }}>
          <span style={{
            fontSize:      11,
            letterSpacing: "0.04em",
            color:         MUTED,
          }}>
            {t("yourColorsLegendL")}
          </span>
          <div style={{ display: "flex", width: 48, height: 48 }}>
            <div style={{ flex: 1, background: legendLeft  }} />
            <div style={{ flex: 1, background: legendRight }} />
          </div>
          <span style={{
            fontSize:      11,
            letterSpacing: "0.04em",
            color:         MUTED,
          }}>
            {t("yourColorsLegendR")}
          </span>
        </div>
      )}

      {/* Top right: close × (fixed to viewport) */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position:   "fixed",
          top:        10,
          right:      10,
          background: "none",
          border:     "none",
          color:      PRIMARY,
          opacity:    0.55,
          cursor:     "pointer",
          fontSize:   20,
          lineHeight: 1,
          padding:    10,
          fontFamily: "inherit",
          zIndex:     3,
        }}>
        ×
      </button>

      {/* Loading spinner */}
      {loading && clusters === null && (
        <>
          <style>{`
            @keyframes cn-spin { to { transform: rotate(360deg); } }
          `}</style>
          <div style={{
            position:   "fixed",
            top:        "50%",
            left:       "50%",
            transform:  "translate(-50%, -50%)",
            width:      44,
            height:     44,
            borderRadius: "50%",
            border:     "2px solid rgba(255,255,255,0.15)",
            borderTopColor: PRIMARY,
            animation:  "cn-spin 0.8s linear infinite",
            opacity:    0.7,
          }} />
        </>
      )}

      {/* Empty state */}
      {isEmpty && (
        <p style={{
          position:       "fixed",
          top:            "50%",
          left:           "50%",
          transform:      "translate(-50%, -50%)",
          fontSize:       14,
          letterSpacing:  "0.03em",
          color:          MUTED,
          margin:         0,
        }}>
          {t("yourColorsEmpty")}
        </p>
      )}

      {/* Scrolling content. Holds the labels at their logical positions; the
          WebGL canvas is fixed to the viewport and offsets cluster Y by
          scrollTop on every frame to keep visual sync. */}
      {layout.clusters.length > 0 && (
        <div style={{
          position: "relative",
          width:    "100%",
          height:   layout.contentH,
        }}>
          {layout.clusters.map((c) => (
            <div
              key={c.name}
              style={{
                position:       "absolute",
                left:           c.x,
                top:            c.y + SQUARE + LABEL_GAP,
                transform:      "translate(-50%, 0)",
                textAlign:      "center",
                pointerEvents:  "none",
                fontSize:       13,
                fontWeight:     400,
                letterSpacing:  "0.03em",
                color:          PRIMARY,
                whiteSpace:     "nowrap",
              }}>
              {c.name} <span style={{ color: MUTED }}>({c.count.toLocaleString()})</span>
            </div>
          ))}
        </div>
      )}

      {layout.clusters.length > 0 && (
        <ResultsCanvas clusters={canvasClusters} mode="squares-split" />
      )}

      {/* Bottom center: hint (fixed to viewport) */}
      <div style={{
        position:       "fixed",
        bottom:         16,
        left:           0,
        right:          0,
        display:        "flex",
        justifyContent: "center",
        pointerEvents:  "none",
        zIndex:         2,
      }}>
        <span style={{
          fontSize:       11,
          letterSpacing:  "0.04em",
          color:          FAINT,
        }}>
          {t("yourColorsHint")}
        </span>
      </div>
    </div>
  )
}
