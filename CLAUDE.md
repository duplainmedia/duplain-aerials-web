# Duplain Aerials

Static pitch site for Duplain Aerials, the aerial-imaging arm of Duplain Media. Lead service is HOA littoral-zone documentation in Southwest Florida (Ft. Myers through Tampa/Lakeland, based Sarasota). Deployed on Netlify.

## Structure

- `index.html`: single-page site, all sections inline (hero, services, work, about, FAQ, contact)
- `privacy.html`: privacy policy (served at `/privacy`)
- `404.html`: on-brand not-found page (Netlify auto-serves as fallback)
- `assets/css/style.css`: design tokens + full stylesheet
- `assets/js/main.js`: cursor reticle, altitude ribbon, scroll reveals, form success state
- `assets/favicon.svg`: dark tile with shallow-blue propeller mark
- `assets/og-image.svg`: 1200×630 social share card (may be rasterized for broader platform support)
- `netlify.toml`: publish dir + headers
- `robots.txt`: public crawl allowed

Brand lockup: `Duplain Aerials` (parent: Duplain Media). Wordmark sets "Duplain" upright and "Aerials" in italic serif.

## Design tokens (CSS variables in `:root`)

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#F7F6F1` | Background (warm white) |
| `--paper-warm` | `#EFEDE4` | Secondary surface |
| `--ink` | `#0B1416` | Body text, dark panels |
| `--gulf` | `#1D6A7A` | Primary accent (Florida gulf blue) |
| `--gulf-deep` | `#134350` | Hover state, deep accent |
| `--shallow` | `#7CC4C9` | Secondary accent (turquoise) |
| `--estuary` | `#2E4F3F` | Deep organic green |
| `--sawgrass` | `#8FA37F` | Muted sage |
| `--sand` | `#E8DFCF` | Warm highlight, tag chips |

Typography: Instrument Serif (display), Inter (body), JetBrains Mono (technical readouts). Loaded via Google Fonts.

## Interactive elements

- **Cursor reticle:** thin SVG crosshair follows the mouse with a live coordinate readout derived from viewport position, centered on Sarasota (27.3364, -82.5307). Hidden on coarse pointers.
- **Altitude ribbon:** right-edge ticker showing `000` → `400` AGL as the page scrolls. `data-altitude` + `data-altitude-fill` hooks.
- **Scroll reveals:** `IntersectionObserver` fades in section heads, service cards, work tiles, about copy, and the contact form.
- **Hero drone silhouette:** SVG quadcopter drifts across the hero at 40s cadence with blinking navigation lights (red left, shallow-blue right).
- **Hover metadata:** portfolio tiles reveal lat/lon/altitude on hover.

## Copy voice

Editorial, restrained, not marketing-speak. Never "elevate your brand." Lead with HOA littoral-zone work; surround with progress docs, mapping, and editorial aerial.

## Portfolio

`index.html` contains six `.work-card` tiles. Five are named placeholder projects; one is the "Open Capacity" lead-gen tile. To add a real project, copy a card and update:

```html
<article class="work-card" style="--accent: var(--gulf)">
  <div class="work-thumb">
    <!-- replace with <img src="..."> or <video> -->
    <span class="work-tag">Littoral Survey</span>
    <span class="work-meta"><span>27°19'N</span><span>082°29'W</span><span>320 AGL</span></span>
  </div>
  <div class="work-body">
    <h3>Community name, pond ID</h3>
    <p>Short caption · City</p>
  </div>
</article>
```

Placeholder thumbs use inline SVG contour/topographic drawings over the `--accent` color. When real media arrives, replace the `.work-contours` SVG with an `<img>` or `<video autoplay muted loop playsinline>` that fills the `.work-thumb`.

## Form

Netlify Forms, name `aerial-inquiry`. Submissions land via the Netlify dashboard and trigger email notifications. Success state is handled client-side via `?submitted=1` query param (see `main.js`).

**Phase 2 (not built):** SMS alerts. Easiest path is a Netlify Function that runs on form submission and sends a Twilio SMS alongside the native email. Requires:
1. Twilio account + verified sender
2. Netlify env vars `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`, `ALERT_TO`
3. `netlify/functions/form-submission-aerial-inquiry.js` (Netlify auto-invokes functions named `form-submission-<form-name>`)

## Caleb's workflow

1. Caleb requests a content or design change in chat.
2. Edit in place (single `index.html`, single stylesheet, single JS file).
3. Never introduce em dashes in copy. Caleb's style preference. Use commas, colons, or split sentences.
4. After changes, `git commit && git push` triggers Netlify rebuild (~30s).
5. Domain and Netlify site setup are Caleb's call; site is functional locally right now.

## What NOT to do

- Don't add a marketing funnel, testimonials page, or "trusted by" logo strip. Tone is editorial, not SaaS landing.
- Don't pile on drone-tech jargon (DJI model numbers, sensor specs) unless Caleb asks for it. The target buyer is an HOA board member, not a prosumer pilot.
- Don't scaffold a framework (Next.js, Astro, etc.). Static HTML/CSS/JS matches the pitch-site pattern Caleb already operates.
- Don't touch the pitch site at `/Users/calebduplain/Claude April/` unless explicitly asked. These are separate projects.
