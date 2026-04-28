import { useState, useEffect } from "react"
import { Settings } from "lucide-react"
import ColorNamingUI from "~components/ColorNamingUI"
import ColorBlindnessModal from "~components/ColorBlindnessModal"
import AllResultsView from "~components/AllResultsView"
import { CHIPS, pickUnnamedChip, uiColor, luminance } from "~lib/palette"
import { getUserToken, getNamedColors, markColorNamed, getColorVisionType, setColorVisionType } from "~lib/storage"
import { supabase } from "~lib/supabase"
import { useTranslations } from "~lib/i18n"
import type { Chip } from "~lib/palette"
import type { ColorVisionType } from "~lib/storage"

import "./newtab.css"
import "@fontsource/noto-sans/400.css"
import "@fontsource/noto-sans/500.css"
import "@fontsource/noto-sans/600.css"

export default function NewTab() {
  const [chip, setChip] = useState<Chip | null>(null)
  const [namedCount, setNamedCount] = useState(0)
  const [userToken, setUserToken] = useState<string | null>(null)
  const [cvdType, setCvdType] = useState<ColorVisionType | null | undefined>(undefined)
  const [showCvdModal, setShowCvdModal] = useState(false)
  const [showAllResults, setShowAllResults] = useState(false)
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "r") return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      setShowAllResults((v) => !v)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  useEffect(() => {
    async function init() {
      const [token, named, cvd] = await Promise.all([
        getUserToken(),
        getNamedColors(),
        getColorVisionType(),
      ])
      setUserToken(token)
      setNamedCount(named.length)
      setChip(pickUnnamedChip(named))
      setCvdType(cvd)
      if (cvd === null) setShowCvdModal(true)
    }
    init()
  }, [])

  const t = useTranslations()

  if (!chip || !userToken || cvdType === undefined) return null

  const col       = uiColor(chip.rgb)
  const lum       = luminance(chip.rgb)
  const glassBase = lum > 0.55 ? "rgba(0,0,0," : "rgba(255,255,255,"
  const glassBg   = `${glassBase}0.08)`
  const glassBorder = `${glassBase}0.12)`
  const langCode  = navigator.language.split("-")[0]
  const langName  = new Intl.DisplayNames([navigator.language], { type: "language" }).of(langCode)

  async function handleCvdSave(type: ColorVisionType) {
    await setColorVisionType(type)
    setCvdType(type)
    setShowCvdModal(false)
    const { error } = await supabase.from("user_preferences").upsert({
      user_token: userToken,
      cvd_type:   type,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      console.error("CVD sync error:", error)
      setToast({ kind: "error", message: t("settingsSyncError") })
    } else {
      setToast({ kind: "success", message: t("settingsSaved") })
    }
  }

  async function handleSubmitted() {
    if (!chip) return
    const { list, justCompleted } = await markColorNamed(chip.hex, CHIPS.length)
    setNamedCount(list.length)
    if (justCompleted) setShowAllResults(true)
  }

  async function handleNext() {
    if (!chip) return
    const named = await getNamedColors()
    setChip(pickUnnamedChip(named))
  }

  return (
    <div
      style={{
        width:           "100vw",
        height:          "100vh",
        overflow:        "hidden",
        backgroundColor: chip.hex,
        fontFamily:      "'Noto Sans', -apple-system, sans-serif",
        transition:      "background-color 0.8s ease",
      }}>
      <div
        style={{
          position:       "fixed",
          inset:          0,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
        }}>
        <ColorNamingUI
          chip={chip}
          userToken={userToken}
          cvdType={cvdType ?? "unknown"}
          onSubmitted={handleSubmitted}
          onNext={handleNext}
        />
      </div>
      {/* Top left, responding in */}
      <div style={{
        position:       "fixed",
        top:            0,
        left:           0,
        height:         48,
        display:        "flex",
        alignItems:     "center",
        paddingLeft:    12,
      }}>
        <button
          onClick={() => chrome.tabs.create({ url: "chrome://settings/languages" })}
          style={{
            background:    "none",
            border:        "none",
            padding:       "8px 12px",
            cursor:        "pointer",
            fontSize:      13,
            letterSpacing: "0.03em",
            color:         col,
            opacity:       0.85,
            fontFamily:    "inherit",
            transition:    "opacity 0.2s, color 0.8s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
        >
          {t("respondingIn", langName ?? langCode)}
        </button>
      </div>

      {/* Top right, settings */}
      <button
        onClick={() => setShowCvdModal(true)}
        aria-label="Color vision settings"
        style={{
          position:       "fixed",
          top:            8,
          right:          12,
          background:     "none",
          border:         "none",
          padding:        10,
          cursor:         "pointer",
          color:          col,
          opacity:        0.85,
          lineHeight:     0,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          transition:     "opacity 0.2s, color 0.8s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
      >
        <Settings size={22} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {/* Bottom center, colors named + see-results hint or link */}
      <div style={{
        position:       "fixed",
        bottom:         20,
        left:           0,
        right:          0,
        display:        "flex",
        justifyContent: "center",
        pointerEvents:  "none",
      }}>
        <span style={{
          fontSize:      12,
          letterSpacing: "0.04em",
          color:         col,
          opacity:       0.75,
          transition:    "color 0.8s ease",
        }}>
          {t("colorsNamed", String(namedCount), String(CHIPS.length))}
          {" ("}
          {namedCount === CHIPS.length ? (
            <button
              onClick={() => setShowAllResults(true)}
              style={{
                background:     "none",
                border:         "none",
                padding:        0,
                color:          col,
                cursor:         "pointer",
                fontSize:       "inherit",
                fontFamily:     "inherit",
                letterSpacing:  "inherit",
                textDecoration: "underline",
                opacity:        1,
                pointerEvents:  "auto",
                transition:     "color 0.8s ease",
              }}>
              {t("seeResultsLink")}
            </button>
          ) : (
            <span style={{ opacity: 0.85 }}>{t("seeResultsHint")}</span>
          )}
          {")"}
        </span>
      </div>

      {toast && (
        <>
          <style>{`
            @keyframes cn-toast {
              0%   { transform: translateY(-32px); opacity: 0; }
              10%  { transform: translateY(0);     opacity: 1; }
              90%  { transform: translateY(0);     opacity: 1; }
              100% { transform: translateY(-32px); opacity: 0; }
            }
          `}</style>
          <div
            role="status"
            aria-live="polite"
            style={{
              position:       "fixed",
              top:            16,
              left:           0,
              right:          0,
              display:        "flex",
              justifyContent: "center",
              pointerEvents:  "none",
              zIndex:         50,
            }}>
            <div style={{
              padding:              "12px 22px",
              borderRadius:         10,
              background:           `${glassBase}0.18)`,
              border:               `1px solid ${glassBase}0.30)`,
              backdropFilter:       "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              fontSize:             13,
              fontWeight:           500,
              letterSpacing:        "0.04em",
              color:                col,
              boxShadow:            "0 8px 24px rgba(0,0,0,0.18)",
              animation:            "cn-toast 3000ms ease-out forwards",
              transition:           "color 0.8s ease, border-color 0.8s ease",
            }}>
              {toast.message}
            </div>
          </div>
        </>
      )}

      {showCvdModal && (
        <ColorBlindnessModal
          isOnboarding={cvdType === null}
          initialValue={cvdType}
          onSave={handleCvdSave}
          onDismiss={() => setShowCvdModal(false)}
        />
      )}

      {showAllResults && (
        <AllResultsView
          userToken={userToken}
          language={langCode}
          onClose={() => setShowAllResults(false)}
        />
      )}
    </div>
  )
}
