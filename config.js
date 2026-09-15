// Optional: a TMDB API key, used to fetch real movie posters.
//
// Where to get one (free, no billing, takes a couple of minutes):
//   1. Sign up at https://www.themoviedb.org/signup
//   2. Go to Settings -> API (https://www.themoviedb.org/settings/api)
//   3. Request an API key, choose "Developer", and fill in the short form
//   4. Copy the value shown as "API Key (v3 auth)" and paste it below
//
// Leave it empty and the app still works exactly as before -- every movie
// just keeps its generated gradient cover instead of a real poster.
//
// Heads up: this file ships to the browser, so anyone who views the
// deployed site's source (or your public GitHub repo) can read this key.
// A TMDB v3 read key is low-risk and meant to be used from client apps,
// but treat it as public, not secret.

window.TMDB_API_KEY = "";
