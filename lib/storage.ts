const TOKEN_KEY = "userToken"
const NAMED_KEY = "namedColors"

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
