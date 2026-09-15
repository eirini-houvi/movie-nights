# Movie Rituals

Your Monday movie night tracker — logging, ratings, and "Up Next" — as a
standalone site you host yourself and share with the group.

This folder is a plain static site (`index.html` + `style.css` + `app.js` +
images). It uses **Firebase Firestore** as the shared database, so everyone
who opens the site sees the same list of screenings in real time — the
same idea as before, just running on your own free Firebase project
instead of inside Claude.

## 1. Create a free Firebase project (~5 minutes)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and sign in with any Google account.
2. Click **Add project**, give it a name (e.g. "movie-rituals"), and finish
   the wizard (you can skip Google Analytics).
3. In the left sidebar, go to **Build → Firestore Database → Create
   database**. Pick a location close to you and start in **test mode**
   (this makes the database open to anyone with the link, which is what
   replicates the "whole friend group can add/edit" behavior you had
   before — see the security note below).
4. Click the gear icon next to **Project Overview → Project settings**.
   Under **Your apps**, click the **Web** icon (`</>`) to register a new
   web app. Give it any nickname and click **Register app**. Firebase will
   show you a code snippet containing a `firebaseConfig` object that looks
   like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "movie-rituals-xxxxx.firebaseapp.com",
     projectId: "movie-rituals-xxxxx",
     storageBucket: "movie-rituals-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456"
   };
   ```

5. Open `firebase-config.js` in this folder and paste those real values in,
   replacing the `YOUR_...` placeholders. Save the file.

That's it for Firebase — no billing info is required for this level of
usage.

### Security note

Test mode leaves the database readable and writable by anyone who has the
URL, with no login required — this matches how the tracker worked before
(no sign-in, anyone in the group can add a screening or a rating). Test
mode rules expire after 30 days by default. Before that happens, go to
**Firestore Database → Rules** and replace the expiry-based rule with
something like:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

This keeps it open the way it was, indefinitely, without the 30-day
cutoff. If you'd rather add real access control (e.g. only signed-in
friends can write), that's a bigger change — happy to help with that
later if you want it.

## 2. Try it locally (optional)

Any static file server works, for example:

```bash
npx serve .
```

then open the URL it prints. Opening `index.html` directly by
double-clicking it will NOT work correctly (the browser blocks ES module
imports over `file://`) — always serve it over `http://`.

## 3. Deploy to Vercel

**Option A — Vercel CLI**

```bash
npm install -g vercel
cd path/to/this/folder
vercel
```

Follow the prompts (link or create a project, accept the defaults — no
build step is needed, it's already static). Vercel gives you a live URL
when it finishes.

**Option B — GitHub + Vercel dashboard**

1. Push this folder to a new GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new), import that repository.
3. Leave the framework preset as "Other" / no build command — it's a
   static site. Click **Deploy**.

Either way, once deployed, share the Vercel URL with your friend group —
that's the new shared link, replacing the old Claude artifact link.

## Starting fresh

This new Firestore database starts **empty**. The two screenings you'd
already logged (Poetic Justice, Forbidden Fruits) live in the old Claude
artifact's database and don't carry over automatically — just re-add them
once through the "+ Log a Screening" button after you deploy.

## What's in this folder

- `index.html` — page structure
- `style.css` — all styling
- `app.js` — app logic + Firebase wiring (ES module, loaded via `<script
  type="module">`)
- `firebase-config.js` — where your Firebase project's keys go (see step 1)
- `images/cover-banner.jpg`, `images/avatar-eirini.jpg` — the cover photo
  and your avatar

If `firebase-config.js` is left with its placeholder values, the app still
runs, but only locally in your own browser tab — nothing is shared and
nothing is saved after a refresh. A banner at the top says so.
