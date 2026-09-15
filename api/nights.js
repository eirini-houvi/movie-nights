// The shared screening log.
//
//   GET    /api/nights          -> every screening
//   POST   /api/nights          -> create or replace one (body is the night)
//   DELETE /api/nights?id=<id>  -> remove one
//
// Each screening is stored whole, as JSON, in a `data` column. The app has
// grown new fields repeatedly (posters, genres, director, imdb ids) and this
// way the database never needs a migration to keep up.
const { sb, missingCredentials, fail } = require("./_sb");

module.exports = async function handler(req, res) {
  if (missingCredentials(res)) return;

  try {
    if (req.method === "GET") {
      const rows = await sb("nights?select=id,data&order=created_at.asc");
      const nights = (rows || []).map(function (r) {
        return Object.assign({}, r.data, { id: r.id });
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ nights });
      return;
    }

    if (req.method === "POST") {
      const night = req.body && typeof req.body === "object" ? req.body : null;
      if (!night || !night.id) {
        res.status(400).json({ error: "missing id" });
        return;
      }
      const { id } = night;
      await sb("nights?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id, data: night }),
      });
      res.status(200).json({ ok: true, id });
      return;
    }

    if (req.method === "DELETE") {
      const id = String((req.query && req.query.id) || "").trim();
      if (!id) {
        res.status(400).json({ error: "missing id" });
        return;
      }
      await sb("nights?id=eq." + encodeURIComponent(id), {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      res.status(200).json({ ok: true, id });
      return;
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    fail(res, err);
  }
};
