# Duplain Aerials

Static site for the aerial arm of Duplain Media. Southwest Florida, HOA-first.

## Preview locally

Any static server will do. From this folder:

```bash
python3 -m http.server 4000
```

Then open `http://localhost:4000`.

## Deploy (first time)

1. Push this folder to a new GitHub repo.
2. In Netlify, **Add new site → Import from Git**, pick the repo.
3. Build command: *(leave blank)*. Publish directory: `.`
4. In **Site settings → Forms → Notifications**, add an email notification pointing to `info@duplainmedia.com` for the form named `aerial-inquiry`.
5. Attach your domain under **Domain management**.

## Deploy (every change after)

```bash
git add .
git commit -m "update copy"
git push
```

Netlify rebuilds in about 30 seconds.

## Adding a real project to the Work grid

Open `index.html`, find the `.work-grid` block, and replace one of the placeholder `.work-card` articles. Drop an `<img>` or `<video>` into the `.work-thumb` in place of the inline SVG contours.

## SMS alerts on form submissions

Not built in v1. See `CLAUDE.md` → "Phase 2" for the Netlify Function + Twilio outline when ready.
