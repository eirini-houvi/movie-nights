// Shared Supabase access for the API routes. Files under /api whose name
// starts with an underscore are not exposed as routes.
//
// Everything here runs server-side with the service role key, so that key
// never reaches the browser and there are no row-level-security policies to
// get right: the functions themselves are the only way in, and they allow
// exactly the operations the tracker needs.

// The Vercel<->Supabase integration has used a few different names for these
// over the years, so accept any of them rather than insisting on one.
const URL_KEYS = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PROJECT_URL",
];
const KEY_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

function pick(names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

function credentials() {
  return { url: pick(URL_KEYS).replace(/\/+$/, ""), key: pick(KEY_KEYS) };
}

// A clear, actionable message beats a generic 500 when the environment
// variables simply aren't set yet.
function missingCredentials(res) {
  const { url, key } = credentials();
  if (url && key) return false;
  res.status(503).json({
    error: "supabase_not_configured",
    detail:
      "Set " + (url ? "" : URL_KEYS[0] + " ") + (key ? "" : KEY_KEYS[0]) +
      " in the Vercel project's Environment Variables, then redeploy.",
    sawUrl: Boolean(url),
    sawKey: Boolean(key),
  });
  return true;
}

async function sb(path, options = {}) {
  const { url, key } = credentials();
  const res = await fetch(url + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (e) { body = text; }
  }
  if (!res.ok) {
    const err = new Error("supabase " + res.status);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function fail(res, err) {
  // A missing table is the one failure worth naming precisely, since it's
  // the step that has to be done by hand in the Supabase dashboard.
  const detail = err && err.body && err.body.message ? err.body.message : String(err);
  const missingTable = /relation .* does not exist|Could not find the table/i.test(detail);
  res.status(missingTable ? 503 : 502).json({
    error: missingTable ? "table_missing" : "supabase_error",
    detail,
  });
}

module.exports = { sb, missingCredentials, fail };
