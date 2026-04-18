---
description: Bump the extension version, commit, tag, and push so the submit workflow can be triggered
---

Cut a new release of the extension.

Steps:

1. Read the current `version` in `package.json`.
2. Ask the user which bump they want (patch / minor / major) unless `$ARGUMENTS` already specifies one (e.g. `patch`, `minor`, `major`, or an explicit version like `0.2.0`).
3. Update `version` in `package.json` to the new value. Leave everything else in the file untouched.
4. Run `git status` and `git diff package.json` to confirm the only change is the version bump. If the working tree has unrelated changes, stop and ask the user what to do — do not sweep them into the release commit.
5. Stage `package.json`, commit with message `Bump to v<new-version>` (imperative, no trailing period, matches repo style), and push to `main`.
6. Tell the user the new version is live on the branch and remind them to trigger the "Submit to Web Store" workflow from the GitHub Actions tab (it's `workflow_dispatch` only — it does not auto-run on push).

Do not push a git tag unless the user asks for one. Do not open the browser. Do not run `npm run build` — CI does that.
