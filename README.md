# Movie Nights

Your Monday movie night tracker — the log, the posters, and "Up Next" —
as a plain static site you can host anywhere.

## How data is stored

Everything is kept in your browser's **localStorage**, under the key
`movie-rituals-v1`. There's no database and no accounts:

- Your screenings and the "Up Next" card persist across refreshes
  and across browser restarts on **this browser, on this device**.
- Nothing is shared. Opening the site in another browser, on a phone, or by
  a friend shows an empty tracker — each person has their own copy.
- Clearing site data (or using a private window) wipes it.
- The only network calls are the movie lookups described below.

If the browser blocks storage entirely, the app still runs for the visit and
shows a warning at the top; nothing is saved.

## Movie posters and details

Every logged title is looked up automatically. Nothing to configure:

- **Poster and release year** — IMDb's public suggestion endpoint, the one
  behind IMDb's own search box. No key, no signup.
- **Genres and director** — Wikidata, which indexes films by their IMDb id,
  so the id from the first lookup is enough to ask for the rest. Also
  keyless.
- **Trailer** — the button is always there. It opens an exact link when
  there is one (pasted in by hand, or fetched from TMDB if you've set a
  key) and otherwise a YouTube search for the film, which lands on the
  trailer in practice.

Every lookup is best-effort and remembers its own outcome, so one source
can succeed while another finds nothing. A title nothing recognises is
marked "no match" and not asked about again; a failed request (offline,
rate limit) is retried next time you load the page. Rename a movie and it
is looked up again from scratch.

### Optional: a TMDB key

`config.js` takes a free [TMDB](https://www.themoviedb.org/settings/api)
key. It is genuinely optional now — its only remaining job is turning the
trailer button into a direct link instead of a YouTube search. Leave it
empty and everything else works exactly the same.

Note that `config.js` ships to the browser, so a key there is readable by
anyone viewing the deployed site or the repo. A TMDB v3 read key is meant
for client-side use and can't spend money or change your account, but
treat it as public rather than secret.

## Using it

- **Log a screening** — date, movie, who picked it, who came, optional
  trailer link and notes. Titles are normalized to title case, so "poetic
  justice" is stored as "Poetic Justice".
- **Edit anything later** — the three-dot button on any card opens a dialog
  for the title, date, who picked it, the guest list, trailer and notes.
- **Up Next** — who picks and whose house, for the coming Monday.
- **Month stats** — the Stats button on any month row breaks that month
  down by genre, decade, who picked and who kept showing up. Whoever picked
  a film counts as present that night, since nobody types their own name
  into the guest list.
- **Recap** — the whole wall of posters, newest first. Click one for the
  full details: guests, notes and the trailer.

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
- `app.js` — app logic, localStorage persistence, TMDB lookups
- `config.js` — where your optional TMDB key goes
- `images/cover-banner.jpg`, `images/avatar-eirini.jpg` — the cover photo
  and avatar
