// The single "Up Next" card — the coming date and whose turn it is to pick.
//
//   GET /api/nextup  -> { date, pickedBy }
//   PUT /api/nextup  -> replace it
//
// One row, always id 1, so there is nothing to reconcile between visitors.
const { sb, missingCredentials, fail } = require("./_sb");

module.exports = async function handler(req, res) {
  if (missingCredentials(res)) return;

  try {
    if (req.method === "GET") {
      const rows = await sb("next_up?select=data&id=eq.1");
      const data = rows && rows[0] ? rows[0].data || {} : {};
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ nextUp: data });
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const data = {
        date: String(body.date || ""),
        pickedBy: String(body.pickedBy || ""),
      };
      await sb("next_up?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: 1, data }),
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, PUT");
    res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    fail(res, err);
  }
};
