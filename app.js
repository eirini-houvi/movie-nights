(function(){
  "use strict";

  var state = {
    view: "log",
    selectedId: null,
    pendingDelete: null,
    nights: [],
    storageError: "",
    formError: "",
    draft: null,
    nextUpDraft: { date:"", pickedBy:"" },
    showAddForm: false,
    modalView: null,   // null | "edit" | "stats"
    editId: null,      // night being edited in the modal
    editDraft: null,   // its in-progress values
    editError: "",
    statsKey: null,    // which month row the stats dialog is for
    detailsId: null    // which screening the details dialog is for
  };

  var app = document.getElementById("app");
  var syncNote = document.getElementById("syncNote");

  // ---------- helpers ----------
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

  function hashStr(str){
    var h = 0;
    for (var i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }

  var COVER_PAIRS = [
    ["#FF7A29","#7A1F0E"],
    ["#E85D9C","#3B0E2E"],
    ["#3FB6E8","#0E2A45"],
    ["#4CD170","#0E3D24"],
    ["#FFC93E","#7A4A0E"],
    ["#9B6BFF","#2A1250"],
    ["#FF5C5C","#3B0E12"],
    ["#2EDACB","#0E3A38"]
  ];

  function coverGradient(title){
    var h = hashStr(title || "untitled");
    var pair = COVER_PAIRS[h % COVER_PAIRS.length];
    var angle = 120 + (h % 60);
    return "linear-gradient(" + angle + "deg, " + pair[0] + " 0%, " + pair[1] + " 100%)";
  }

  // The gradient always stays underneath the poster, so a slow, missing or
  // broken image degrades to the old look instead of a blank rectangle.
  function artBg(n){
    var grad = coverGradient(n && n.movie);
    if (n && isSafeUrl(n.posterUrl)){
      return "background-image:url(&quot;" + esc(n.posterUrl) + "&quot;), " + grad +
             ";background-size:cover;background-position:center;";
    }
    return "background:" + grad + ";";
  }

  // "poetic justice" -> "Poetic Justice". Short words stay lowercase unless
  // they open the title or follow a colon; a word that already carries its
  // own capitals ("McKenna", "WALL-E", "iRobot") is left exactly as typed.
  var SMALL_WORDS = {
    a:1, an:1, and:1, as:1, at:1, but:1, by:1, en:1, for:1, from:1, if:1,
    in:1, into:1, nor:1, of:1, on:1, onto:1, or:1, over:1, per:1, the:1,
    to:1, v:1, vs:1, via:1, with:1
  };

  function titleCase(str){
    var input = String(str == null ? "" : str).trim().replace(/\s+/g, " ");
    if (!input) return "";
    // SHOUTED TITLES get normalized; anything with a lowercase letter in it
    // is assumed to be deliberate and only has its word-starts adjusted.
    if (!/[a-z]/.test(input)) input = input.toLowerCase();

    var words = input.split(" ");
    var openNext = true; // next word starts the title or a subtitle
    return words.map(function(w, i){
      var isLast = i === words.length - 1;
      var bare = w.replace(/[^A-Za-z']/g, "").toLowerCase();
      var forceCap = openNext || isLast;
      openNext = /[:;\u2013\u2014?!.]$/.test(w);
      if (/[A-Z]/.test(w)) return w;            // already styled, leave alone
      if (!forceCap && SMALL_WORDS[bare]) return w.toLowerCase();
      // Capitalize the first letter, and the letter after a hyphen or slash
      // so "spider-man" and "face/off" come out right.
      return w.replace(/(^|[-\u2013/])([a-z])/g, function(m, sep, ch){
        return sep + ch.toUpperCase();
      });
    }).join(" ");
  }

  function fmtDate(iso){
    if (!iso) return "";
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric", year:"numeric" });
  }

  function nextMonday(){
    var d = new Date();
    var day = d.getDay();
    var add = (8 - day) % 7;
    if (add === 0) add = day === 1 ? 0 : 7;
    d.setDate(d.getDate() + add);
    return d.toISOString().slice(0,10);
  }

  // ---------- month grouping (for the "September Movies" style rows) ----------
  function monthRowLabel(dateStr){
    var d = new Date((dateStr||"") + "T12:00:00");
    if (isNaN(d.getTime())) return "Undated";
    var month = d.toLocaleDateString(undefined, { month:"long" });
    var year = d.getFullYear();
    var now = new Date();
    return (year === now.getFullYear()) ? (month + " Movies") : (month + " " + year + " Movies");
  }
  function groupByMonth(listDescending){
    var order = [];
    var map = {};
    listDescending.forEach(function(n){
      var d = new Date((n.date||"") + "T12:00:00");
      var key = isNaN(d.getTime()) ? "undated" : (d.getFullYear() + "-" + ("0"+(d.getMonth()+1)).slice(-2));
      if (!map[key]){ map[key] = { key:key, label: monthRowLabel(n.date), items: [] }; order.push(key); }
      map[key].items.push(n);
    });
    order.sort(function(a,b){ return b.localeCompare(a); });
    return order.map(function(k){ return map[k]; });
  }

  // ---------- avatars ----------
  var AVATAR_COLORS = ["#FF7A29","#4CD170","#5B8DEF","#EF4565","#B26BFF","#22B8CF","#F2B705","#E85D9C"];
  function avatarColor(name){
    return AVATAR_COLORS[hashStr(String(name||"").trim().toLowerCase()) % AVATAR_COLORS.length];
  }
  function initials(name){
    var parts = String(name||"").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  }
  // Real photo avatars for people we already have a picture of. Everyone
  // else gets a generated colour + initials avatar until they add their own.
  var AVATAR_PHOTOS = {
    "eirini":  "images/avatar-eirini.png?v=3",
    "elianna": "images/avatar-elianna.png?v=3",
    "guney":   "images/avatar-guney.png?v=3",
    "neoklis": "images/avatar-neoklis.png?v=3",
    "maria":   "images/avatar-maria.png?v=3",
    "maria a.": "images/avatar-maria.png?v=3"
  };
  function avatarHtml(name, size){
    size = size || 26;
    var key = String(name||"").trim().toLowerCase();
    var style = "width:" + size + "px;height:" + size + "px;font-size:" + Math.round(size*0.4) + "px;";
    if (!key){
      return '<span class="avatar avatar-empty" style="' + style + '"></span>';
    }
    if (AVATAR_PHOTOS[key]){
      // The colour sits behind the photo, so a file that hasn't been added
      // yet degrades to that person's plain colour instead of a blank hole.
      return '<span class="avatar" style="' + style + 'background-color:' + avatarColor(key) +
             ';background-image:url(\'' + AVATAR_PHOTOS[key] + '\')" title="' + esc(name) + '"></span>';
    }
    return '<span class="avatar" style="' + style + 'background:' + avatarColor(key) + '" title="' + esc(name) + '">' + esc(initials(name)) + '</span>';
  }

  function isSafeUrl(u){
    return typeof u === "string" && /^https?:\/\//i.test(u.trim());
  }

  function freshDraft(){
    return { date: nextMonday(), movie:"", pickedBy:"", attendees:"", trailerUrl:"", notes:"" };
  }
  state.draft = freshDraft();

  // ---------- storage (localStorage) ----------
  // Everything lives in this browser only: one JSON blob under STORAGE_KEY,
  // rewritten after every change. No accounts, no network, nothing shared —
  // clearing site data or opening the site in another browser starts empty.
  var STORAGE_KEY = "movie-rituals-v1";

  function persist(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        nights: state.nights,
        nextUp: { date: state.nextUpDraft.date, pickedBy: state.nextUpDraft.pickedBy }
      }));
      state.storageError = "";
    } catch (e){
      // Private-mode quotas, disabled site data, a full store — the app keeps
      // working for this visit, it just can't remember anything.
      state.storageError = "Couldn't save to this browser — changes will be lost when you close the tab.";
    }
  }

  function loadLocal(){
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e){
      state.storageError = "This browser is blocking local storage — nothing will be saved.";
      return;
    }
    if (!raw) return;
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e){
      state.storageError = "Saved data looked corrupted and was ignored.";
      return;
    }
    var changed = false;
    if (data && Array.isArray(data.nights)){
      state.nights = data.nights.filter(function(n){ return n && n.id; });
      // Titles logged before title-casing existed get normalized once, so
      // the wall doesn't end up half "Poetic Justice" and half "poetic justice".
      state.nights.forEach(function(n){
        var cased = titleCase(n.movie);
        if (cased !== n.movie){ n.movie = cased; changed = true; }
      });
    }
    if (data && data.nextUp){
      // The second field used to be whose place it was at; anything saved
      // under that key is simply dropped.
      state.nextUpDraft.pickedBy = data.nextUp.pickedBy || "";
      state.nextUpDraft.date = data.nextUp.date || "";
    }
    // Written only after every field is back in state — persisting mid-load
    // would save the half-restored version over the real one.
    if (changed) persist();
  }

  function renderSyncNote(){
    if (state.storageError){
      syncNote.className = "sync-note warn";
      syncNote.textContent = state.storageError;
    } else {
      syncNote.className = "sync-note";
      syncNote.textContent = "";
    }
  }

  function addNight(data){
    data.id = uid();
    state.nights.push(data);
    persist();
    render();
    fetchMeta(data);
  }
  function updateNight(id, patch){
    var n = state.nights.find(function(x){ return x.id === id; });
    if (!n) return;
    var retitled = patch && patch.movie && patch.movie !== n.movie;
    Object.assign(n, patch);
    if (retitled){
      n.posterUrl = "";
      n.year = "";
      n.genres = [];
      n.director = "";
      n.imdbId = "";
      n.tmdbId = null;
      n.metaState = "";
      n.factsState = "";
      n.extraState = "";
    }
    persist();
    render();
    if (retitled) fetchMeta(n);
  }
  function deleteNight(id){
    state.nights = state.nights.filter(function(x){ return x.id !== id; });
    persist();
    render();
  }
  function saveNextUp(field, value){
    state.nextUpDraft[field] = value;
    persist();
  }

  // ---------- movie metadata ----------
  // Two sources, both best-effort:
  //
  //   IMDb  — the public suggestion endpoint behind IMDb's own search box.
  //           No key, no signup, CORS-open. Gives the poster and the
  //           release year, which is all the cards need. This runs for
  //           everyone, always.
  //   TMDB  — only if a key is set in config.js. Adds the genres, the
  //           director and a trailer link, which IMDb doesn't hand out.
  //
  // Each source records its own outcome so one can succeed while the other
  // never runs:
  //   ""        never looked up
  //   "found"   details were merged in
  //   "missing" the source had no match — don't ask again for this title
  // A failed *request* (offline, rate limit, bad key) leaves the state
  // unset, so it's retried on the next page load.
  // Same-origin, because IMDb itself sends no Access-Control-Allow-Origin
  // header and a browser therefore refuses to read it directly. api/poster.js
  // fetches it server-side and hands the same JSON back from our own origin.
  var IMDB_SUGGEST = "/api/poster?q=";
  var TMDB_API = "https://api.themoviedb.org/3";
  var TMDB_IMAGE = "https://image.tmdb.org/t/p/w500";
  var metaPending = {};  // night id -> true, so one lookup runs at a time
  var extraPending = {};

  function tmdbKey(){
    var k = typeof window !== "undefined" && window.TMDB_API_KEY;
    return typeof k === "string" && k.trim() ? k.trim() : "";
  }

  // IMDb serves its artwork off Amazon with the size baked into the
  // filename, so asking for a 400px-wide copy avoids pulling a 1280px
  // original into a 168px card.
  function imdbPoster(url){
    if (typeof url !== "string" || !/^https:\/\/m\.media-amazon\.com\/images\//.test(url)) return "";
    return url.replace(/\._V1_.*$/, "._V1_QL75_UX400_.jpg");
  }

  function posterUrlFrom(path){
    // TMDB gives paths like "/wX8Ry.jpg". Anything else is refused rather
    // than interpolated into a style attribute.
    if (typeof path !== "string" || !/^\/[A-Za-z0-9._-]+$/.test(path)) return "";
    return TMDB_IMAGE + path;
  }

  function trailerFrom(videos){
    var list = (videos && videos.results) || [];
    var best = null;
    for (var i = 0; i < list.length; i++){
      var v = list[i];
      if (v.site !== "YouTube" || !/^[A-Za-z0-9_-]{5,20}$/.test(v.key || "")) continue;
      if (v.type === "Trailer"){ best = v; break; }
      if (!best && v.type === "Teaser") best = v;
    }
    return best ? "https://www.youtube.com/watch?v=" + best.key : "";
  }

  function directorFrom(credits){
    var crew = (credits && credits.crew) || [];
    for (var i = 0; i < crew.length; i++){
      if (crew[i].job === "Director" && crew[i].name) return String(crew[i].name);
    }
    return "";
  }

  function liveNight(id){
    return state.nights.find(function(x){ return x.id === id; }) || null;
  }

  // ----- poster + year, from IMDb -----
  function fetchPoster(night){
    if (!night || !night.movie) return;
    if (night.metaState === "found" || night.metaState === "missing") return;
    if (metaPending[night.id]) return;
    metaPending[night.id] = true;

    fetch(IMDB_SUGGEST + encodeURIComponent(night.movie.toLowerCase()))
      .then(function(res){
        if (!res.ok) throw new Error("imdb " + res.status);
        return res.json();
      })
      .then(function(data){
        delete metaPending[night.id];
        var live = liveNight(night.id);
        if (!live) return; // removed while the request was in flight
        // The endpoint answers with people and TV as well, so take the first
        // entry that is a film and actually has artwork.
        var hits = (data && data.d) || [];
        var hit = null;
        for (var i = 0; i < hits.length; i++){
          var h = hits[i];
          if (h.qid && h.qid.indexOf("movie") !== 0 && h.qid !== "tvMovie") continue;
          if (imdbPoster((h.i || {}).imageUrl)){ hit = h; break; }
        }
        if (!hit){
          live.metaState = "missing";
        } else {
          live.imdbId = hit.id || "";
          live.posterUrl = imdbPoster((hit.i || {}).imageUrl);
          live.year = hit.y ? String(hit.y) : "";
          live.metaState = "found";
        }
        persist();
        render();
        fetchFacts(live);
      })
      .catch(function(){
        // No /api route (opened as a plain file, or served by something with
        // no functions), or IMDb itself is unhappy. Leave metaState unset so
        // the next page load tries again, and let TMDB fill in if it can.
        delete metaPending[night.id];
        fetchExtras(night);
      });
  }

  // ----- genres + director, from Wikidata -----
  // IMDb's suggestion payload has no genres, but Wikidata indexes films by
  // their IMDb id (property P345) and its SPARQL endpoint is keyless and
  // CORS-open, so the id we already stored is enough to ask for the rest.
  var WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
  var factsPending = {};

  // Wikidata spells them "drama film", "romance film", "science fiction film".
  function tidyGenre(label){
    var g = String(label || "").trim().replace(/\s+film$/i, "");
    if (!g) return "";
    return g.charAt(0).toUpperCase() + g.slice(1);
  }

  function fetchFacts(night){
    if (!night || !night.imdbId) return; // needs the IMDb lookup to land first
    if (night.factsState === "found" || night.factsState === "missing") return;
    if (factsPending[night.id]) return;
    factsPending[night.id] = true;

    var query = 'SELECT ?genreLabel ?directorLabel WHERE {' +
      ' ?film wdt:P345 "' + night.imdbId + '".' +
      ' OPTIONAL { ?film wdt:P136 ?genre. }' +
      ' OPTIONAL { ?film wdt:P57 ?director. }' +
      ' SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }' +
      '} LIMIT 30';

    fetch(WIKIDATA_SPARQL + "?format=json&query=" + encodeURIComponent(query), {
      headers: { "Accept": "application/sparql-results+json" }
    })
      .then(function(res){
        if (!res.ok) throw new Error("wikidata " + res.status);
        return res.json();
      })
      .then(function(data){
        delete factsPending[night.id];
        var live = liveNight(night.id);
        if (!live) return;
        var rows = (data && data.results && data.results.bindings) || [];
        // One row per genre, with the director repeated on each.
        var genres = [];
        var director = "";
        rows.forEach(function(r){
          var g = tidyGenre(r.genreLabel && r.genreLabel.value);
          if (g && genres.indexOf(g) === -1) genres.push(g);
          if (!director && r.directorLabel && r.directorLabel.value){
            director = String(r.directorLabel.value);
          }
        });
        if (!genres.length && !director){
          live.factsState = "missing";
        } else {
          if (genres.length) live.genres = genres.slice(0, 3);
          if (director) live.director = director;
          live.factsState = "found";
        }
        persist();
        render();
      })
      .catch(function(){
        delete factsPending[night.id];
      });
  }

  // ----- an exact trailer link: TMDB, only with a key -----
  function tmdbFetch(path, params){
    var qs = "api_key=" + encodeURIComponent(tmdbKey());
    Object.keys(params || {}).forEach(function(k){
      qs += "&" + k + "=" + encodeURIComponent(params[k]);
    });
    return fetch(TMDB_API + path + "?" + qs).then(function(res){
      if (!res.ok) throw new Error("tmdb " + res.status);
      return res.json();
    });
  }

  function fetchExtras(night){
    if (!tmdbKey() || !night || !night.movie) return;
    if (night.extraState === "found" || night.extraState === "missing") return;
    if (extraPending[night.id]) return;
    extraPending[night.id] = true;

    tmdbFetch("/search/movie", { include_adult: "false", query: night.movie })
      .then(function(data){
        var results = (data && data.results) || [];
        var hit = results[0];
        if (!hit || !hit.id){
          applyExtras(night.id, null);
          return null;
        }
        // One extra call brings back genres, the director and the trailer.
        return tmdbFetch("/movie/" + encodeURIComponent(hit.id), {
          append_to_response: "videos,credits"
        }).then(function(details){
          applyExtras(night.id, details);
        });
      })
      .catch(function(){
        delete extraPending[night.id];
      });
  }

  function applyExtras(id, details){
    delete extraPending[id];
    var live = liveNight(id);
    if (!live) return;
    if (!details){
      live.extraState = "missing";
      persist();
      render();
      return;
    }
    live.tmdbId = details.id || null;
    // Wikidata is the primary source for these two; TMDB only fills a gap.
    if (!live.genres || !live.genres.length){
      live.genres = ((details.genres || []).map(function(g){ return g.name; })
                     .filter(Boolean)).slice(0, 3);
    }
    if (!live.director) live.director = directorFrom(details.credits);
    // IMDb is trusted for the year, but fill it in if IMDb came up empty.
    if (!live.year) live.year = String(details.release_date || "").slice(0, 4);
    // A poster only if IMDb didn't already supply one.
    if (!live.posterUrl) live.posterUrl = posterUrlFrom(details.poster_path);
    // A trailer someone pasted in by hand always wins over the fetched one.
    if (!isSafeUrl(live.trailerUrl)){
      var t = trailerFrom(details.videos);
      if (t) live.trailerUrl = t;
    }
    live.extraState = "found";
    persist();
    render();
  }

  function fetchMeta(night){
    fetchPoster(night);
    fetchFacts(night);
    fetchExtras(night);
  }

  function fetchMissingMeta(){
    state.nights.forEach(function(n){ fetchMeta(n); });
  }

  // ---------- stats ----------
  function renderStats(){
    var n = state.nights;
    var count = n.length;
    var pickers = {};
    n.forEach(function(x){ if (x.pickedBy) pickers[x.pickedBy.trim().toLowerCase()] = 1; });
    return '<div class="stats-row">' +
      '<span class="stat-chip"><b class="tnum">' + count + '</b> screenings</span>' +
      '<span class="stat-chip"><b class="tnum">' + Object.keys(pickers).length + '</b> curators</span>' +
    '</div>';
  }

  // ---------- log view ----------
  function sortedByDateAsc(list){
    return list.slice().sort(function(a,b){
      return (a.date||"").localeCompare(b.date||"") || (a.createdAt||"").localeCompare(b.createdAt||"");
    });
  }

  function renderLog(){
    var asc = sortedByDateAsc(state.nights);
    var numberOf = {};
    asc.forEach(function(n,i){ numberOf[n.id] = i+1; });
    var descAll = asc.slice().reverse();
    var featured = descAll.length ? descAll[0] : null;

    var d = state.draft;
    var formHtml =
      '<div class="card add-card">' +
        '<div class="add-card-head">' +
          '<div>' +
            '<h2>Log a Screening</h2>' +
            '<p class="add-sub">Whoever picked Monday&rsquo;s movie adds it here &mdash; takes ten seconds, and the group never forgets what it watched.</p>' +
          '</div>' +
          '<button type="button" class="add-card-close" data-action="toggle-add" title="Close">&times;</button>' +
        '</div>' +
        (state.formError ? '<div class="form-error">' + esc(state.formError) + '</div>' : '') +
        '<form id="addForm" novalidate>' +
          '<div class="field"><label>Date</label><input type="date" name="date" value="' + esc(d.date) + '"></div>' +
          '<div class="field"><label>Movie</label><input type="text" name="movie" value="' + esc(d.movie) + '" placeholder="What are we watching?"></div>' +
          '<div class="grid2">' +
            '<div class="field"><label>Picked by</label><input type="text" name="pickedBy" value="' + esc(d.pickedBy) + '" placeholder="Whose turn is it?"></div>' +
            '<div class="field"><label>Guests</label><input type="text" name="attendees" value="' + esc(d.attendees) + '" placeholder="Who&#39;s on the couch? Comma-separated"></div>' +
          '</div>' +
          '<div class="field"><label>Trailer link (optional)</label><input type="url" name="trailerUrl" value="' + esc(d.trailerUrl) + '" placeholder="https://&hellip;"></div>' +
          '<div class="field"><label>Notes (optional)</label><textarea name="notes" placeholder="Snacks, pre-movie chat, anything worth remembering">' + esc(d.notes) + '</textarea></div>' +
          '<div class="form-row-end"><button type="submit" class="btn">Add to the log</button></div>' +
        '</form>' +
      '</div>';
    var addBlockHtml = state.showAddForm ? formHtml : '<button type="button" class="btn-add-toggle" data-action="toggle-add">+ Log a Screening</button>';

    var statsHtml = renderStats();
    var nextUpHtml = renderNextUp();

    if (!featured){
      var picked = state.nextUpDraft.pickedBy.trim();
      var emptyMsg = 'No screenings logged yet &mdash; <strong>' +
        esc(fmtDate(state.nextUpDraft.date || nextMonday())) + '</strong> is up next';
      if (picked) emptyMsg += ', ' + esc(picked) + '&#39;s pick';
      emptyMsg += '.';
      app.innerHTML = statsHtml + nextUpHtml + addBlockHtml +
        '<div class="card empty">' +
          '<h2>Nothing queued up yet</h2>' +
          '<p>' + emptyMsg + '</p>' +
        '</div>';
      bindForm();
      bindNextUp();
      bindAddToggle();
      return;
    }

    var nowHtml = renderNowCard(featured);
    var groups = groupByMonth(descAll);
    var rowsHtml = groups.map(function(g){
      return '<div class="row-heading"><h2>' + esc(g.label) + '</h2>' +
          '<div class="row-heading-end">' +
            '<span class="micro">' + g.items.length + ' title' + (g.items.length===1?"":"s") + '</span>' +
            '<button class="row-stats" data-action="month-stats" data-key="' + esc(g.key) + '">Stats</button>' +
          '</div>' +
        '</div>' +
        '<div class="carousel">' + g.items.map(function(n){ return renderThumb(n, numberOf[n.id]); }).join("") + '</div>';
    }).join("");
    var selected = state.selectedId ? state.nights.find(function(x){ return x.id === state.selectedId; }) : null;
    var detailHtml = selected ? renderDetail(selected, numberOf[selected.id]) : "";

    app.innerHTML = statsHtml + nextUpHtml + nowHtml + addBlockHtml + rowsHtml + detailHtml;
    bindForm();
    bindNextUp();
    bindAddToggle();
    bindCarousel();
    bindDetail();
  }

  function renderNextUp(){
    var picked = state.nextUpDraft.pickedBy;
    var when = state.nextUpDraft.date || nextMonday();
    return '<div class="card nextup-card">' +
      '<div class="nextup-top">' +
        '<span class="micro">Up Next</span>' +
      '</div>' +
      '<div class="nextup-fields">' +
        '<label class="nextup-field nextup-field-plain">' +
          '<input type="date" data-nextup="date" value="' + esc(when) + '">' +
        '</label>' +
        '<label class="nextup-field">' + avatarHtml(picked, 22) +
          '<input type="text" data-nextup="pickedBy" value="' + esc(picked) + '" placeholder="Who&#39;s picking?">' +
        '</label>' +
      '</div>' +
    '</div>';
  }

  // "1993 &middot; Drama, Romance &middot; Dir. John Singleton" — each piece only
  // appears once TMDB has actually supplied it.
  // A trailer button is always offered. An exact link wins when we have one
  // — pasted in by hand, or fetched from TMDB — and otherwise it opens a
  // YouTube search for the film, which lands on the trailer in practice.
  function trailerFor(n){
    if (isSafeUrl(n.trailerUrl)) return { url: n.trailerUrl, exact: true };
    var terms = [n.movie || "", n.year || "", "trailer"].join(" ").trim();
    return {
      url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(terms),
      exact: false
    };
  }

  function metaLine(n, skipYear){
    var bits = [];
    if (n.year && !skipYear) bits.push('<span class="tnum">' + esc(n.year) + '</span>');
    if (n.genres && n.genres.length) bits.push(esc(n.genres.join(", ")));
    if (n.director) bits.push("Dir. " + esc(n.director));
    if (!bits.length) return "";
    return '<div class="film-meta">' + bits.join(' <span class="sep">&middot;</span> ') + '</div>';
  }

  // Avatar hugging the name it belongs to, as one unbreakable unit.
  function personHtml(name, size){
    return '<span class="person">' + avatarHtml(name, size || 18) +
           '<span>' + esc(name || "&mdash;") + '</span></span>';
  }

  function attendeeChips(list, limit){
    var people = (list || []);
    if (limit) people = people.slice(0, limit);
    return people.map(function(a){
      return '<span class="chip">' + avatarHtml(a, 16) + esc(a) + '</span>';
    }).join("");
  }

  function renderNowCard(n){
    var attendees = n.attendees || [];
    return '<div class="card now-card">' +
      '<div class="now-cover"><div class="art" style="' + artBg(n) + '"></div></div>' +
      '<div class="now-body">' +
        '<div class="eyebrow">Latest Watch</div>' +
        '<h2>' + esc(n.movie) + '</h2>' +
        metaLine(n) +
        '<div class="meta">Selected by ' + personHtml(n.pickedBy, 20) + ' <span class="sep">&middot;</span> ' + esc(fmtDate(n.date)) + '</div>' +
        (attendees.length ? '<div class="chips" style="margin-bottom:8px;">' + attendeeChips(attendees) + '</div>' : "") +
        '<div class="now-actions">' +
          '<a class="btn-play" href="' + esc(trailerFor(n).url) + '" target="_blank" rel="noopener noreferrer"><span class="tri"></span>Trailer</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderThumb(n, num){
    var isSel = state.selectedId === n.id;
    return '<div class="thumb' + (isSel ? " selected" : "") + '" data-action="select-card" data-id="' + n.id + '">' +
      '<div class="art" style="' + artBg(n) + '"></div>' +
      '<div class="thumb-fade"></div>' +
      (n.year ? '<span class="thumb-year tnum">' + esc(n.year) + '</span>' : "") +
      '<button class="thumb-menu" data-action="edit" data-id="' + n.id + '" title="Edit this screening"><span></span><span></span><span></span></button>' +
      '<div class="thumb-title">' + esc(n.movie) + '</div>' +
    '</div>';
  }

  function renderDetail(n, num){
    var attendees = n.attendees || [];

    return '<div class="card detail" data-id="' + n.id + '">' +
      '<button class="detail-close" data-action="close-detail" title="Close">&times;</button>' +
      '<div class="detail-top">' +
        '<div>' +
          '<h3>' + esc(n.movie) + '</h3>' +
          metaLine(n) +
          '<div class="date">' + esc(fmtDate(n.date)) + ' <span class="sep">&middot;</span> picked by ' + personHtml(n.pickedBy, 18) + '</div>' +
        '</div>' +
      '</div>' +
      (attendees.length ? '<div class="chips">' + attendeeChips(attendees) + '</div>' : "") +
      (n.notes ? '<div class="notes">&ldquo;' + esc(n.notes) + '&rdquo;</div>' : "") +
      '<div class="actions">' +
        '<a class="trailer-link" href="' + esc(trailerFor(n).url) + '" target="_blank" rel="noopener noreferrer">&#9654; Watch trailer</a>' +
        '<button class="btn ghost small" data-action="edit" data-id="' + n.id + '">Edit</button>' +
        '<button class="btn ghost small" data-action="del" data-id="' + n.id + '">' + (state.pendingDelete === n.id ? "Confirm delete?" : "Remove") + '</button>' +
      '</div>' +
    '</div>';
  }

  // ---------- month stats ----------
  // Counts every value in `pick`, biggest first. Genres arrive as arrays and
  // guests as one row per person, so pick() returns an array either way.
  function tally(items, pick){
    var counts = {};
    items.forEach(function(n){
      (pick(n) || []).forEach(function(v){
        v = String(v == null ? "" : v).trim();
        if (v) counts[v] = (counts[v] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .map(function(k){ return [k, counts[k]]; })
      .sort(function(a, b){ return b[1] - a[1] || a[0].localeCompare(b[0]); });
  }

  function decadeOf(year){
    var y = parseInt(year, 10);
    if (!y || y < 1870 || y > 2999) return "";
    return String(Math.floor(y / 10) * 10) + "s";
  }

  function monthStats(items){
    return {
      count: items.length,
      genres: tally(items, function(n){ return n.genres || []; }),
      decades: tally(items, function(n){ return [decadeOf(n.year)]; }),
      curators: tally(items, function(n){ return [n.pickedBy]; }),
      // Whoever picked the film was obviously there, so they count towards
      // the night even though nobody types their own name into the guest
      // list. Deduped per night, so being in both lists is still one turn.
      guests: tally(items, function(n){
        var present = (n.attendees || []).slice();
        if (n.pickedBy && present.map(function(a){ return String(a).trim().toLowerCase(); })
              .indexOf(String(n.pickedBy).trim().toLowerCase()) === -1){
          present.push(n.pickedBy);
        }
        return present;
      }),
      directors: tally(items, function(n){ return [n.director]; }),
      // Genres and directors come from Wikidata, so this counts how many of
      // the month's films it has actually answered for.
      enriched: items.filter(function(n){ return n.factsState === "found"; }).length
    };
  }

  // ---------- edit dialog ----------
  var modalHost = document.getElementById("modal");

  function openEdit(id){
    var n = state.nights.find(function(x){ return x.id === id; });
    if (!n) return;
    state.modalView = "edit";
    state.editId = id;
    state.editError = "";
    state.editDraft = {
      date: n.date || "",
      movie: n.movie || "",
      pickedBy: n.pickedBy || "",
      attendees: (n.attendees || []).join(", "),
      trailerUrl: n.trailerUrl || "",
      notes: n.notes || ""
    };
    renderModal();
  }

  function closeModal(){
    state.modalView = null;
    state.editId = null;
    state.editDraft = null;
    state.editError = "";
    state.statsKey = null;
    state.detailsId = null;
    renderModal();
  }

  function openStats(key){
    state.modalView = "stats";
    state.statsKey = key;
    renderModal();
  }

  function saveEdit(){
    var d = state.editDraft;
    var n = state.nights.find(function(x){ return x.id === state.editId; });
    if (!n || !d) return closeModal();
    var movie = titleCase(d.movie);
    var pickedBy = String(d.pickedBy || "").trim();
    if (!movie || !pickedBy || !d.date){
      state.editError = "A movie title, who picked it, and a date are all needed.";
      renderModal();
      return;
    }
    var id = state.editId;
    closeModal();
    updateNight(id, {
      date: d.date,
      movie: movie,
      pickedBy: pickedBy,
      attendees: String(d.attendees || "").split(",").map(function(x){ return x.trim(); }).filter(Boolean),
      trailerUrl: String(d.trailerUrl || "").trim(),
      notes: String(d.notes || "").trim()
    });
  }

  function renderModal(){
    if (!modalHost) return;
    if (!state.modalView){
      modalHost.innerHTML = "";
      modalHost.classList.remove("open");
      document.body.classList.remove("modal-open");
      return;
    }
    modalHost.classList.add("open");
    document.body.classList.add("modal-open");
    if (state.modalView === "stats" || state.modalView === "details"){
      modalHost.innerHTML =
        '<div class="modal-backdrop" data-action="close-edit"></div>' +
        (state.modalView === "stats" ? renderStatsModal() : renderDetailsModal());
      bindModal();
      return;
    }
    var d = state.editDraft;
    modalHost.innerHTML =
      '<div class="modal-backdrop" data-action="close-edit"></div>' +
      '<div class="modal-card" role="dialog" aria-modal="true" aria-label="Edit screening">' +
        '<div class="modal-head">' +
          '<h2>Edit screening</h2>' +
          '<button class="add-card-close" data-action="close-edit" title="Close">&times;</button>' +
        '</div>' +
        (state.editError ? '<div class="form-error">' + esc(state.editError) + '</div>' : "") +
        '<form id="editForm">' +
          '<div class="grid2">' +
            '<div class="field"><label>Movie</label><input type="text" name="movie" value="' + esc(d.movie) + '" placeholder="What did you watch?"></div>' +
            '<div class="field"><label>Date</label><input type="date" name="date" value="' + esc(d.date) + '"></div>' +
          '</div>' +
          '<div class="field"><label>Picked by</label>' +
            '<div class="input-with-avatar">' + avatarHtml(d.pickedBy, 22) +
              '<input type="text" name="pickedBy" value="' + esc(d.pickedBy) + '" placeholder="Whose turn was it?">' +
            '</div>' +
          '</div>' +
          '<div class="field"><label>Guests</label><input type="text" name="attendees" value="' + esc(d.attendees) + '" placeholder="Who was on the couch? Comma-separated"></div>' +
          (d.attendees.trim() ? '<div class="chips chips-preview">' + attendeeChips(d.attendees.split(",").map(function(x){ return x.trim(); }).filter(Boolean)) + '</div>' : "") +
          '<div class="field"><label>Trailer URL</label><input type="url" name="trailerUrl" value="' + esc(d.trailerUrl) + '" placeholder="https://…"></div>' +
          '<div class="field"><label>Notes</label><textarea name="notes" rows="2" placeholder="Snacks, pre-movie chat, anything worth remembering">' + esc(d.notes) + '</textarea></div>' +
          '<div class="modal-actions">' +
            '<button type="button" class="btn ghost small" data-action="close-edit">Cancel</button>' +
            '<button type="submit" class="btn small">Save changes</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    bindModal();
  }

  function openDetails(id){
    if (!liveNight(id)) return;
    state.modalView = "details";
    state.detailsId = id;
    renderModal();
  }

  function renderDetailsModal(){
    var n = liveNight(state.detailsId);
    if (!n){
      return '<div class="modal-card"><div class="modal-head"><h2>Screening</h2>' +
        '<button class="add-card-close" data-action="close-edit" title="Close">&times;</button></div>' +
        '<p class="panel-empty">That screening is no longer in the log.</p></div>';
    }
    var attendees = n.attendees || [];
    return '<div class="modal-card details-card">' +
      '<div class="modal-head">' +
        '<div class="details-head">' +
          '<div class="details-art" style="' + artBg(n) + '"></div>' +
          '<div>' +
            '<h2>' + esc(n.movie) + '</h2>' +
            metaLine(n) +
            '<div class="details-when">' + esc(fmtDate(n.date)) + '</div>' +
          '</div>' +
        '</div>' +
        '<button class="add-card-close" data-action="close-edit" title="Close">&times;</button>' +
      '</div>' +

      '<div class="details-block">' +
        '<div class="micro">Picked by</div>' +
        '<div class="chips">' + personHtml(n.pickedBy, 20) + '</div>' +
      '</div>' +

      '<div class="details-block">' +
        '<div class="micro">On the couch</div>' +
        (attendees.length
          ? '<div class="chips">' + attendeeChips(attendees) + '</div>'
          : '<p class="panel-empty">No guests recorded.</p>') +
      '</div>' +

      (n.notes ? '<div class="details-block"><div class="micro">Notes</div>' +
        '<div class="notes">&ldquo;' + esc(n.notes) + '&rdquo;</div></div>' : "") +

      '<div class="modal-actions">' +
        '<a class="btn ghost small" href="' + esc(trailerFor(n).url) + '" target="_blank" rel="noopener noreferrer">&#9654; Trailer</a>' +
        '<button type="button" class="btn small" data-action="edit-from-details" data-id="' + n.id + '">Edit</button>' +
      '</div>' +
    '</div>';
  }

  function barList(pairs, limit){
    var rows = pairs.slice(0, limit || 6);
    if (!rows.length) return "";
    var top = rows[0][1];
    return '<div class="bars">' + rows.map(function(r){
      var pct = top ? Math.max(6, Math.round((r[1] / top) * 100)) : 0;
      return '<div class="bar-row">' +
        '<span class="bar-label">' + esc(r[0]) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="bar-count tnum">' + r[1] + '</span>' +
      '</div>';
    }).join("") + '</div>';
  }

  function statPanel(title, body, note){
    if (!body) body = '<p class="panel-empty">' + esc(note || "Nothing to show yet.") + '</p>';
    return '<div class="stat-panel"><div class="micro">' + esc(title) + '</div>' + body + '</div>';
  }

  function renderStatsModal(){
    var group = groupByMonth(sortedByDateAsc(state.nights).reverse())
      .find(function(g){ return g.key === state.statsKey; });
    if (!group){
      return '<div class="modal-card"><div class="modal-head"><h2>Stats</h2>' +
        '<button class="add-card-close" data-action="close-edit" title="Close">&times;</button></div>' +
        '<p class="panel-empty">That month is no longer in the log.</p></div>';
    }

    var st = monthStats(group.items);
    var missing = st.count - st.enriched;
    var genreNote = missing
      ? missing + " of " + st.count + " not matched on Wikidata yet."
      : "No genres listed for this month's films.";
    var yearNote = "No release years found for this month yet.";

    return '<div class="modal-card stats-card">' +
      '<div class="modal-head">' +
        '<div>' +
          '<h2>' + esc(group.label) + '</h2>' +
          '<p class="add-sub">' + st.count + ' screening' + (st.count===1?"":"s") + ' this month.</p>' +
        '</div>' +
        '<button class="add-card-close" data-action="close-edit" title="Close">&times;</button>' +
      '</div>' +

      '<div class="stat-tiles">' +
        '<div class="stat-tile"><b class="tnum">' + st.count + '</b><span>screenings</span></div>' +
        '<div class="stat-tile"><b class="tnum">' + st.decades.length + '</b><span>decade' + (st.decades.length===1?"":"s") + '</span></div>' +
        '<div class="stat-tile"><b class="tnum">' + st.curators.length + '</b><span>curator' + (st.curators.length===1?"":"s") + '</span></div>' +
        '<div class="stat-tile"><b class="tnum">' + st.guests.length + '</b><span>people on the couch</span></div>' +
      '</div>' +

      '<div class="stat-grid">' +
        statPanel("Genres", barList(st.genres, 6), genreNote) +
        statPanel("Decades", barList(st.decades, 6), yearNote) +
        statPanel("Who picked", barList(st.curators, 6), "No picks recorded.") +
        statPanel("Regulars", barList(st.guests, 6), "No guests recorded.") +
      '</div>' +

      (st.directors.length ? '<div class="stat-panel"><div class="micro">Directors</div>' +
        '<div class="chips">' + st.directors.map(function(r){
          return '<span class="chip">' + esc(r[0]) + (r[1] > 1 ? ' <span class="tnum">&times;' + r[1] + '</span>' : '') + '</span>';
        }).join("") + '</div></div>' : "") +

      '<div class="modal-actions">' +
        '<button type="button" class="btn small" data-action="close-edit">Done</button>' +
      '</div>' +
    '</div>';
  }

  function bindModal(){
    modalHost.querySelectorAll('[data-action="close-edit"]').forEach(function(el){
      el.addEventListener("click", closeModal);
    });
    var jump = modalHost.querySelector('[data-action="edit-from-details"]');
    if (jump){
      jump.addEventListener("click", function(){
        openEdit(jump.getAttribute("data-id"));
      });
    }
    var f = modalHost.querySelector("#editForm");
    if (!f) return;
    f.addEventListener("input", function(e){
      var name = e.target.name;
      if (!name || !state.editDraft) return;
      state.editDraft[name] = e.target.value;
      // The avatar and the guest chips track what's being typed.
      if (name === "pickedBy" || name === "attendees") renderModalPreviews();
    });
    f.addEventListener("submit", function(e){
      e.preventDefault();
      saveEdit();
    });
    var first = f.querySelector('input[name="movie"]');
    if (first) first.focus();
  }

  // Redrawn in place rather than through renderModal(), which would blow away
  // the caret position in the field being typed into.
  function renderModalPreviews(){
    var d = state.editDraft;
    if (!d) return;
    var av = modalHost.querySelector(".input-with-avatar .avatar");
    if (av) av.outerHTML = avatarHtml(d.pickedBy, 22);
    var chips = modalHost.querySelector(".chips-preview");
    var people = String(d.attendees || "").split(",").map(function(x){ return x.trim(); }).filter(Boolean);
    if (chips) chips.innerHTML = attendeeChips(people);
  }

  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && state.modalView) closeModal();
  });

  // ---------- recap view ----------
  function renderRecap(){
    var list = state.nights.slice().sort(function(a, b){
      return (b.date||"").localeCompare(a.date||"");
    });
    var statsHtml = renderStats();

    if (!list.length){
      app.innerHTML = statsHtml + '<div class="card empty"><h2>Nothing to screen yet</h2><p>Once you&rsquo;ve logged a few Monday nights, this is where the wall lives.</p></div>';
      return;
    }

    var cards = list.map(function(n){ return renderPoster(n); }).join("");
    app.innerHTML = statsHtml + '<div class="poster-grid">' + cards + '</div>';
  }

  function renderPoster(n){
    return '<div class="poster" data-action="details" data-id="' + n.id + '">' +
      '<div class="art" style="' + artBg(n) + '"></div>' +
      '<div class="poster-fade"></div>' +
      '<button class="poster-edit" data-action="edit" data-id="' + n.id + '" title="Edit this screening"><span></span><span></span><span></span></button>' +
      (n.year ? '<span class="badge-slot"><span class="poster-year tnum">' + esc(n.year) + '</span></span>' : "") +
      '<div class="poster-content">' +
        '<h3>' + esc(n.movie) + '</h3>' +
        metaLine(n, true) +
        '<div class="credit-line">Selected by ' + personHtml(n.pickedBy, 18) + '</div>' +
      '</div>' +
    '</div>';
  }

  // ---------- event binding ----------
  function bindForm(){
    var f = document.getElementById("addForm");
    if (!f) return;
    f.addEventListener("input", function(e){
      var name = e.target.name;
      if (name && Object.prototype.hasOwnProperty.call(state.draft, name)) state.draft[name] = e.target.value;
    });
    f.addEventListener("submit", function(e){
      e.preventDefault();
      var d = state.draft;
      var movie = titleCase(d.movie);
      var pickedBy = String(d.pickedBy||"").trim();
      if (!movie || !pickedBy || !d.date){
        state.formError = "A movie title, who picked it, and a date are needed before it can be saved.";
        render();
        return;
      }
      var attendees = String(d.attendees||"").split(",").map(function(s){return s.trim();}).filter(Boolean);
      addNight({
        date: d.date,
        movie: movie,
        pickedBy: pickedBy,
        attendees: attendees,
        trailerUrl: String(d.trailerUrl||"").trim(),
        notes: String(d.notes||"").trim(),
        ratings: [],
        createdAt: new Date().toISOString()
      });
      state.formError = "";
      state.draft = freshDraft();
      state.showAddForm = false;
      render();
    });
  }

  function bindAddToggle(){
    app.querySelectorAll('[data-action="toggle-add"]').forEach(function(el){
      el.addEventListener("click", function(){
        state.showAddForm = !state.showAddForm;
        state.formError = "";
        render();
      });
    });
  }

  function bindNextUp(){
    app.querySelectorAll('[data-nextup]').forEach(function(input){
      var field = input.getAttribute("data-nextup");
      input.addEventListener("input", function(e){
        state.nextUpDraft[field] = e.target.value;
        // Swapped in place rather than through render(), which would take
        // the caret out of the field being typed into.
        if (field === "pickedBy"){
          var av = input.parentNode.querySelector(".avatar");
          if (av) av.outerHTML = avatarHtml(e.target.value, 22);
        }
      });
      input.addEventListener("blur", function(e){
        saveNextUp(field, e.target.value);
      });
      // The calendar popup can commit a date without ever blurring the field.
      input.addEventListener("change", function(e){
        saveNextUp(field, e.target.value);
        if (field === "date") render();
      });
    });
  }

  function bindEditTriggers(){
    app.querySelectorAll('[data-action="edit"]').forEach(function(el){
      el.addEventListener("click", function(e){
        e.stopPropagation(); // the thumb underneath also handles clicks
        openEdit(el.getAttribute("data-id"));
      });
    });
    app.querySelectorAll('[data-action="details"]').forEach(function(el){
      el.addEventListener("click", function(e){
        // The edit button and the trailer link sit on top of the poster.
        if (e.target.closest('[data-action="edit"], a')) return;
        openDetails(el.getAttribute("data-id"));
      });
    });
    app.querySelectorAll('[data-action="month-stats"]').forEach(function(el){
      el.addEventListener("click", function(){
        openStats(el.getAttribute("data-key"));
      });
    });
  }

  function bindCarousel(){
    app.querySelectorAll('[data-action="select-card"]').forEach(function(el){
      el.addEventListener("click", function(){
        var id = el.getAttribute("data-id");
        state.selectedId = (state.selectedId === id) ? null : id;
        render();
      });
    });
  }

  function bindDetail(){
    var closeBtn = app.querySelector('[data-action="close-detail"]');
    if (closeBtn){
      closeBtn.addEventListener("click", function(){
        state.selectedId = null;
        render();
      });
    }
    app.querySelectorAll('[data-action="del"]').forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-id");
        if (state.pendingDelete === id){
          deleteNight(id);
          state.pendingDelete = null;
          state.selectedId = null;
        } else {
          state.pendingDelete = id;
          render();
        }
      });
    });
  }

  // The nav sits transparent over the cover photo and only takes on its own
  // blurred bar once the photo has scrolled away behind it.
  (function bindNavScroll(){
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var ticking = false;
    function sync(){
      ticking = false;
      var cover = document.querySelector(".cover");
      // Swap over just before the cover's bottom edge reaches the nav.
      var trigger = cover ? cover.offsetHeight - nav.offsetHeight - 8 : 0;
      nav.classList.toggle("scrolled", window.scrollY > trigger);
    }
    window.addEventListener("scroll", function(){
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(sync);
    }, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  })();

  document.querySelectorAll(".segtabs button").forEach(function(tab){
    tab.addEventListener("click", function(){
      state.view = tab.getAttribute("data-view");
      document.querySelectorAll(".segtabs button").forEach(function(t){ t.classList.toggle("active", t === tab); });
      render();
    });
  });

  // ---------- render dispatch ----------
  function render(){
    renderSyncNote();
    if (state.view === "recap") renderRecap();
    else renderLog();
    bindEditTriggers();
  }

  loadLocal();
  render();
  fetchMissingMeta();
})();
