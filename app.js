(function(){
  "use strict";

  var state = {
    view: "log",
    recapSort: "chrono",
    selectedId: null,
    pendingDelete: null,
    nights: [],
    storageError: "",
    formError: "",
    draft: null,
    rateDraft: {},
    nextUpDraft: { pickedBy:"", house:"" },
    showAddForm: false
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

  function coverBg(title){
    var h = hashStr(title || "untitled");
    var pair = COVER_PAIRS[h % COVER_PAIRS.length];
    var angle = 120 + (h % 60);
    return "background:linear-gradient(" + angle + "deg, " + pair[0] + " 0%, " + pair[1] + " 100%);";
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
    "eirini": "images/avatar-eirini.jpg"
  };
  function avatarHtml(name, size){
    size = size || 26;
    var key = String(name||"").trim().toLowerCase();
    var style = "width:" + size + "px;height:" + size + "px;font-size:" + Math.round(size*0.4) + "px;";
    if (!key){
      return '<span class="avatar avatar-empty" style="' + style + '"></span>';
    }
    if (AVATAR_PHOTOS[key]){
      return '<span class="avatar" style="' + style + 'background-image:url(\'' + AVATAR_PHOTOS[key] + '\')" title="' + esc(name) + '"></span>';
    }
    return '<span class="avatar" style="' + style + 'background:' + avatarColor(key) + '" title="' + esc(name) + '">' + esc(initials(name)) + '</span>';
  }

  function avgRating(n){
    if (!n.ratings || !n.ratings.length) return null;
    var sum = 0;
    n.ratings.forEach(function(r){ sum += Number(r.score) || 0; });
    return sum / n.ratings.length;
  }

  function ratingTier(avg){
    if (avg === null) return "none";
    if (avg >= 7.5) return "good";
    if (avg >= 5) return "mid";
    return "low";
  }

  function ratingTag(avg){
    var tier = ratingTier(avg);
    var label = avg === null ? "Unrated" : avg.toFixed(1);
    return '<span class="rating-tag tier-' + tier + '">' + (avg !== null ? '<span class="star">&#9733;</span>' : '') + label + '</span>';
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
        nextUp: { pickedBy: state.nextUpDraft.pickedBy, house: state.nextUpDraft.house }
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
    if (data && Array.isArray(data.nights)){
      state.nights = data.nights.filter(function(n){ return n && n.id; });
    }
    if (data && data.nextUp){
      state.nextUpDraft.pickedBy = data.nextUp.pickedBy || "";
      state.nextUpDraft.house = data.nextUp.house || "";
    }
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
  }
  function updateNight(id, patch){
    var n = state.nights.find(function(x){ return x.id === id; });
    if (n) Object.assign(n, patch);
    persist();
    render();
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

  // ---------- stats ----------
  function renderStats(){
    var n = state.nights;
    var count = n.length;
    var rated = n.filter(function(x){ return x.ratings && x.ratings.length; });
    var overall = null;
    if (rated.length){
      var s = 0, c = 0;
      rated.forEach(function(x){ x.ratings.forEach(function(r){ s += Number(r.score)||0; c++; }); });
      overall = c ? (s/c) : null;
    }
    var pickers = {};
    n.forEach(function(x){ if (x.pickedBy) pickers[x.pickedBy.trim().toLowerCase()] = 1; });
    return '<div class="stats-row">' +
      '<span class="stat-chip"><b class="tnum">' + count + '</b> screenings</span>' +
      '<span class="stat-chip"><b class="tnum">' + (overall !== null ? overall.toFixed(1) : "&mdash;") + '</b> avg rating</span>' +
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
      var house = state.nextUpDraft.house.trim();
      var emptyMsg = 'No screenings logged yet &mdash; <strong>' + esc(fmtDate(nextMonday())) + '</strong> is up next';
      if (picked) emptyMsg += ', ' + esc(picked) + '&#39;s pick';
      if (house) emptyMsg += ' at ' + esc(house);
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
      return '<div class="row-heading"><h2>' + esc(g.label) + '</h2><span class="micro">' + g.items.length + ' title' + (g.items.length===1?"":"s") + '</span></div>' +
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
    var house = state.nextUpDraft.house;
    return '<div class="card nextup-card">' +
      '<div class="nextup-top">' +
        '<span class="micro">Up Next</span>' +
        '<span class="nextup-when tnum">' + esc(fmtDate(nextMonday())) + '</span>' +
      '</div>' +
      '<div class="nextup-fields">' +
        '<label class="nextup-field">' + avatarHtml(picked, 22) +
          '<input type="text" data-nextup="pickedBy" value="' + esc(picked) + '" placeholder="Whose turn to pick?">' +
        '</label>' +
        '<label class="nextup-field nextup-field-plain">' +
          '<input type="text" data-nextup="house" value="' + esc(house) + '" placeholder="Whose house?">' +
        '</label>' +
      '</div>' +
    '</div>';
  }

  function renderNowCard(n){
    var avg = avgRating(n);
    var attendees = n.attendees || [];
    return '<div class="card now-card">' +
      '<div class="now-cover" style="' + coverBg(n.movie||"") + '"></div>' +
      '<div class="now-body">' +
        '<div class="eyebrow">Now Watching</div>' +
        '<h2>' + esc(n.movie) + '</h2>' +
        '<div class="meta with-avatar">' + avatarHtml(n.pickedBy, 20) + '<span>Selected by <strong>' + esc(n.pickedBy || "&mdash;") + '</strong> &middot; ' + esc(fmtDate(n.date)) + '</span></div>' +
        (attendees.length ? '<div class="chips" style="margin-bottom:8px;">' + attendees.map(function(a){ return '<span class="chip">' + esc(a) + '</span>'; }).join("") + '</div>' : "") +
        '<div class="now-actions">' +
          (isSafeUrl(n.trailerUrl) ? '<a class="btn-play" href="' + esc(n.trailerUrl) + '" target="_blank" rel="noopener noreferrer"><span class="tri"></span>Trailer</a>' : '<span class="btn-ghost-pill">No trailer yet</span>') +
          ratingTag(avg) +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderThumb(n, num){
    var avg = avgRating(n);
    var tier = ratingTier(avg);
    var isSel = state.selectedId === n.id;
    return '<div class="thumb' + (isSel ? " selected" : "") + '" style="' + coverBg(n.movie||"") + '" data-action="select-card" data-id="' + n.id + '">' +
      '<div class="thumb-fade"></div>' +
      '<span class="thumb-rating tier-' + tier + '">' + (avg !== null ? "&#9733; " + avg.toFixed(1) : "&mdash;") + '</span>' +
      '<span class="thumb-menu"><span></span><span></span><span></span></span>' +
      '<div class="thumb-title">' + esc(n.movie) + '</div>' +
    '</div>';
  }

  function renderDetail(n, num){
    var avg = avgRating(n);
    var attendees = n.attendees || [];
    var ratings = n.ratings || [];
    var ratingChips = ratings.map(function(r, idx){
      return '<span class="rate-chip">' + avatarHtml(r.name, 16) + esc(r.name) + ' <span class="tnum">' + Number(r.score).toFixed(1) + '</span>' +
        '<button data-action="rmrate" data-id="' + n.id + '" data-idx="' + idx + '" title="Remove rating">&times;</button></span>';
    }).join("");
    var rd = state.rateDraft[n.id] || { name:"", score:"" };

    return '<div class="card detail" data-id="' + n.id + '">' +
      '<button class="detail-close" data-action="close-detail" title="Close">&times;</button>' +
      '<div class="detail-top">' +
        '<div>' +
          '<h3>' + esc(n.movie) + '</h3>' +
          '<div class="date tnum with-avatar">' + avatarHtml(n.pickedBy, 18) + '<span>' + esc(fmtDate(n.date)) + ' &middot; picked by ' + esc(n.pickedBy || "&mdash;") + '</span></div>' +
        '</div>' +
        ratingTag(avg) +
      '</div>' +
      (attendees.length ? '<div class="chips">' + attendees.map(function(a){ return '<span class="chip">' + esc(a) + '</span>'; }).join("") + '</div>' : "") +
      (n.notes ? '<div class="notes">&ldquo;' + esc(n.notes) + '&rdquo;</div>' : "") +
      '<div class="actions">' +
        (isSafeUrl(n.trailerUrl) ? '<a class="trailer-link" href="' + esc(n.trailerUrl) + '" target="_blank" rel="noopener noreferrer">&#9654; Watch trailer</a>' : '') +
        '<button class="btn ghost small" data-action="del" data-id="' + n.id + '">' + (state.pendingDelete === n.id ? "Confirm delete?" : "Remove") + '</button>' +
      '</div>' +
      '<div class="rate-panel">' +
        '<div class="micro" style="margin-bottom:8px;">Ratings</div>' +
        (ratingChips ? '<div class="ratings-list">' + ratingChips + '</div>' : '<div class="sync-note" style="padding:0;margin:0 0 10px;">No ratings yet.</div>') +
        '<form class="rate-form" data-action="rate-form" data-id="' + n.id + '">' +
          '<div class="field"><label>Name</label><input type="text" name="name" value="' + esc(rd.name) + '" placeholder="Your name"></div>' +
          '<div class="field score"><label>Score</label><input type="number" name="score" min="1" max="10" step="0.1" value="' + esc(rd.score) + '" placeholder="1&ndash;10"></div>' +
          '<button type="submit" class="btn small">Add rating</button>' +
        '</form>' +
      '</div>' +
    '</div>';
  }

  // ---------- recap view ----------
  function renderRecap(){
    var list = state.nights.slice();
    if (state.recapSort === "top"){
      list.sort(function(a,b){
        var av = avgRating(a), bv = avgRating(b);
        if (av === null && bv === null) return (a.date||"").localeCompare(b.date||"");
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
      });
    } else {
      list.sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });
    }

    var statsHtml = renderStats();
    var controls =
      '<div class="recap-controls">' +
        '<div class="seg">' +
          '<button data-sort="chrono" class="' + (state.recapSort==="chrono"?"on":"") + '">Diary</button>' +
          '<button data-sort="top" class="' + (state.recapSort==="top"?"on":"") + '">Top Rated</button>' +
        '</div>' +
      '</div>';

    if (!list.length){
      app.innerHTML = statsHtml + controls + '<div class="card empty"><h2>Nothing to screen yet</h2><p>Once you&rsquo;ve logged a few Monday nights, this is where the wall lives.</p></div>';
      bindRecapControls();
      return;
    }

    var cards = list.map(function(n, i){ return renderPoster(n, state.recapSort==="top" ? i+1 : null); }).join("");
    app.innerHTML = statsHtml + controls + '<div class="poster-grid">' + cards + '</div>';
    bindRecapControls();
  }

  function renderPoster(n, rank){
    var avg = avgRating(n);
    var attendees = n.attendees || [];
    var ratings = n.ratings || [];
    var indRatings = ratings.map(function(r){ return esc(r.name) + " " + Number(r.score).toFixed(1); }).join(" &middot; ");

    return '<div class="poster" style="' + coverBg(n.movie || "") + '">' +
      '<div class="poster-fade"></div>' +
      (rank ? '<span class="rank' + (rank===1?" gold":"") + '">#' + rank + '</span>' : "") +
      '<span class="badge-slot">' + ratingTag(avg) + '</span>' +
      '<div class="poster-content">' +
        '<h3>' + esc(n.movie) + '</h3>' +
        '<div class="credit-line with-avatar">' + avatarHtml(n.pickedBy, 18) + '<span>Selected by <strong>' + esc(n.pickedBy || "&mdash;") + '</strong></span></div>' +
        (attendees.length ? '<div class="chips">' + attendees.slice(0,3).map(function(a){ return '<span class="chip">' + esc(a) + '</span>'; }).join("") + '</div>' : "") +
        (indRatings ? '<div class="ind-ratings">' + indRatings + '</div>' : "") +
        (isSafeUrl(n.trailerUrl) ? '<a class="trailer-link" href="' + esc(n.trailerUrl) + '" target="_blank" rel="noopener noreferrer">&#9654; Trailer</a>' : "") +
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
      var movie = String(d.movie||"").trim();
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
      });
      input.addEventListener("blur", function(e){
        saveNextUp(field, e.target.value);
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
    app.querySelectorAll('[data-action="rmrate"]').forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-id");
        var idx = Number(btn.getAttribute("data-idx"));
        var n = state.nights.find(function(x){ return x.id === id; });
        if (!n) return;
        var next = (n.ratings||[]).slice();
        next.splice(idx,1);
        updateNight(id, { ratings: next });
      });
    });
    app.querySelectorAll('[data-action="rate-form"]').forEach(function(form){
      var id = form.getAttribute("data-id");
      form.addEventListener("input", function(e){
        var name = e.target.name;
        if (!name) return;
        if (!state.rateDraft[id]) state.rateDraft[id] = { name:"", score:"" };
        state.rateDraft[id][name] = e.target.value;
      });
      form.addEventListener("submit", function(e){
        e.preventDefault();
        var rd = state.rateDraft[id] || {};
        var name = String(rd.name||"").trim();
        var score = Number(rd.score);
        if (!name || isNaN(score)) return;
        score = Math.max(1, Math.min(10, score));
        var n = state.nights.find(function(x){ return x.id === id; });
        if (!n) return;
        var next = (n.ratings||[]).slice();
        next.push({ name: name, score: score });
        delete state.rateDraft[id];
        updateNight(id, { ratings: next });
      });
    });
  }

  function bindRecapControls(){
    app.querySelectorAll('[data-sort]').forEach(function(btn){
      btn.addEventListener("click", function(){
        state.recapSort = btn.getAttribute("data-sort");
        render();
      });
    });
  }

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
  }

  loadLocal();
  render();
})();
