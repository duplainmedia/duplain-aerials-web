# 404 Page Mini-Game — Handoff

Caleb wants a small 2D browser game embedded on the 404 page of the Duplain Aerials site. Something that turns a wrong URL into a tiny moment of delight, kept on-brand. This doc is everything a new chat needs to start cold.

---

## 1. The site this lives on

**Repo:** `/Users/calebduplain/duplain-aerial/`
**Stack:** Plain static HTML, CSS, and JS. No bundler, no framework, no build step.
**Hosted on:** Netlify. Pushing to `main` on the `duplainmedia/duplain-aerials-web` GitHub repo auto-deploys in ~30 seconds.
**Cache:** `netlify.toml` already sets `Cache-Control: public, max-age=0, must-revalidate` on HTML/CSS/JS, so updates appear on next page load with no special handling.

The brand is **Duplain Aerials**: a Sarasota-based drone-imaging studio focused on HOA pond and littoral-zone surveys, plus commercial aerial photography. Everything on the site reads as aerial, surveyor-precise, editorial, and slightly handcrafted (line-art illustrations, mono captions, paper-toned backgrounds).

---

## 2. Where the game lives

**File:** `/Users/calebduplain/duplain-aerial/404.html`

Currently this file is a styled error page with a topbar, a "notfound" hero section with topographic contour SVG, and a message inviting the visitor to head home. The game should replace (or live alongside) the existing notfound hero content, contained inside the `<main class="notfound">` element.

**JS:** Either inline a `<script>` block at the bottom of 404.html, or create a new module at `/assets/js/notfound-game.js` and load it. Inline is fine for something this self-contained.

**CSS:** Add game-specific styles in `/assets/css/style.css` under a clearly labeled section like `/* ---------------- 404 game ---------------- */`. The page already loads this stylesheet.

**Canvas vs DOM:** A `<canvas>` element is the right call for any animation-heavy game. Keep it responsive (sized via CSS, drawing scaled to devicePixelRatio for crisp lines on Retina).

**Fallback:** If JS is disabled, the original "off the map" 404 message should still be readable. Wrap the game in a container that JS reveals; leave the static text behind it.

---

## 3. Brand vocabulary

### Color tokens (already defined in `style.css` `:root`)

```
--paper:      #F7F6F1   light cream, primary background
--paper-warm: #EFEDE4   slightly warmer cream
--ink:        #0B1416   near-black, primary text and dark accents
--ink-soft:   #1B2528   slightly lighter dark, secondary
--gulf:       #1D6A7A   medium teal, primary accent
--gulf-deep:  #134350   deep teal, hover states
--shallow:    #7CC4C9   light teal, highlight color
--estuary:    #2E4F3F   dark green, vegetation
--sawgrass:   #8FA37F   medium green
--sand:       #E8DFCF   warm beige
--sand-deep:  #C9B99A   darker beige
--rule:       rgba(11, 20, 22, 0.18)   subtle border lines
--muted:      rgba(11, 20, 22, 0.6)    muted text
```

Use these as `var(--name)` everywhere. Don't introduce raw hex colors.

### Typography (already loaded via Google Fonts)

```
--serif: "Instrument Serif"     for big headlines, italics for emphasis
--sans:  "Inter"                 for body text
--mono:  "JetBrains Mono"        for labels, captions, UI strings
```

UI labels on this site are almost always mono, uppercase, with letter-spacing around 0.18em to 0.22em. Big visual moments are Instrument Serif (often with `<em>` italics inside the headline for accent).

### Visual motifs the game should pull from

- **Topographic contour lines.** Wavy SVG curves that drift across backgrounds. The 404 page already has them in `.notfound-contours`. Game terrain could use the same style.
- **Pond contours.** Concentric ellipses representing retention ponds viewed from above. Used on the home page hero and the pond-imaging product page.
- **Drone silhouettes.** A 3D-style drone is in `index.html` inside `.hero-drone`. You can copy its SVG structure for the player's drone in the game.
- **Survey crosshairs and altitude readouts.** The home page has an altitude tracker that says "AGL · 400 FT". Mono-font HUD elements like score, battery, altitude fit naturally.
- **Aerial / overhead perspective.** Everything on the site is bird's-eye. A top-down game view is on-brand. A side-scrolling 2D view also works if it shows the drone flying over a stylized landscape silhouette.
- **Wave dividers.** Curvy horizontal SVG paths between sections. Could appear as ground or horizon lines in the game.
- **Hand-drawn line-art icons.** Single-color strokes, low stroke-width, no fills. See the symbol library in `index.html` defs block (i-propeller, i-compass, i-waterline, i-polygon, i-pin).

### Tone for any in-game text

- Plain English, complete sentences.
- No em or en dashes. Use commas, colons, or split sentences.
- Slightly warm and contractor-friendly rather than editorial.
- Surveyor mono captions are appropriate for HUD labels: `ALT 0400 AGL`, `SCORE 0042`, `BATTERY 87%`.

