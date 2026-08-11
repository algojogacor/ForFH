# ForFH UI Design System — Paper & Ink (Warm Academic Premium)

## 1. Design Philosophy
ForFH is a calm, refined, intelligent academic operating system for university law students. The UI visual identity is **Paper & Ink**:
- **Warm & Tactile**: Cream/ivory canvas (`#FAF9F7`) with deep ink typography (`#1A1A1A`), evoking the warmth of high-end paper and precision software.
- **Editorial Typography**: Pairing modern clean `Instrument Sans` with a classic editorial serif (`Newsreader`) for page headings and reading moments.
- **Restrained Ink Accent**: Muted Dusty Navy (`#3D5A80`) used for interactive focus, selection, primary action buttons, and active indicators.
- **Warm Charcoal Dark Mode**: Refined dark counterpart (`#141413`) with warm charcoal tones (`#1E1D1B`).

---

## 2. Color Palette & Tokens

### Light Mode (Primary Identity)
| Token | Variable | Value | Purpose |
| :--- | :--- | :--- | :--- |
| Canvas Background | `--canvas` | `#FAF9F7` | Warm cream page canvas — the "paper" |
| Sidebar Surface | `--sidebar` | `#F5F3F0` | Warm receded sidebar container |
| Surface 1 | `--surface-1` | `#FFFFFF` | Clean white elevated cards and containers |
| Surface 2 | `--surface-2` | `#F5F3F0` | Hover states, table row highlights |
| Surface 3 | `--surface-3` | `#EDEBE8` | Active states, pressed buttons |
| Primary Text | `--text-primary` | `#1A1A1A` | Deep ink text |
| Secondary Text | `--text-secondary` | `#64635E` | Muted warm gray metadata |
| Border Default | `--border-default` | `#E8E5E0` | Hairline separators and card edges |
| Primary Accent | `--accent` | `#3D5A80` | Dusty Navy — the "ink" |

### Dark Mode (Warm Charcoal Counterpart)
| Token | Variable | Value | Purpose |
| :--- | :--- | :--- | :--- |
| Canvas Background | `--canvas` | `#141413` | Warm charcoal canvas |
| Sidebar Surface | `--sidebar` | `#1A1917` | Lighter dark sidebar |
| Surface 1 | `--surface-1` | `#1E1D1B` | Warm dark cards |
| Surface 2 | `--surface-2` | `#252422` | Hover states |
| Border Default | `--border-default` | `#2E2D2A` | Dark hairline separators |
| Primary Accent | `--accent` | `#6B9AC4` | Lighter dusty blue accent |

---

## 3. Typography Rules
- **UI Sans**: `Instrument Sans`, `-apple-system`, `sans-serif`.
- **Editorial Serif**: `Newsreader`, `Georgia`, `serif` (used for brand wordmark, page titles, greeting headers, and legal reading text).
- **Numerics**: `.tabular-nums` for strict alignment.
- **Zero Emoji**: Strictly no Unicode emojis or emoticons anywhere.
