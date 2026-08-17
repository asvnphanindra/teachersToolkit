---
name: apple-ui
description: Applies an Apple-inspired UI/UX system to Teacher's Toolkit surfaces. Use when designing, restyling, or polishing the home page, tool shells, visual layout, typography, motion, or when the user mentions Apple-like, UI, UX, visual polish, or Teachers Toolkit styling.
---

# Apple-inspired UI for Teacher's Toolkit

Inspiration only. Do not copy Apple trademarks, SF Pro, or pixel-clone apple.com. Aim for clarity, spacing, hierarchy, and restraint.

## When to use

Apply to hub pages, tool chrome (header, hero, empty states), and marketing-like surfaces.

Do not restyle PDF export internals, clash math, storage, or other non-visual logic.

## Apply order

1. Read this skill, then [reference.md](reference.md) if tokens or markup are needed.
2. Extend shared CSS variables; prefer home- or tool-scoped selectors until a surface is approved.
3. Change the requested surface only (home first, then the active tool).
4. Keep [`public/assets/shared/tools-manifest.js`](../../../public/assets/shared/tools-manifest.js) behavior intact unless the task is product status, not look.

## Visual principles

- One composition per viewport. Brand or product name is a hero-level signal, not only nav text.
- First viewport: brand, one headline, one short supporting sentence, one CTA group. No stats, pillars, or tool grids in the hero.
- Generous whitespace. Large, calm type hierarchy. Restrained color.
- Light-forward surfaces with soft depth (subtle wash or grain), not a flat fill and not a purple-to-indigo gradient.
- Frosted / translucent sticky chrome where a header sits over content.
- Tool entry as focused panels, not a dense dashboard.

## Typography

- Display: distinctive geometric or humanist sans (e.g. Sora). Body: clean readable sans (e.g. Source Sans 3).
- Avoid Inter, Roboto, Arial, and generic system-only stacks as the primary look.
- Tight tracking on large headlines. Comfortable line-height on body.

## Color and surfaces (canonical palette)

Follow this palette on every surface that adopts apple-ui:

| Role | Token | Value |
|------|--------|--------|
| Page canvas | `--color-bg` | `#f5f5f7` |
| Elevated panel | `--color-panel` | `#fbfbfd` |
| Frosted chrome | — | `rgba(251, 251, 253, 0.72)` |
| Primary text | `--color-text` | `#1d1d1f` |
| Secondary text | `--color-text-muted` | `#86868b` |
| Accent (CTAs, links) | `--color-accent` | `#0071e3` |
| Accent hover | `--color-accent-hover` | `#0077ed` |
| Accent wash | `--color-accent-tint` | `rgba(0, 113, 227, 0.06)` |
| Hairline border | `--color-border` | `rgba(0, 0, 0, 0.06)` |
| Live badge | — | bg `#eaf7ef` / text `#1d7a37` |
| Dev badge | — | bg `#eaf2fc` / text `#0062c4` |
| Soon badge | — | bg `#efeff1` / text `#6e6e73` |

Eye-comfort rules:

- Never use `#ffffff` for large areas or `#000000` for text. Use `--home-panel` and `--home-text`.
- Keep contrast confident but soft: near-black on off-white, secondary text at `#86868b`.
- One accent only. No purple/indigo themes, no saturated fills behind body text, no dark-mode-first shells.
- Shadows stay low-opacity (`<= 0.08`) and appear on hover, not at rest.
- Scope under shared `:root` tokens in `toolkit.css`. Prefer tool-local variables that alias the same palette values.
- Cards only when they wrap a real interaction.

## Layout

- Sticky translucent header, full-bleed sections, centered max-width content.
- Mobile: same composition stacked; brand still first.

## Motion

Ship 2–3 intentional motions: header fade/blur, hero entrance (opacity + slight rise), tool-tile hover (lift/opacity). No bounce, glow, or noisy loops.

## Do

- Keep live / under-development / coming-soon badges working.
- Preserve accessibility: contrast, focus states, semantic headings.
- Match existing frontend rules: no inset hero cards, no overlay stickers on hero media.

## Don't

- Don't introduce dark-mode-first Apple clones, glow, or pill-cluster clutter.
- Don't put emojis in the hero brand lockup.
- Don't invent a second accent or purple/indigo theme per app.
