import { useState, useEffect } from "react"
import ColorNamingUI from "~components/ColorNamingUI"
import { CHIPS, pickUnnamedChip, uiColor } from "~lib/palette"
import { getUserToken, getNamedColors, markColorNamed } from "~lib/storage"
import type { Chip } from "~lib/palette"

import "./newtab.css"
import "@fontsource/instrument-sans/400.css"
import "@fontsource/instrument-sans/500.css"
import "@fontsource/instrument-sans/600.css"

export default function NewTab() {
  const [chip, setChip] = useState<Chip | null>(null)
  const [namedCount, setNamedCount] = useState(0)
  const [userToken, setUserToken] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const [token, named] = await Promise.all([getUserToken(), getNamedColors()])
      setUserToken(token)
      setNamedCount(named.length)
      setChip(pickUnnamedChip(named))
    }
    init()
  }, [])

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

  if (!chip || !userToken) return null

  const col = uiColor(chip.rgb)
  const langCode = navigator.language.split("-")[0]
  const langName = new Intl.DisplayNames([navigator.language], { type: "language" }).of(langCode)

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: chip.hex,
        fontFamily: "'Instrument Sans', -apple-system, sans-serif",
        transition: "background-color 0.8s ease",
      }}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
        <ColorNamingUI chip={chip} userToken={userToken} onSubmitted={handleSubmitted} onNext={handleNext} />
      </div>
      <div
        style={{
          position: "fixed",
          bottom: 20,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          padding: "0 24px",
          fontSize: 11,
          letterSpacing: "0.04em",
          color: col,
          opacity: 0.4,
          transition: "color 0.8s ease",
          pointerEvents: "none",
        }}>
        <span>{namedCount} / {CHIPS.length} colors named</span>
        <span>responding in {langName} · change in browser language settings to switch</span>
      </div>
    </div>
  )
}
