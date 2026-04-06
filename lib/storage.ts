const TOKEN_KEY = "userToken"
const NAMED_KEY = "namedColors"
const CVD_KEY   = "cvdType"

export type ColorVisionType = "none" | "red-green" | "blue-yellow" | "complete" | "unknown"

export async function getUserToken(): Promise<string> {
  const result = await chrome.storage.local.get(TOKEN_KEY)
  if (result[TOKEN_KEY]) return result[TOKEN_KEY]
  const token = crypto.randomUUID()
  await chrome.storage.local.set({ [TOKEN_KEY]: token })
  return token
}

export async function getNamedColors(): Promise<string[]> {
  const result = await chrome.storage.local.get(NAMED_KEY)
  return result[NAMED_KEY] ?? []
}

export async function getColorVisionType(): Promise<ColorVisionType | null> {
  const result = await chrome.storage.local.get(CVD_KEY)
  return result[CVD_KEY] ?? null
}

export async function setColorVisionType(type: ColorVisionType): Promise<void> {
  await chrome.storage.local.set({ [CVD_KEY]: type })
}

export async function markColorNamed(hex: string, paletteSize: number): Promise<string[]> {
  const named = await getNamedColors()
  if (named.includes(hex)) return named
  const updated = [...named, hex]
  // All colors done — reset the cycle
  if (updated.length >= paletteSize) {
    await chrome.storage.local.remove(NAMED_KEY)
    return []
  }
  await chrome.storage.local.set({ [NAMED_KEY]: updated })
  return updated
}
