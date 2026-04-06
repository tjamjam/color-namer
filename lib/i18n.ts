import { useState, useEffect } from "react"

export const EN = {
  prompt:       "what would you call this color?",
  placeholder:  "type a name...",
  nextColor:    "next color \u2192",
  youSaid:      "you said \u201c{0}\u201d",
  firstToName:  "you\u2019re the first to name this one",
  keepItClean:  "keep it clean",
  oneWordOnly:  "one word only",
  didYouMean:   "did you mean\u2026",
  colorsNamed:  "{0} / {1} colors named",
  respondingIn: "responding in {0} \u00b7 click to change",

  // Color vision modal
  cvdTitleOnboarding:   "one quick question",
  cvdTitleSettings:     "color vision",
  cvdSubtitleOnboarding: "do you have a color vision difference? this helps us understand how different people perceive color.",
  cvdSubtitleSettings:  "update your color vision preference.",
  cvdSave:              "save",
  cvdSkip:              "skip for now",
  cvdNone:              "normal color vision",
  cvdNoneSub:           "I see the full range of colors",
  cvdRedGreen:          "red-green",
  cvdRedGreenSub:       "protanopia or deuteranopia",
  cvdBlueYellow:        "blue-yellow",
  cvdBlueYellowSub:     "tritanopia",
  cvdComplete:          "achromatopsia",
  cvdCompleteSub:       "complete color blindness",
  cvdUnknown:           "not sure",
  cvdUnknownSub:        "prefer not to say",
  cvdFallback:          "not enough responses from colorblind users yet \u2014 showing everyone\u2019s results",
}

type Strings = typeof EN

async function translateOne(text: string, lang: string): Promise<string> {
  // Try Chrome built-in Translator API (Chrome 138+, on-device)
  if ("Translator" in self) {
    try {
      const T = (self as any).Translator
      const avail = await T.availability({ sourceLanguage: "en", targetLanguage: lang })
      console.log("[i18n] Chrome Translator availability:", avail)
      if (avail !== "unavailable") {
        const translator = await T.create({ sourceLanguage: "en", targetLanguage: lang })
        const result = await translator.translate(text)
        if (result) return result
      }
    } catch (e) {
      console.warn("[i18n] Chrome Translator error:", e)
    }
  }

  // Fallback: MyMemory (free, no API key, 50k chars/day)
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}&de=colornamer@noreply.local`
    console.log("[i18n] Fetching MyMemory:", url)
    const res = await fetch(url)
    const data = await res.json()
    console.log("[i18n] MyMemory response:", data)
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText
    }
  } catch (e) {
    console.error("[i18n] MyMemory fetch error:", e)
  }

  return text
}

async function loadTranslations(lang: string): Promise<Strings> {
  if (lang === "en") return EN

  const cacheKey = `i18n_v3_${lang}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  const entries = await Promise.all(
    Object.entries(EN).map(async ([key, value]) => [key, await translateOne(value, lang)])
  )

  const result = Object.fromEntries(entries) as Strings

  // Only cache if at least one string was actually translated
  const anyTranslated = Object.entries(result).some(([k, v]) => v !== EN[k as keyof Strings])
  if (anyTranslated) {
    try { localStorage.setItem(cacheKey, JSON.stringify(result)) } catch {}
  }
  return result
}

export function useTranslations() {
  const lang = navigator.language.split("-")[0]
  const [strings, setStrings] = useState<Strings>(EN)

  useEffect(() => {
    loadTranslations(lang).then(setStrings)
  }, [lang])

  return function t(key: keyof Strings, ...args: string[]): string {
    let s = strings[key]
    args.forEach((a, i) => { s = s.replace(`{${i}}`, a) })
    return s
  }
}
