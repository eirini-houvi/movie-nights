# Movie Nights

Your Monday movie night tracker — logging, ratings, and "Up Next" — as a
plain static site you can host anywhere.

## How data is stored

Everything is kept in your browser's **localStorage**, under the key
`movie-rituals-v1`. There's no database and no accounts:

- Your screenings, ratings, and the "Up Next" card persist across refreshes
  and across browser restarts on **this browser, on this device**.
- Nothing is shared. Opening the site in another browser, on a phone, or by
  a friend shows an empty tracker — each person has their own copy.
- Clearing site data (or using a private window) wipes it.
- The only network calls are the optional TMDB lookups below.

If the browser blocks storage entirely, the app still runs for the visit and
shows a warning at the top; nothing is saved.

## Movie posters, genres and trailers (optional)

Each logged movie is looked up on [TMDB](https://www.themoviedb.org), which
fills in its poster, release year, genres, director and trailer link. This
needs a free API key:

1. Sign up at [themoviedb.org/signup](https://www.themoviedb.org/signup)
2. Go to [Settings -> API](https://www.themoviedb.org/settings/api), request
   a key, choose **Developer**, and fill in the short form
3. Copy the value labelled **API Key (v3 auth)** into `config.js`

Leave `config.js` empty and everything still works — each movie just keeps
its generated gradient cover and whatever you typed in by hand.

The lookup is best-effort. A title TMDB doesn't recognise is remembered as
"no match" and not asked about again; a failed request (offline, bad key,
rate limit) is retried next time you load the page. Rename a movie and it's
looked up again from scratch.

**On the key being public:** `config.js` ships to the browser, so anyone
viewing the deployed site's source or the GitHub repo can read it. A TMDB
v3 read key is designed to be used from client-side apps and can't spend
money or change your account, but treat it as public rather than secret.

## Using it

- **Log a screening** — date, movie, who picked it, who came, optional
  trailer link and notes. Titles are normalized to title case, so "poetic
  justice" is stored as "Poetic Justice".
- **Edit anything later** — the three-dot button on any card opens a dialog
  for the title, date, who picked it, the guest list, trailer and notes.
- **Rate it** — open a screening and add a name and a score out of 10.
- **Up Next** — who picks and whose house, for the coming Monday.
- **Recap** — the poster wall, as a diary or ranked by rating.

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
