# English UI Copy Style Guide

This project uses Chinese strings as i18next keys (see `web/src/i18n/locales/en.json`).
When editing **English values**, follow this guide to keep the UI consistent, compact, and “product-like”.

## 1) Case

- Prefer **sentence case** for most UI text (buttons, tabs, labels, helper text).
  - Good: `System settings`, `Usage logs`, `Save only`
  - Avoid: `System Settings`, `Usage Logs`, `Save Only`
- Use **Title Case** only for proper nouns / product names, or when the surrounding UI clearly uses Title Case.

## 2) Keep It Short (UI-friendly)

- Sidebar / tab labels should be **short nouns**.
  - Prefer: `Tokens`, `Models`, `Deployments`, `Users`, `Redemption codes`
  - Avoid: `Token Management`, `Model Deployment Management`, `Redemption Code Management`
- Avoid “English length inflation” that breaks layout.
  - Replace verbose phrases with UI-appropriate equivalents.

## 3) Voice & Tone

- Be direct and neutral. Avoid “translated” English.
- Avoid filler politeness when not needed.
  - Placeholders: prefer `Enter …` over `Please enter …`
- Avoid rigid literal translations of Chinese “提示性废话”.
  - Prefer concise, actionable wording.

## 4) State vs Action (Do not mix)

- **Actions** (buttons/menu items) use verbs:
  - `Enable`, `Disable`, `Save`, `Regenerate`
- **States** (tags/status text) use adjectives/past participles:
  - `Enabled`, `Disabled`, `Saved`, `Connected`

## 5) Labels vs Helper Text

- Labels should be short.
- Explanatory text should stay explanatory (don’t translate it into a label).
  - Example label fragments used in descriptions:
    - `Homepage URL:`
    - `Redirect URL:`
    - `Callback URL:`

## 6) Plurals, Uncountables, and Counts

- Use i18next plural keys (`_one`, `_other`) when the UI depends on `count`.
- Avoid incorrect pluralization or adding “an individual/unit” for Chinese measure words.
  - If a key is used purely as a measure word suffix (e.g. `个`), it should usually be an empty string.

## 7) Interpolation & Punctuation

- Keep interpolation tokens intact: `{{count}}`, `{{name}}`, etc.
- Use natural English word order around variables.
- Ensure spacing around punctuation when needed (e.g., `, ` and `: `).

## 8) Terminology (be consistent)

Pick one term and use it everywhere:

- `token` / `API token`
- `channel` (or `provider`) — choose one, don’t mix
- `deployment`
- `redemption code`

## Quick Checklist

- Is it short enough for a button/tab?
- Is the case consistent (sentence case)?
- Is it an action vs a state?
- Does it sound like a product UI (not a translation)?
- Are plurals/counts correct?
- Are interpolation placeholders preserved?

