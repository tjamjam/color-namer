import { useState, useEffect } from "react"
import { useTranslations } from "~lib/i18n"
import type { ColorVisionType } from "~lib/storage"

const OPTION_VALUES: ColorVisionType[] = ["none", "red-green", "blue-yellow", "complete", "unknown"]

export default function ColorBlindnessModal({
  isOnboarding,
  initialValue,
  onSave,
  onDismiss,
}: {
  isOnboarding: boolean
  initialValue: ColorVisionType | null
  onSave: (type: ColorVisionType) => void
  onDismiss: () => void
}) {
  const t = useTranslations()
  const [selected, setSelected] = useState<ColorVisionType>(initialValue ?? "none")

  const optionLabels: Record<ColorVisionType, { label: string; sub: string }> = {
    "none":        { label: t("cvdNone"),       sub: t("cvdNoneSub") },
    "red-green":   { label: t("cvdRedGreen"),   sub: t("cvdRedGreenSub") },
    "blue-yellow": { label: t("cvdBlueYellow"), sub: t("cvdBlueYellowSub") },
    "complete":    { label: t("cvdComplete"),   sub: t("cvdCompleteSub") },
    "unknown":     { label: t("cvdUnknown"),    sub: t("cvdUnknownSub") },
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") isOnboarding ? onSave("unknown") : onDismiss()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isOnboarding, onSave, onDismiss])

  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      zIndex:         100,
      background:     "rgba(0,0,0,0.35)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
    }}>
      <div style={{
        background:   "#fff",
        borderRadius: 16,
        padding:      "32px 36px",
        maxWidth:     420,
        width:        "calc(100% - 48px)",
        position:     "relative",
        boxShadow:    "0 24px 60px rgba(0,0,0,0.2)",
      }}>
        {!isOnboarding && (
          <button
            onClick={onDismiss}
            aria-label="Close"
            style={{
              position:   "absolute",
              top:        16,
              right:      16,
              background: "none",
              border:     "none",
              color:      "#000",
              opacity:    0.3,
              cursor:     "pointer",
              fontSize:   20,
              lineHeight: 1,
              padding:    4,
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        )}

        <p style={{
          fontSize:      15,
          fontWeight:    600,
          letterSpacing: "0.02em",
          color:         "#111",
          margin:        "0 0 8px",
        }}>
          {isOnboarding ? t("cvdTitleOnboarding") : t("cvdTitleSettings")}
        </p>
        <p style={{
          fontSize:      13,
          letterSpacing: "0.02em",
          lineHeight:    1.6,
          color:         "#555",
          margin:        "0 0 24px",
        }}>
          {isOnboarding ? t("cvdSubtitleOnboarding") : t("cvdSubtitleSettings")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {OPTION_VALUES.map((value) => {
            const isSelected = selected === value
            const { label, sub } = optionLabels[value]
            return (
              <button
                key={value}
                onClick={() => setSelected(value)}
                style={{
                  display:      "flex",
                  alignItems:   "baseline",
                  gap:          10,
                  padding:      "12px 16px",
                  borderRadius: 10,
                  border:       `1.5px solid ${isSelected ? "#111" : "#e5e5e5"}`,
                  background:   isSelected ? "#f5f5f5" : "#fff",
                  color:        "#111",
                  cursor:       "pointer",
                  textAlign:    "left",
                  fontFamily:   "'Noto Sans', -apple-system, sans-serif",
                  transition:   "border-color 0.15s, background 0.15s",
                  width:        "100%",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.02em" }}>
                  {label}
                </span>
                <span style={{ fontSize: 11, color: "#888", letterSpacing: "0.03em" }}>
                  {sub}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16 }}>
          {isOnboarding && (
            <button
              onClick={() => onSave("unknown")}
              style={{
                background:    "none",
                border:        "none",
                color:         "#888",
                cursor:        "pointer",
                fontSize:      12,
                letterSpacing: "0.04em",
                fontFamily:    "inherit",
                padding:       0,
              }}
            >
              {t("cvdSkip")}
            </button>
          )}
          <button
            onClick={() => onSave(selected)}
            style={{
              fontFamily:    "'Noto Sans', -apple-system, sans-serif",
              fontSize:      13,
              fontWeight:    600,
              letterSpacing: "0.04em",
              padding:       "10px 24px",
              borderRadius:  8,
              border:        "none",
              background:    "#111",
              color:         "#fff",
              cursor:        "pointer",
              transition:    "opacity 0.2s",
            }}
          >
            {t("cvdSave")}
          </button>
        </div>
      </div>
    </div>
  )
}
