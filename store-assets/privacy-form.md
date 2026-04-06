# Chrome Web Store — Privacy & Data Usage Form

## Single purpose description
Name that color. See what the world calls it. A new tab filled with color — and curiosity.

---

## Permission justifications

### `storage`
Color Namer uses `chrome.storage.local` to persist three things: (1) a randomly generated anonymous UUID, created once on install, used solely to deduplicate submissions so the same person's response isn't counted twice for a given color; (2) the user's color vision type if they choose to share it; and (3) cached UI translations to avoid redundant network requests. When the user submits a color name, that submission (hex color, the name typed, the anonymous UUID, browser language, and optional CVD type) is also sent to a Supabase database to aggregate crowd-sourced color-naming statistics. No personally identifiable information is ever collected or transmitted.

### `tabs` / `newtab` override
The extension replaces the new tab page, which is its core purpose.

---

## Remote code
**No.** All JavaScript is bundled inside the extension package. No external scripts are loaded, no `eval()` is used, and no code is fetched at runtime.

---

## Data usage — collected categories
**None of the listed categories apply.**

The only data submitted is: the hex color shown, the name the user typed, the anonymous UUID, the browser language setting, and optionally the user's color vision type. None of this is personally identifiable, financial, health-related, or otherwise sensitive. Submissions are sent to Supabase solely to aggregate color-naming statistics.

- Personally identifiable information: **No**
- Health information: **No**
- Financial and payment information: **No**
- Authentication information: **No**
- Personal communications: **No**
- Location: **No**
- Web history: **No**
- User activity: **No**
- Website content: **No**

---

## Certifications (all three apply)
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## Privacy policy URL
https://tjamjam.github.io/color-namer/privacy.html
