// 몬스터 찾기: assets/data/spawns.json(맵·리젠 자리)과 monsters.json(그림·드롭)을 읽어 그린다
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function load(name) { return fetch("assets/data/" + name + ".json").then(function (r) { return r.json(); }); }
  function norm(s) { return String(s || "").replace(/\s+/g, "").toLowerCase(); }
  function imgName(path) { return path.split("/").pop().replace(/\.[^.]+$/, "") + ".png"; }

  var $ = function (id) { return document.getElementById(id); };
  var qEl = $("sp-q"), view = $("sp-view"), stage = $("sp-stage");
  var MAPS, MONS = [], BY_ANCHOR = {};
  var state = { mon: null, loc: 0, zoom: 1, mapId: null };

  Promise.all([load("spawns"), load("monsters")]).then(function (res) {
    var sp = res[0], md = res[1];
    MAPS = sp.maps;
    var entry = {};
    md.regions.forEach(function (r) {
      r.monsters.forEach(function (m) { entry[r.key + "-" + m.enemyId] = { m: m, region: r }; });
    });
    var locs = {};
    Object.keys(MAPS).forEach(function (id) {
      var mp = MAPS[id];
      mp.spawns.forEach(function (s) { s[2].forEach(function (k) { (locs[k] = locs[k] || {})[id] = (locs[k][id] || 0) + 1; }); });
      mp.any.forEach(function (k) { (locs[k] = locs[k] || {})[id] = locs[k][id] || 0; });
    });
    Object.keys(sp.mons).forEach(function (key) {
      var es = sp.mons[key].map(function (a) { return entry[a]; }).filter(Boolean);
      if (!es.length) return;
      var first = es[0].m, drops = {};
      es.forEach(function (e) {
        (e.m.drops || []).forEach(function (d) { if (!d.god && (!drops[d.name] || drops[d.name] < d.prob)) drops[d.name] = d.prob; });
      });
      var o = {
        key: key, name: first.name, img: first.img, hue: first.hue, leader: first.leader,
        regions: es.map(function (e) { return e.region.name; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),
        drops: Object.keys(drops).map(function (n) { return [n, drops[n]]; }),
        locs: Object.keys(locs[key] || {}).map(function (id) { return { map: id, n: locs[key][id] }; })
          .sort(function (a, b) { return b.n - a.n; })
      };
      o.i = MONS.length; o.nk = norm(o.name); o.dk = o.drops.map(function (d) { return norm(d[0]); });
      MONS.push(o);
      o.anchor = "m-" + sp.mons[key][0];
      sp.mons[key].forEach(function (a) { BY_ANCHOR["m-" + a] = key; });
    });
    MONS.sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (m, i) { m.i = i; });
    init();
  });

  function search(q) {
    var k = norm(q);
    if (!k) return { mons: [], n: 0 };
    var a = MONS.filter(function (m) { return m.nk.indexOf(k) >= 0; });
    var b = MONS.filter(function (m) { return m.nk.indexOf(k) < 0 && m.dk.some(function (d) { return d.indexOf(k) >= 0; }); });
    return { mons: a.concat(b), n: a.length, drop: b.length };
  }
  function thumb(m) {
    return m.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(m.img)) + '" alt=""' + (m.hue ? ' style="filter:hue-rotate(' + m.hue + 'deg)"' : "") + ' loading="lazy">' : "";
  }

  function init() {
    var ex = ["골렘", "늑대", "몬스터 가죽", "해적", "미라"];
    $("sp-ex").innerHTML = "예: " + ex.map(function (w) { return '<button type="button">' + esc(w) + "</button>"; }).join("");
    $("sp-ex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { qEl.value = b.textContent; onSearch(true); } });
    qEl.addEventListener("input", function () { onSearch(false); });
    $("sp-list").addEventListener("click", function (e) { var b = e.target.closest(".sp-row"); if (b) pick(+b.dataset.i, 0); });
    $("sp-card").addEventListener("click", function (e) { var b = e.target.closest(".sp-loc"); if (b) { state.loc = +b.dataset.l; render(); } });
    $("sp-others").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-i]"); if (!b) return;
      var m = MONS[+b.dataset.i], li = m.locs.findIndex(function (l) { return l.map === state.mapId; });
      pick(m.i, li < 0 ? 0 : li);
    });
    document.querySelector(".sp-zoom").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { state.zoom = +b.dataset.z; drawMap(); } });
    $("sp-exits").addEventListener("change", function (e) { stage.classList.toggle("sp-hide-ex", !e.target.checked); });
    // 마우스로 끌어서 옮기기
    var drag = null;
    view.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") return; drag = { x: e.clientX, y: e.clientY, l: view.scrollLeft, t: view.scrollTop }; view.classList.add("is-drag"); });
    window.addEventListener("pointermove", function (e) { if (drag) { view.scrollLeft = drag.l - (e.clientX - drag.x); view.scrollTop = drag.t - (e.clientY - drag.y); } });
    window.addEventListener("pointerup", function () { drag = null; view.classList.remove("is-drag"); });
    window.addEventListener("hashchange", fromHash);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && window.parent !== window) window.parent.postMessage("spawns-close", location.origin);
    });
    if (fromMap()) return;
    if (!fromHash()) {
      var miss = /^#m-/.test(location.hash);
      qEl.value = "골렘"; onSearch(true);
      if (miss) $("sp-hint").textContent = "찾던 몬스터는 정해진 리젠 자리가 없어요 (이벤트·보물 전투 등).";
    }
  }
  // ?map=<맵 번호>: 그 맵에 리젠 자리가 가장 많은 몬스터로 연다 (런처: 최근 저장한 맵)
  function fromMap() {
    var id = new URLSearchParams(location.search).get("map");
    var mp = id && MAPS[id];
    if (!mp) return false;
    var cnt = {};
    mp.spawns.forEach(function (s) { s[2].forEach(function (k) { cnt[k] = (cnt[k] || 0) + 1; }); });
    mp.any.forEach(function (k) { cnt[k] = cnt[k] || 0; });
    var best = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
    var i = MONS.findIndex(function (m) { return m.key === best; });
    if (i < 0) return false;
    qEl.value = MONS[i].name;
    state.mon = i;
    state.loc = Math.max(0, MONS[i].locs.findIndex(function (l) { return l.map === id; }));
    state.saved = id;
    render();
    return true;
  }
  function fromHash() {
    var key = BY_ANCHOR[location.hash.slice(1)];
    var i = key ? MONS.findIndex(function (m) { return m.key === key; }) : -1;
    if (i < 0) return false;
    qEl.value = MONS[i].name; state.mon = i; state.loc = 0; render(); return true;
  }
  function onSearch(force) {
    var r = search(qEl.value);
    if (r.mons.length && (force || r.mons.indexOf(MONS[state.mon]) < 0)) { pick(r.mons[0].i, 0); return; }
    render();
  }
  function pick(i, loc) {
    state.mon = i; state.loc = loc || 0;
    try { history.replaceState(null, "", "#" + MONS[i].anchor); } catch (e) {}
    render();
  }

  function render() {
    var q = qEl.value, k = norm(q), r = search(q), m = MONS[state.mon];
    $("sp-hint").innerHTML = !k ? "이름을 넣거나 예시를 눌러 보세요." : !r.mons.length ? "“" + esc(q) + "” 에 맞는 몬스터나 아이템이 없어요." :
      r.drop ? (r.n ? "이름이 맞는 몬스터 " + r.n + ", " : "") + '<b class="pixel">' + esc(q) + "</b> 을(를) 떨어뜨리는 몬스터 " + r.drop : "";
    $("sp-list").innerHTML = r.mons.map(function (x) {
      return '<button type="button" class="sp-row" data-i="' + x.i + '" aria-current="' + (x.i === state.mon) + '"><span class="mon-box">' + thumb(x) +
        '</span><span class="sp-row__t"><strong>' + esc(x.name) + '</strong><span class="pixel dim">' + esc(x.regions.join(" · ")) + '</span></span><span class="pixel dim sp-row__n">' + x.locs.length + "개 맵</span></button>";
    }).join("");
    var card = "";
    if (m) {
      card = '<div class="sp-card"><div class="sp-card__img">' + thumb(m) + '</div><div><h2>' + esc(m.name) + (m.leader ? ' <span class="kind kind--1">리더</span>' : "") + "</h2>" +
        '<div class="pixel dim sp-card__meta">' + esc(m.regions.join(" · ")) + "</div>" +
        (m.drops.length ? '<div class="sp-drops">' + m.drops.map(function (d) { return '<span class="pixel' + (k && norm(d[0]).indexOf(k) >= 0 ? " is-hit" : "") + '">' + esc(d[0]) + " " + d[1] + "%</span>"; }).join("") + "</div>" : "") +
        '</div><div class="sp-locs"><span class="pixel dim">나오는 맵</span>' + m.locs.map(function (l, i) {
          return '<button type="button" class="sp-loc" data-l="' + i + '" aria-pressed="' + (i === state.loc) + '"><b>' + esc(MAPS[l.map].name) + '</b><span class="pixel">' + (l.n ? "리젠 " + l.n + "곳" : "맵 어디서나") + "</span></button>";
        }).join("") + "</div></div>";
    }
    $("sp-card").innerHTML = card;
    drawMap();
  }

  function drawMap() {
    var m = MONS[state.mon], l = m && m.locs[state.loc];
    [].forEach.call(document.querySelectorAll(".sp-zoom button"), function (b) { b.setAttribute("aria-pressed", +b.dataset.z === state.zoom); });
    if (!l) { $("sp-head").innerHTML = '<p class="dim">몬스터를 고르면 나오는 맵이 여기에 보여요.</p>'; stage.innerHTML = ""; $("sp-others").innerHTML = ""; state.mapId = null; return; }
    var mp = MAPS[l.map], key = m.key, mine = mp.spawns.filter(function (s) { return s[2].indexOf(key) >= 0; });
    $("sp-head").innerHTML = (state.saved === l.map ? '<span class="pixel sp-saved">최근 저장한 맵</span>' : "") + '<div class="sp-head"><h2>' + esc(mp.name) + '</h2><span class="pixel sp-head__n">' + esc(m.name) + (mine.length ? " 리젠 " + mine.length + "곳" : " · 맵 어디서나") + "</span></div>" +
      '<p class="pixel dim sp-path">' + (mp.path.length > 1 ? mp.path.slice(0, -1).map(esc).join(" › ") + " › <b>" + esc(mp.name) + "</b>" : "") + "</p>";
    var changed = state.mapId !== l.map;
    state.mapId = l.map;
    stage.style.width = state.zoom * 100 + "%";
    var pct = function (v, n) { return ((v + 0.5) / n * 100) + "%"; };
    var no = 0, byKey = {};
    MONS.forEach(function (x) { byKey[x.key] = x; });
    var marks = mp.spawns.map(function (s) {
      var on = s[2].indexOf(key) >= 0;
      var names = s[2].map(function (k) { return byKey[k] ? byKey[k].name : ""; }).filter(Boolean).join(", ");
      return '<span class="sp-pt' + (on ? " is-on" : "") + '" style="left:' + pct(s[0], mp.w) + ";top:" + pct(s[1], mp.h) + '" title="' + esc(names) + '">' + (on ? ++no : "") + "</span>";
    }).join("") + mp.exits.map(function (e) {
      return '<span class="sp-exit" style="left:' + pct(e[0], mp.w) + ";top:" + pct(e[1], mp.h) + '">' + esc(e[2]) + "</span>";
    }).join("");
    if (changed || !stage.querySelector("img")) {
      stage.innerHTML = '<p class="sp-loading pixel">맵 불러오는 중…</p><img class="px" alt="' + esc(mp.name) + ' 맵" width="' + mp.w * 8 + '" height="' + mp.h * 8 + '" src="assets/img/maps/' + l.map + '.webp"><div class="sp-marks"></div>';
      var img = stage.querySelector("img");
      img.addEventListener("load", function () { var ld = stage.querySelector(".sp-loading"); if (ld) ld.remove(); focusFirst(); });
      img.addEventListener("error", function () { var ld = stage.querySelector(".sp-loading"); if (ld) ld.textContent = "맵 그림을 불러오지 못했어요."; });
    }
    stage.querySelector(".sp-marks").innerHTML = marks;
    stage.classList.toggle("sp-hide-ex", !$("sp-exits").checked);
    requestAnimationFrame(focusFirst);
    var set = {};
    mp.spawns.forEach(function (s) { s[2].forEach(function (k) { set[k] = 1; }); });
    mp.any.forEach(function (k) { set[k] = 1; });
    var others = Object.keys(set).filter(function (k) { return k !== key && byKey[k]; }).map(function (k) { return byKey[k]; });
    $("sp-others").innerHTML = (mine.length ? "" : '<p class="sp-any">이 맵은 걸어 다니면 아무 데서나 전투가 붙어요.</p>') +
      (others.length ? '<div class="sp-others"><span class="pixel dim">이 맵에 같이 나오는 몬스터</span><div>' + others.map(function (x) {
        return '<button type="button" data-i="' + x.i + '">' + thumb(x) + esc(x.name) + "</button>";
      }).join("") + "</div></div>" : "");
  }
  function focusFirst() {
    var p = stage.querySelector(".sp-pt.is-on");
    if (!p) { view.scrollTop = 0; view.scrollLeft = 0; return; }
    var r = p.getBoundingClientRect(), v = view.getBoundingClientRect();
    view.scrollLeft += (r.left - v.left) - v.width / 2;
    view.scrollTop += (r.top - v.top) - v.height / 2;
  }
})();
