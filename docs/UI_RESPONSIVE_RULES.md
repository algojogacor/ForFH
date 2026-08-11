# ForFH Responsive Design Rules

## 1. Absolute Hard Rule
**NEVER hide essential information on mobile viewports using `hidden sm:block` or `display:none`.**

Instead of hiding data:
- **Transform**: Convert horizontal table columns into clean vertically-stacked row cards.
- **Stack**: Rearrange multi-column layouts into a 1-column responsive layout.
- **Secondary Actions**: Move row-level secondary actions into desktop hover triggers or a mobile overflow `MoreVertical` popover menu.

---

## 2. Layout Breakpoints & Containers

### PageContainer Variants
- **`wide`** (`max-w-7xl`): For high-density lists, course hubs, calendar canvas, tables.
- **`standard`** (`max-w-4xl`): For settings, profile forms, dashboards.
- **`reading`** (`max-w-3xl`): For writing notes & reading law texts (optimal 65-75ch measure).
- **`form`** (`max-w-xl`): For modal dialogs and wizards.

---

## 3. Mobile Navigation (`MobileNav`)
- Fixed bottom bar on mobile viewports (`sm:hidden`).
- 5 integrated touch targets:
  1. `Beranda` (`/`)
  2. `Kalender` (`/kalender`)
  3. **Quick Capture** (Center elevated circular button)
  4. `Tugas` (`/tugas`)
  5. `Menu` (Opens slide-over drawer with full navigation links)
- Safe area support via `pb-safe` and `env(safe-area-inset-bottom)`.

---

## 4. Touch Targets & Safe Areas
- Interactive elements on touch viewports maintain a minimum 44×44px hit area.
- Content containers use safe-area padding at bottom to prevent overlap with iOS home indicators.
