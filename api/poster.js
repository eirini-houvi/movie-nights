// IMDb's suggestion endpoint — the one behind IMDb's own search box — is
// public and needs no key, but it sends no Access-Control-Allow-Origin
// header, so a browser refuses to read it. Fetching it here, server-side,
// sidesteps that: CORS is a browser rule, not a network one, and the page
// then talks to its own origin instead.
//
// Deployed automatically by Vercel as /api/poster?q=<title>.
// Written as CommonJS deliberately: a plain .js file under /api is treated
// as CommonJS unless the project declares "type": "module", and this project
// has no package.json at all.

module.exports = async function handler(req, res) {
  const q = String((req.query && req.query.q) || "").trim().toLowerCase();
  if (!q) {
    res.status(400).json({ error: "missing q" });
    return;
  }

  try {
    const upstream = await fetch(
      "https://v2.sg.media-imdb.com/suggestion/p/" + encodeURIComponent(q) + ".json",
      { headers: { Accept: "application/json" } }
    );
    if (!upstream.ok) {
      res.status(502).json({ error: "imdb " + upstream.status });
      return;
    }
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: "lookup failed" });
  }
};