---

## 4. Constraints

Caleb will hand you the game concept. He is the creative lead on what the game actually is. Whatever direction it goes, keep these constraints in mind:

- **Playable in under 60 seconds** per attempt. This is a 404 page, not a destination.
- **Works on touch and keyboard.** Test on mobile (375px wide) and desktop.
- **Looks like part of the site,** not a third-party widget. Same fonts, same colors, same line-art aesthetic.
- **Stays light.** No external game engines or heavy dependencies. Vanilla JS plus canvas is plenty.

---

## 5. Wiring it into the 404 page

A clean integration pattern:

1. In `404.html`, inside `<main class="notfound">`, add a container for the game:

   ```html
   <div class="notfound-game" data-notfound-game>
     <canvas class="notfound-game-canvas" data-game-canvas></canvas>
     <div class="notfound-game-hud">
       <span class="notfound-game-kicker">Off the map</span>
       <h1 class="notfound-game-title">While you're here.</h1>
       <p class="notfound-game-lede">Brief instructions for the game.</p>
       <button class="notfound-game-start" type="button">Start</button>
     </div>
     <div class="notfound-game-fallback">
       <a href="/">Head back to the home page.</a>
     </div>
   </div>
   ```

2. Add styles in `/assets/css/style.css`:
   - Container: position relative, max-width matching the rest of the site (`var(--max)` is 1440px, with `var(--gutter)` for left/right padding).
   - Canvas: full width of container, fixed aspect ratio (16:10 or 4:3), background `var(--paper-warm)`.
   - HUD: floats over the canvas with mono labels.

3. JS in `/assets/js/notfound-game.js` (loaded as a module from `404.html`):
   - Initialize on `DOMContentLoaded`.
   - Wait for the user to click Start before kicking off the game loop, so the page doesn't blast CPU on every 404 hit.
   - Use `requestAnimationFrame` for the loop.
   - Scale canvas drawing buffer by `devicePixelRatio` for sharpness.
   - Cleanup interval/RAF on `visibilitychange` so it doesn't run when the tab is hidden.

4. Update the `topbar` nav in `404.html` to include the phone link that the home page now has, since the existing 404 page is missing it. Copy the `.nav-phone` block from `index.html`'s topbar.

---

## 6. Existing patterns to copy from

If you need a working reference:

- **Topbar (with phone link):** `/Users/calebduplain/duplain-aerial/index.html` lines 222 to 238.
- **Drone SVG (3D-style, all the moving parts):** `/Users/calebduplain/duplain-aerial/index.html` lines 259 to 327. Classes `drone-arms`, `drone-prop`, `drone-motors`, `drone-body`, `nav-light`. All animations live in `style.css`.
- **Pond contour pattern:** `/Users/calebduplain/duplain-aerial/hoa-pond-imaging/index.html` inside `.product-hero-contours` SVG, around line 197.
- **Topographic contour pattern:** `/Users/calebduplain/duplain-aerial/index.html` inside `.hero-contours` SVG, around line 244.
- **Existing 404 page:** `/Users/calebduplain/duplain-aerial/404.html`.
- **Cursor reticle / mono HUD label styling:** Look at `.altitude` in `style.css` for the AGL readout pattern. Mono caps with letter-spacing.
- **Three.js viewer (for reference, not for the game):** `/Users/calebduplain/duplain-aerial/assets/js/chapel-viewer.js`. Don't pull Three.js into the 404 game; 2D canvas is correct here.

---

## 7. Preview locally

A `.claude/launch.json` config already exists. Either:

- Use the Claude Preview MCP with name `aerial`. It serves `/Users/calebduplain/duplain-aerial/` on port 5175.
- Or from the repo root: `python3 -m http.server 4000`, then visit `http://localhost:4000/this-page-does-not-exist` to land on the 404 page.

---

## 8. Shipping when done

Auto mode users can:

```
cd /Users/calebduplain/duplain-aerial
git add 404.html assets/js/notfound-game.js assets/css/style.css
git commit -m "Add 404-page mini-game"
git push origin main
```

Netlify will deploy in about 30 seconds. Test the live page at `https://<custom-domain>/this-page-does-not-exist`.

Custom domain is configured in Netlify. The 404 page is automatically served for any unknown URL.

---

## 9. House style notes that have come up before

- **No em or en dashes** in any user-facing text. Caleb is firm on this.
- **Complete sentences in body copy**, not telegraph-style fragments. UI labels in mono caps are the exception.
- **Don't introduce new fonts.** The three already loaded (Instrument Serif, Inter, JetBrains Mono) cover everything.
- **Don't add third-party trackers.** No Google Analytics, no Hotjar, nothing. The site is intentionally clean.
- **Test on mobile.** A lot of visitors are on phones. Touch controls matter.

That's the full handoff. Build the game, ship it, and the 404 page becomes a tiny piece of personality instead of a dead end.
