# Movie Rituals

Your Monday movie night tracker — logging, ratings, and "Up Next" — as a
plain static site you can host anywhere.

## How data is stored

Everything is kept in your browser's **localStorage**, under the key
`movie-rituals-v1`. There's no database, no accounts, and no network calls:

- Your screenings, ratings, and the "Up Next" card persist across refreshes
  and across browser restarts on **this browser, on this device**.
- Nothing is shared. Opening the site in another browser, on a phone, or by
  a friend shows an empty tracker — each person has their own copy.
- Clearing site data (or using a private window) wipes it.

If the browser blocks storage entirely, the app still runs for the visit and
shows a warning at the top; nothing is saved.

## Run it

Because there are no module imports anymore, you can just double-click
`index.html` and it works. If you'd rather serve it over `http://`:

```bash
npx serve .
```

## Deploy

It's a static site with no build step, so any static host works.

**Vercel CLI**

```bash
npx vercel
```

Accept the defaults — no framework preset, no build command.

**GitHub + Vercel dashboard**

1. Push this folder to a new GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new) and import that repository.
3. Leave the framework preset as "Other" / no build command. Click **Deploy**.

Note that deploying gives everyone the *page*, not the *data* — each visitor
still builds up their own local list.

## What's in this folder

- `index.html` — page structure
- `style.css` — all styling
- `app.js` — app logic + localStorage persistence
- `images/cover-banner.jpg`, `images/avatar-eirini.jpg` — the cover photo
  and avatar
