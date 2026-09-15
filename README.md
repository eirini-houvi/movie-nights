# Movie Nights

Your Monday movie night tracker — the log, the posters, and "Up Next" —
as a plain static site you can host anywhere.

## How data is stored

The screening log lives in **Supabase**, reached through this site's own
`/api` routes, so everyone who opens the URL sees the same list and anything
one person adds shows up for the rest.

Each browser also keeps a mirror in `localStorage`. That makes the page paint
instantly on load instead of waiting on the network, and it keeps the tracker
usable when the API isn't reachable at all — opened as a plain file, or served
by something with no functions. In that case it quietly behaves like the
old browser-only tracker, and the banner at the top says when the shared copy
can't be reached.

### Setting up Supabase

1. In Vercel, add the Supabase integration to the project (Settings →
   Integrations). It sets `SUPABASE_URL` and the keys as environment
   variables. The API routes prefer `SUPABASE_SERVICE_ROLE_KEY`; if your
   integration didn't add one, add it by hand from Supabase → Settings → API.
2. In Supabase, open **SQL Editor → New query**, paste the contents of
   [`supabase.sql`](supabase.sql), and run it. That creates the two tables and
   locks them down.
3. Redeploy on Vercel so the functions pick up the variables.

The first time the site loads against an empty shared log, it uploads
whatever that browser already had, so nothing logged before the move is lost.
That only happens while the shared log is empty, so a second browser with its
own old copy can't pile duplicates on top.

### Who can change it

There is no sign-in: anyone with the URL can add and edit, which is how the
tracker has always worked and suits a link shared in a group chat. The
database itself is not open to the world, though — row-level security is on
with no policies, so the only way in is through this site's API routes, and
those do exactly what the tracker needs and nothing else.

## Movie posters and details

Every logged title is looked up automatically. Nothing to configure:

- **Poster and release year** — IMDb's public suggestion endpoint, the one
  behind IMDb's own search box. No key, no signup. IMDb sends no
  `Access-Control-Allow-Origin` header, so a browser won't read it directly;
  `api/poster.js` fetches it server-side and hands the same JSON back from
  this site's own origin. That function is deployed automatically by Vercel
  and needs no configuration — but it does mean posters only appear when the
  site is served by something that runs functions. Opened as a plain file, or
  served by a bare static server, everything else still works and the films
  keep their gradient covers.
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
