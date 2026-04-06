import { useState, useEffect } from "react"
import ColorNamingUI from "~components/ColorNamingUI"
import ColorBlindnessModal from "~components/ColorBlindnessModal"
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
    supabase.from("user_preferences").upsert({
      user_token: userToken,
      cvd_type:   type,
      updated_at: new Date().toISOString(),
    }).then(({ error }) => { if (error) console.error("CVD sync error:", error) })
  }

  async function handleSubmitted() {
    if (!chip) return
    const updated = await markColorNamed(chip.hex, CHIPS.length)
    setNamedCount(updated.length)
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
      {/* Top left — responding in */}
      <div style={{
        position:       "fixed",
        top:            0,
        left:           0,
        height:         48,
        display:        "flex",
        alignItems:     "center",
        paddingLeft:    24,
      }}>
        <button
          onClick={() => chrome.tabs.create({ url: "chrome://settings/languages" })}
          style={{
            background:    "none",
            border:        "none",
            padding:       0,
            cursor:        "pointer",
            fontSize:      13,
            letterSpacing: "0.03em",
            color:         col,
            opacity:       0.6,
            fontFamily:    "inherit",
            transition:    "opacity 0.2s, color 0.8s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
        >
          {t("respondingIn", langName ?? langCode)}
        </button>
      </div>

      {/* Top right — settings */}
      <button
        onClick={() => setShowCvdModal(true)}
        aria-label="Color vision settings"
        style={{
          position:   "fixed",
          top:        12,
          right:      16,
          background: "none",
          border:     "none",
          padding:    "8px 10px",
          cursor:     "pointer",
          fontSize:   22,
          color:      col,
          opacity:    0.65,
          lineHeight: 1,
          fontFamily: "inherit",
          transition: "opacity 0.2s, color 0.8s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.65")}
      >
        ⚙
      </button>

      {/* Bottom center — colors named */}
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
          fontSize:      11,
          letterSpacing: "0.04em",
          color:         col,
          opacity:       0.4,
          transition:    "color 0.8s ease",
        }}>
          {t("colorsNamed", String(namedCount), String(CHIPS.length))}
        </span>
      </div>

      {showCvdModal && (
        <ColorBlindnessModal
          isOnboarding={cvdType === null}
          initialValue={cvdType}
          onSave={handleCvdSave}
          onDismiss={() => setShowCvdModal(false)}
        />
      )}
    </div>
  )
}
