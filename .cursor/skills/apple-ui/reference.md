# Apple UI tokens and patterns

Use these when implementing Teacher's Toolkit hub or a later tool shell. Scope under `.page-home` until other apps are approved.

## CSS variables (canonical — shared)

Use these values everywhere. In `toolkit.css` they live on `:root` as `--color-*`. Tool CSS should alias (`--ct-*`, `--lp-*`, `--ink`/`--primary`) to the same hexes.

```css
:root {
  --color-bg: #f5f5f7;
  --color-panel: #fbfbfd;
  --color-text: #1d1d1f;
  --color-text-muted: #86868b;
  --color-accent: #0A6B6B;
  --color-accent-hover: #0C7C7C;
  --color-accent-soft: #E6F3F3;
  --color-accent-tint: rgba(10, 107, 107, 0.06);
  --color-border: rgba(0, 0, 0, 0.06);
  --font-display: "Sora", "Source Sans 3", sans-serif;
  --font: "Source Sans 3", sans-serif;
}
```

Background recipe: `--color-panel` → `--color-bg` with a faint teal radial. Alternate bands between panel and bg so no large area is pure white.

## Header

Frosted sticky bar. Logo is compact; the large brand lives in the hero.

```html
<header class="site-header">
  <div class="header-inner">
    <a class="site-logo" href="./">Teacher's Toolkit</a>
    <nav class="site-nav" aria-label="Main">
      <a href="#tools">Tools</a>
      <a href="about.html">About</a>
    </nav>
  </div>
</header>
```

```css
.page-home .site-header {
  background: var(--home-surface);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--home-border);
}
```

## Hero (first viewport)

Brand, one headline, one sentence, one CTA group. No pillars or tool grid.

```html
<section class="home-hero" aria-labelledby="hero-heading">
  <p class="home-brand">Teacher's Toolkit</p>
  <h1 id="hero-heading">Plan with confidence</h1>
  <p class="home-subtext" id="subtext">…</p>
  <div class="home-cta">
    <a class="btn btn--primary" href="#tools">Explore tools</a>
    <a class="btn btn--secondary" href="about.html">About</a>
  </div>
</section>
```

## Tools band

Full-bleed second section. Tiles are interaction containers (open a tool). Keep badges from the manifest.

## Motion

```css
@keyframes home-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.page-home .home-hero > * {
  animation: home-rise 0.7s ease both;
}
```

Stagger children with `animation-delay`. Tool tiles: `transform` + `box-shadow` on hover, ~200ms.

## Shared file map

- Hub markup: `public/index.html`
- Shared CSS: `public/assets/shared/toolkit.css` (home rules under `.page-home`)
- Tool list: `public/assets/shared/tools-manifest.js`
