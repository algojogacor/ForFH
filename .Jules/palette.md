## 2025-02-18 - [Accessibility: Missing ARIA Labels on Icon-Only Buttons]
**Learning:** Icon-only interactive elements (such as checkboxes, theme toggles, and deletion/edit buttons) in this application rely entirely on visual cues or basic HTML titles. This makes them completely invisible or confusing to screen readers, violating essential accessibility standards.
**Action:** Always provide descriptive `aria-label` attributes to icon-only buttons or interactive indicators to ensure they are screen reader friendly.
