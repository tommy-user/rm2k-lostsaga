// 가디언·아이템·몬스터 페이지: assets/data/*.json 을 읽어 그린다
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function load(name) { return fetch("assets/data/" + name + ".json").then(function (r) { return r.json(); }); }
  function imgName(path) { return path.split("/").pop().replace(/\.[^.]+$/, "") + ".png"; }
  // 검색창의 Enter(폰 키보드의 검색 키): 키보드를 내리고 결과가 보이게 검색 줄을 화면 위로 올린다 (검색은 글자를 칠 때마다 이미 된다)
  function enterSearch(input) {
    input.setAttribute("enterkeyhint", "search");
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      input.blur();
      var bar = input.closest(".item-tools") || input, gnb = document.getElementById("gnb");
      var top = bar.getBoundingClientRect().top + scrollY - (gnb && getComputedStyle(gnb).position !== "static" ? gnb.offsetHeight : 0) - 12;
      scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }

  // ── 리스트/카드 보기와 정렬 표 (아이템·몬스터 공용) ──
  var VIEW_KEY = "lostsaga-view";
  function getView() {
    try { return localStorage.getItem(VIEW_KEY) === "card" ? "card" : "list"; } catch (e) { return "list"; }
  }
  function setView(v) {
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) {}
  }
  function viewToggle(onChange) {
    var el = document.getElementById("view-toggle");
    function paint() {
      var v = getView();
      el.innerHTML = [["list", "리스트"], ["card", "카드"]].map(function (o) {
        return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (v === o[0]) + '">' + o[1] + "</button>";
      }).join("");
    }
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || b.dataset.v === getView()) return;
      setView(b.dataset.v);
      paint();
      onChange();
    });
    paint();
  }
  // cols: {key, label, num?, sort?(기본 true), get(row)=정렬값(null 이면 항상 맨 뒤), html(row)}
  function sortRows(rows, cols, sort) {
    var col = cols.filter(function (c) { return c.key === sort.key; })[0];
    if (!col) return rows;
    return rows.map(function (r, i) { return { r: r, i: i, v: col.get(r) }; }).sort(function (a, b) {
      if (a.v == null || b.v == null) return a.v == null ? (b.v == null ? a.i - b.i : 1) : -1;
      var c = col.num ? a.v - b.v : String(a.v).localeCompare(String(b.v), "ko");
      return c ? c * sort.dir : a.i - b.i;
    }).map(function (x) { return x.r; });
  }
  function dataTable(cols, rows, sort, cls, rowId) {
    var head = cols.map(function (c) {
      if (c.sort === false) return '<th class="' + (c.wide ? "wide" : "") + '">' + c.label + "</th>";
      var on = sort.key === c.key;
      return '<th class="' + (c.right ? "num" : "") + '" aria-sort="' + (on ? (sort.dir > 0 ? "ascending" : "descending") : "none") + '">' +
        '<button type="button" data-sort="' + c.key + '">' + c.label + '<span aria-hidden="true">' + (on ? (sort.dir > 0 ? " ▲" : " ▼") : "") + "</span></button></th>";
    }).join("");
    var body = rows.map(function (r) {
      var id = rowId && rowId(r);
      return "<tr" + (id ? ' id="' + esc(id) + '"' : "") + ">" + cols.map(function (c) {
        var empty = c.right && c.get && c.get(r) == null;
        return '<td class="' + [c.right ? "num" : "", c.wide ? "wide" : "", c.key, empty ? "empty" : ""].join(" ") + '" data-label="' + esc(c.label) + '">' + c.html(r) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    // 좁은 화면에서는 머리글이 없어지므로 정렬을 고르는 상자를 따로 둔다
    var sortable = cols.filter(function (c) { return c.sort !== false; });
    var mobile = '<div class="sort-mobile"><label>정렬 <select data-sort-sel aria-label="정렬 기준"><option value="">기본 순서</option>' + sortable.map(function (c) {
      return '<option value="' + c.key + '"' + (sort.key === c.key ? " selected" : "") + ">" + c.label + "</option>";
    }).join("") + '</select></label><button type="button" data-sort-dir aria-label="정렬 방향 바꾸기"' + (sort.key ? "" : " disabled") + ">" + (sort.dir > 0 ? "▲ 오름차순" : "▼ 내림차순") + "</button></div>";
    return mobile + '<div class="win win--plain table-win"><div class="table-scroll"><table class="table data-table ' + (cls || "") + '"><thead><tr>' + head + "</tr></thead><tbody>" +
      (body || '<tr><td colspan="' + cols.length + '" class="dim">찾는 항목이 없다.</td></tr>') + "</tbody></table></div></div>";
  }
  // 머리글 클릭 → 정렬 바꾸기. 숫자는 큰 값부터, 글자는 가나다 순부터
  function bindSort(el, cols, sort, onChange) {
    function pick(key) {
      if (sort.key === key) sort.dir = -sort.dir;
      else {
        sort.key = key;
        sort.dir = cols.filter(function (c) { return c.key === key; })[0].num ? -1 : 1;
      }
    }
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-sort]");
      if (b) { pick(b.dataset.sort); onChange(); return; }
      if (e.target.closest("button[data-sort-dir]")) { sort.dir = -sort.dir; onChange(); }
    });
    el.addEventListener("change", function (e) {
      var sel = e.target.closest("select[data-sort-sel]");
      if (!sel) return;
      if (!sel.value) { sort.key = null; sort.dir = 1; }
      else { sort.key = null; pick(sel.value); }
      onChange();
    });
  }
  // 몬스터 쪽의 한 몬스터로 가는 주소 (아이템 쪽 드롭 링크도 같은 규칙)
  function monAnchor(m, regionKey) { return regionKey ? "m-" + regionKey + "-" + m.enemyId : "boss-" + m.enemyId; }
  function dash(v) { return v == null || v === 0 ? '<span class="dim">–</span>' : String(v); }

  // ── 가디언 ──
  var gEl = document.getElementById("guardians");
  if (gEl) {
    Promise.all([load("guardians"), load("skills")]).then(function (res) {
      var d = res[0], sk = res[1];
      var hireEl = document.getElementById("hire");
      hireEl.textContent = d.hire;
      function card(g, extra) {
        var s = g.stats || {};
        var rows = ((sk["g" + g.actorId] || [])[0] || { rows: [] }).rows;
        return '<article class="guard win">' +
          '<div class="guard__face"><img src="assets/img/guardian/' + g.actorId + '.png" alt="' + esc(g.name) + ' 초상화" loading="lazy">' +
          '<img class="guard__sprite px" src="assets/img/guardian/' + g.actorId + '_sprite.png" alt="" loading="lazy"></div>' +
          "<div><h3>" + esc(g.name) + '</h3><p class="guard__job">' + esc(g.job) +
          (s.level ? ' <span class="dim">Lv' + s.level + " HP " + s.hp + " MP " + s.mp + "</span>" : "") + "</p>" +
          (g.line ? '<p class="guard__line">"' + esc(g.line) + '"</p>' : "") +
          "<p>" + esc(g.desc) + "</p></div>" +
          '<details class="guard__learn"><summary class="pixel">배우는 기술 ' + rows.length + "</summary>" +
          '<table class="table"><tbody>' + rows.map(function (k) {
            return '<tr><td class="pixel">Lv' + k.lv + "</td><th>" + esc(k.name) + '</th><td class="dim">' + esc(k.desc) + "</td></tr>";
          }).join("") + "</tbody></table></details></article>";
      }
      gEl.innerHTML = d.guardians.map(function (g) { return card(g); }).join("");

      // ── 영혼의 투구 탭 ──
      var b = d.bertz, bEl = document.getElementById("bertz");
      var tabs = document.getElementById("guard-tabs");
      if (!b) { tabs.hidden = true; return; }
      var learn = ((sk.g102 || [])[0] || { rows: [] }).rows;
      function stat(s) {
        if (!s.level) return "";
        return ["Lv" + s.level, "HP " + s.hp, "MP " + s.mp, "공 " + s.atk, "방 " + s.def, "정 " + s.spi, "민 " + s.agi].map(function (t) {
          return '<span class="nw">' + t + "</span>";
        }).join(" ");
      }
      function bcard(g, helmet) {
        var s = g.stats || {};
        return '<article class="guard win">' +
          '<div class="guard__face">' + (g.face ? '<img src="assets/img/guardian/' + g.actorId + '.png" alt="' + esc(g.job) + ' 초상화" loading="lazy">' : '<span class="guard__noface"></span>') +
          '<img class="guard__sprite px' + (g.face ? "" : " guard__sprite--solo") + '" src="assets/img/guardian/' + g.actorId + '_sprite.png" alt="" loading="lazy"></div>' +
          "<div><h3>" + esc(helmet ? "영혼의 투구" : g.job) + '</h3><p class="guard__job">' + esc(helmet ? "육성형 동료" : g.name) +
          ' <span class="dim">' + stat(s) + "</span></p>" +
          (g.cond ? '<p class="guard__line">점수 ' + esc(g.cond) + "</p>" : "") +
          "<p>" + esc(g.desc) + "</p></div></article>";
      }
      bEl.innerHTML = '<p class="lede">' + esc(b.how) + "</p>" +
        "<p>" + esc(b.rule) + "</p>" +
        '<div class="guards">' + bcard(b.helmet, true) + "</div>" +
        '<h2 style="margin:28px 0 14px">진화 형태</h2><div class="guards">' + b.forms.map(function (f) { return bcard(f); }).join("") + "</div>" +
        '<details class="guard__learn" style="margin-top:18px"><summary class="pixel">베르츠가 배우는 기술 ' + learn.length + "</summary>" +
        '<table class="table"><tbody>' + learn.map(function (k) {
          return '<tr><td class="pixel">Lv' + k.lv + "</td><th>" + esc(k.name) + '</th><td class="dim">' + esc(k.desc) + "</td></tr>";
        }).join("") + "</tbody></table></details>";

      // ── 몬스터 맹약 탭 ──
      var t = d.taming, tEl = document.getElementById("taming");
      var tBtn = tabs.querySelector('[data-k="taming"]');
      if (!t || !tEl) { if (tBtn) tBtn.hidden = true; }
      else {
        var kinds = ["전체", "모든 직업", "테이머", "네크로맨서"];
        function tcard(m) {
          var s = m.stats || {};
          return '<article class="guard win tame" data-kind="' + esc(m.kind) + '" id="tame-' + m.actorId + '">' +
            '<div class="guard__face"><img src="assets/img/taming/' + m.actorId + '.png" alt="' + esc(m.name) + ' 얼굴" loading="lazy">' +
            '<img class="guard__sprite px" src="assets/img/taming/' + m.actorId + '_sprite.png" alt="" loading="lazy">' +
            '<img class="tame__evo" src="assets/img/taming/' + m.actorId + '_evo.png" alt="' + esc(m.evo) + ' 얼굴" loading="lazy" title="진화: ' + esc(m.evo) + '"></div>' +
            "<div><h3>" + esc(m.name) + ' <span class="tame__to">→ ' + esc(m.evo) + "</span></h3>" +
            '<p class="guard__job"><span class="tag tame__kind">' + esc(m.kind) + "</span> " +
            '<span class="dim">' + stat(s) + "</span></p>" +
            "<p>나오는 곳 " + esc(m.where) + "<br>맹약 Lv" + m.startLv + " · 진화 Lv" + m.evoLv + "</p></div>" +
            '<details class="guard__learn"><summary class="pixel">배우는 기술 ' + m.skills.length + "</summary>" +
            '<table class="table"><tbody>' + m.skills.map(function (k) {
              return '<tr><td class="pixel">' + (k.evo ? "진화" : "Lv" + k.lv) + "</td><th>" + esc(k.name) + '</th><td class="dim">' +
                esc(k.desc) + (k.mp ? " (MP " + k.mp + ")" : "") + "</td></tr>";
            }).join("") + "</tbody></table></details></article>";
        }
        tEl.innerHTML = '<p class="lede">' + esc(t.how) + "</p><p>" + esc(t.rule) + "</p><p>" + esc(t.who) + "</p>" +
          '<p class="dim">' + esc(t.skillNote) + "</p>" +
          '<div class="item-tabs tame__filter" role="tablist" aria-label="맹약할 수 있는 직업">' + kinds.map(function (k, i) {
            return '<button type="button" role="tab" aria-selected="' + (i ? "false" : "true") + '" data-kind="' + esc(k) + '">' + esc(k) +
              (i ? " " + t.species.filter(function (m) { return m.kind === k; }).length : "") + "</button>";
          }).join("") + "</div>" +
          '<div class="guards">' + t.species.map(tcard).join("") + "</div>";
        var filt = tEl.querySelector(".tame__filter");
        filt.addEventListener("click", function (e) {
          var btn = e.target.closest("button");
          if (!btn) return;
          filt.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x === btn ? "true" : "false"); });
          tEl.querySelectorAll(".tame").forEach(function (c) { c.hidden = btn.dataset.kind !== "전체" && c.dataset.kind !== btn.dataset.kind; });
        });
      }
      function show(k) {
        tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x.dataset.k === k ? "true" : "false"); });
        gEl.hidden = k !== "guardians";
        bEl.hidden = k !== "bertz";
        if (tEl) tEl.hidden = k !== "taming";
        document.getElementById("hire-title").hidden = k !== "guardians";
        hireEl.hidden = k !== "guardians";
      }
      tabs.addEventListener("click", function (e) {
        var btn = e.target.closest("button");
        if (btn) show(btn.dataset.k);
      });
      // guardians.html#taming 으로 바로 연다
      if (location.hash === "#taming" || /^#tame-/.test(location.hash)) {
        show("taming");
        var go = document.getElementById(location.hash.slice(1));
        if (go && go !== tEl) go.scrollIntoView();
      }
    });
  }

  // ── 아이템 ──
  var iEl = document.getElementById("items");
  if (iEl) {
    Promise.all([load("items"), load("recipes").catch(function () { return {}; }), load("monsters").catch(function () { return null; }),
      load("spawns").catch(function () { return null; })]).then(function (res) {
      var d = res[0], recipes = res[1], mons = res[2], spawnMons = (res[3] && res[3].mons) || {};
      // 아이템 id(없으면 이름) → 떨어뜨리는 몬스터. 가린 몬스터(???)와 신급 드롭은 넣지 않는다
      var dropById = {}, dropByName = {};
      if (mons) {
        var regionName = {};
        mons.regions.forEach(function (r) { regionName[r.key] = r.name; });
        var addDrop = function (m, regionKey) {
          if (m.secret) return;
          (m.drops || []).forEach(function (dr) {
            if (dr.god) return;
            // 몬스터 찾기(spawns.html)에 리젠 자리가 있으면 그 맵으로 바로 간다 (보스·이벤트 전투는 없다)
            var sp = regionKey ? spawnMons[String(m.name).replace(/\s+/g, "")] : null;
            var src = { name: m.name, prob: dr.prob, region: regionName[regionKey || m.region] || "", href: "monsters.html#" + monAnchor(m, regionKey),
              map: sp && sp.length ? "spawns.html#m-" + sp[0] : null, boss: !regionKey };
            (dropById[dr.id] = dropById[dr.id] || []).push(src);
            (dropByName[dr.name] = dropByName[dr.name] || []).push(src);
          });
        };
        mons.regions.forEach(function (r) { r.monsters.forEach(function (m) { addDrop(m, r.key); }); });
        mons.bosses.forEach(function (b) { addDrop(b, null); });
        var byProb = function (a, b) { return b.prob - a.prob; };
        Object.keys(dropById).forEach(function (k) { dropById[k].sort(byProb); });
        Object.keys(dropByName).forEach(function (k) { dropByName[k].sort(byProb); });
      }
      function dropSrc(it) { return dropById[it.id] || dropByName[it.name] || []; }
      function dropFrom(it) {
        var src = dropSrc(it);
        if (!src.length) return "";
        return '<p class="item__drop"><span class="pixel">드롭</span> ' + src.map(function (s) {
          return '<a href="' + esc(s.href) + '">' + esc(s.name) + "</a> " + s.prob + '%<span class="dim"> · ' + esc(s.region) + "</span>";
        }).join(", ") + "</p>";
      }
      var grades = {};
      d.grades.forEach(function (g) { grades[g.key] = g; });
      grades.god = { name: "신급" };
      function badge(k) { var g = grades[k] || grades.normal; return '<span class="grade grade--' + esc(k || "normal") + '">' + esc(g.name) + "</span>"; }
      function stats(s) {
        if (!s) return "";
        var n = { atk: "공", def: "방", spi: "정", agi: "민" };
        var out = Object.keys(n).filter(function (k) { return s[k]; }).map(function (k) { return n[k] + " " + s[k]; });
        return out.length ? '<p class="item__stats">' + out.join("<span aria-hidden=\"true\">/</span>") + "</p>" : "";
      }
      var jobName = {};
      (d.jobs || []).forEach(function (j) { jobName[j.key] = j.name; });
      var jobTotal = (d.jobs || []).length;
      // 장비만 it.jobs 가 있다 (없으면 전 직업). 대부분 입는 장비는 못 입는 직업을 적는다
      function isEquip(it) { return it.type >= 1 && it.type <= 5; }
      function jobChips(it) {
        if (!isEquip(it)) return null;
        var js = it.jobs;
        if (!js) return '<span class="job job--all">누구나</span>';
        if (jobTotal && js.length >= jobTotal - 3) {
          var no = (d.jobs || []).filter(function (j) { return js.indexOf(j.key) < 0; });
          return '<span class="job job--all">대부분</span> <span class="dim small">' + no.map(function (j) { return esc(j.name); }).join("·") + " 제외</span>";
        }
        return js.map(function (k) { return '<span class="job">' + esc(jobName[k] || k) + "</span>"; }).join(" ");
      }
      // 무기만 한 손/양손을 나눈다 (양손 무기는 방패와 함께 못 낀다)
      function handChip(it) {
        if (it.type !== 1) return "";
        return it.twoHanded ? '<span class="hand hand--two">양손</span>' : '<span class="hand hand--one">한손</span>';
      }
      // 가디언(용병) 착용 (운영 지시 #216). it.guardians 가 없으면 열두 명 다, [] 면 아무도 못 낀다
      var guardName = {};
      (d.guardians || []).forEach(function (g) { guardName[g.key] = g.name; });
      var guardTotal = (d.guardians || []).length;
      function guardChips(it) {
        if (!isEquip(it) || !guardTotal) return null;
        var gs = it.guardians;
        if (!gs) return '<span class="job job--all">모든 가디언</span>';
        if (!gs.length) return '<span class="dim small">없음</span>';
        if (gs.length >= guardTotal - 3) {
          var no = (d.guardians || []).filter(function (g) { return gs.indexOf(g.key) < 0; });
          return '<span class="job job--all">대부분</span> <span class="dim small">' + no.map(function (g) { return esc(g.name); }).join("·") + " 제외</span>";
        }
        return gs.map(function (k) { return '<span class="job job--guard">' + esc(guardName[k] || k) + "</span>"; }).join(" ");
      }
      function jobLine(it) {
        var c = jobChips(it), g = guardChips(it);
        return (c ? '<p class="item__jobs"><span class="pixel">착용</span> ' + c + "</p>" : "") +
          (g ? '<p class="item__jobs"><span class="pixel">가디언</span> ' + g + "</p>" : "");
      }
      function recipe(r) {
        if (!r || !r.materials || !r.materials.length) return "";
        var mats = r.materials.map(function (m) { return esc(m.name) + (m.count > 1 ? " ×" + m.count : ""); });
        if (r.gold) mats.push(r.gold.toLocaleString() + "이드");
        return '<p class="recipe"><span class="pixel">만드는 법</span> ' + mats.join(", ") + (r.by ? ' <span class="dim">· ' + esc(r.by) + "</span>" : "") + "</p>";
      }
      function maxLine(it) {
        return it.maxDesc ? '<p style="font-size:.85rem"><span class="pixel" style="font-size:.74rem;color:var(--gold)">+' + it.maxPlus + " 강화</span> " + esc(it.maxDesc) + "</p>" : "";
      }
      // ── 설명을 나눠 보이기 (운영 지시 #160): 한 줄 소개 · 특성 칩(누르면 풀이) · ◆효과 칩 · 얻는 곳 요약. 이름이나 칩을 누르면 자세히 창 ──
      var byId = {};
      d.categories.forEach(function (c) { c.items.forEach(function (it) { byId[it.id] = it; }); });
      function introOf(it) { return it.intro != null ? it.intro : it.desc; }
      function specChips(it) {
        if (!it.specs || !it.specs.length) return "";
        return '<span class="specs">' + it.specs.map(function (s) {
          return '<span class="spec' + (s.tip ? "" : " spec--plain") + '"' + (s.tip ? ' title="' + esc(s.tip) + '"' : "") + ">" + esc(s.t) + "</span>";
        }).join("") + "</span>";
      }
      var FX_CLS = { "전용": "fx--own", "기술": "fx--skill", "일반": "fx--gen" };
      function fxChips(it) {
        if (!it.effects || !it.effects.length) return "";
        return '<span class="fxs">' + it.effects.map(function (f) {
          return '<button type="button" class="fx ' + (FX_CLS[f.kind] || "") + '" data-item="' + it.id + '" data-sec="fx" title="' + esc(f.text) + '">◆' +
            (f.kind === "기술" ? "기술 " : "") + esc(f.name) + "</button>";
        }).join("") + "</span>";
      }
      function srcBrief(it) {
        var out = [], dr = dropSrc(it);
        if (dr.length) out.push("드롭 " + esc(dr[0].name) + " " + dr[0].prob + "%" + (dr.length > 1 ? " 외 " + (dr.length - 1) : ""));
        (it.sources || []).forEach(function (s) { out.push(esc(s.kind) + " " + esc(s.places[0]) + (s.places.length > 1 ? " 외 " + (s.places.length - 1) : "")); });
        if (recipes[it.id]) out.push("제작");
        if (!out.length && it.note) out.push(esc(it.note.length > 40 ? it.note.slice(0, 40) + "…" : it.note));
        return out.length ? '<span class="src-brief"><span class="pixel">얻는 곳</span> ' + out.join(" · ") + "</span>" : "";
      }
      function moreBtn(it, label) {
        return '<button type="button" class="item-more" data-item="' + it.id + '">' + (label || "자세히") + "</button>";
      }
      function card(it) {
        return '<article class="item win win--plain"><h3><button type="button" class="item-name" data-item="' + it.id + '">' + esc(it.name) + "</button> " + badge(it.grade) + " " + handChip(it) +
          (it.maxPlus ? ' <span class="dim pixel" style="font-size:.7rem">+' + it.maxPlus + "까지 강화</span>" : "") + "</h3>" +
          (it.job ? '<p class="pixel" style="font-size:.74rem;color:var(--gold)">' + esc(it.job) + " 마스터</p>" : "") +
          "<p>" + esc(introOf(it)) + "</p>" + stats(it.stats) + specChips(it) + fxChips(it) + jobLine(it) +
          '<p class="item__foot">' + srcBrief(it) + moreBtn(it) + "</p></article>";
      }

      // ── 자세히 창 ──
      var STAT_NAME = { atk: "공격", def: "방어", spi: "정신", agi: "민첩" };
      var idlg = document.createElement("dialog");
      idlg.className = "map-dlg item-dlg win";
      idlg.setAttribute("aria-labelledby", "item-dlg-title");
      document.body.appendChild(idlg);
      function sec(title, body) { return body ? '<section class="idlg__sec"><h3 class="pixel">' + title + "</h3>" + body + "</section>" : ""; }
      function detail(it) {
        var st = it.stats || {};
        var statRows = Object.keys(STAT_NAME).filter(function (k) { return st[k]; }).map(function (k) {
          return '<span class="idlg__stat"><span class="dim">' + STAT_NAME[k] + '</span> <b class="pixel">' + (st[k] > 0 ? "+" : "") + st[k] + "</b></span>";
        }).join("");
        var stats = statRows ? '<div class="idlg__stats">' + statRows + "</div>" : "";
        if (it.maxDesc) stats += '<p class="idlg__max"><span class="pixel gold">+' + it.maxPlus + " 강화</span> " + esc(it.maxDesc) + "</p>";
        var specs = (it.specs || []).map(function (s) {
          return "<li><span class=\"spec" + (s.tip ? "" : " spec--plain") + '">' + esc(s.t) + "</span> " + (s.tip ? esc(s.tip) : "") + "</li>";
        }).join("");
        var fx = (it.effects || []).map(function (f, i) {
          var mx = it.effectsMax && it.effectsMax[i] && it.effectsMax[i].text !== f.text ? it.effectsMax[i] : null;
          return '<li class="idlg__fx"><p><span class="fx ' + (FX_CLS[f.kind] || "") + '">◆' + esc(f.name) + '</span> <span class="fx-kind pixel">' +
            esc({ "전용": "전용 효과", "기술": "전용 기술", "일반": "일반 효과" }[f.kind] || f.kind) + "</span></p><p>" + esc(f.text) + "</p>" +
            (mx ? '<p class="idlg__max"><span class="pixel gold">+' + it.maxPlus + " 강화</span> " + esc(mx.text) + "</p>" : "") + "</li>";
        }).join("");
        var drops = dropSrc(it).map(function (s) {
          return "<tr><td><a href=\"" + esc(s.href) + '">' + esc(s.name) + "</a>" + (s.boss ? ' <span class="pixel small dim">보스</span>' : "") + '</td><td class="num">' + s.prob + "%</td><td>" +
            esc(s.region) + "</td><td>" + (s.map ? '<a class="pixel small" href="' + esc(s.map) + '">맵에서 보기</a>' : "") + "</td></tr>";
        }).join("");
        var where = (drops ? '<div class="table-scroll"><table class="table idlg__drops"><thead><tr><th>드롭 몬스터</th><th class="num">확률</th><th>사냥터</th><th></th></tr></thead><tbody>' + drops + "</tbody></table></div>" : "") +
          (it.sources || []).map(function (s) {
            return '<p class="idlg__src"><span class="pixel gold">' + esc(s.kind) + "</span> " + s.places.map(esc).join(", ") + "</p>";
          }).join("") + recipe(recipes[it.id]) + (it.note ? '<p class="idlg__note"><span class="pixel gold">참고</span> ' + esc(it.note) + "</p>" : "");
        var jobs = jobChips(it);
        idlg.innerHTML = '<div class="map-dlg__head"><h2 id="item-dlg-title">' + esc(it.name) + " " + badge(it.grade) + " " + handChip(it) +
          (it.maxPlus ? ' <span class="dim pixel" style="font-size:.7rem">+' + it.maxPlus + "까지 강화</span>" : "") + "</h2>" +
          '<button type="button" class="map-dlg__close" aria-label="닫기">×</button></div>' +
          (it.job ? '<p class="pixel gold small">' + esc(it.job) + " 마스터</p>" : "") +
          '<p class="idlg__intro">' + esc(introOf(it)) + "</p>" + stats +
          sec("특성", specs ? '<ul class="idlg__specs">' + specs + "</ul>" : "") +
          sec("특수 효과", fx ? '<ul class="idlg__fxs">' + fx + "</ul>" + (it.maxPlus && it.effects.some(function (f) { return f.kind === "전용"; }) ? '<p class="dim small">전용 효과는 강화 한 단계마다 확률과 수치가 10%씩 커진다.</p>' : "") : "") +
          sec("착용", jobs ? '<p class="item__jobs">' + jobs + "</p>" : "") +
          sec("착용 가디언", guardChips(it) ? '<p class="item__jobs">' + guardChips(it) + "</p>" : "") +
          sec("얻는 곳", where || '<p class="dim">아직 정리되지 않았다.</p>');
      }
      function openItem(id, focus) {
        var it = byId[id];
        if (!it) return;
        detail(it);
        if (idlg.showModal) { if (!idlg.open) idlg.showModal(); } else idlg.setAttribute("open", "");
        idlg.scrollTop = 0;
        if (focus === "fx") { var f = idlg.querySelector(".idlg__fxs"); if (f) f.scrollIntoView({ block: "nearest" }); }
        if (history.replaceState) history.replaceState(null, "", "#item-" + id);
      }
      function closeItem() {
        if (idlg.close) idlg.close(); else idlg.removeAttribute("open");
      }
      idlg.addEventListener("close", function () { if (/^#item-/.test(location.hash) && history.replaceState) history.replaceState(null, "", location.pathname + location.search); });
      idlg.addEventListener("click", function (e) {
        if (e.target === idlg || e.target.closest(".map-dlg__close")) closeItem();
      });
      iEl.addEventListener("click", function (e) {
        if (e.target.closest("a") || e.target.closest("th")) return;
        var b = e.target.closest("[data-item]");
        if (b) { openItem(+b.dataset.item, b.dataset.sec); return; }
        var tr = e.target.closest('tr[id^="row-"]');     // 리스트에서는 줄 아무 데나 눌러도 연다
        if (tr && !window.getSelection().toString()) openItem(+tr.id.slice(4));
      });
      document.getElementById("grades").innerHTML = d.grades.map(function (g) {
        return "<tr><th>" + badge(g.key) + "</th><td>" + esc(g.desc) + "</td></tr>";
      }).join("") + "<tr><th>" + badge("god") + "</th><td>엔딩 뒤에 얻는 장비.</td></tr>";
      document.getElementById("upgrade").textContent = d.upgrade.desc;
      var tabs = document.getElementById("item-tabs");
      var q = document.getElementById("item-q");
      var cur = "all";
      var sort = { key: null, dir: 1 };
      var gradeSel = document.getElementById("item-grade");
      var jobSel = document.getElementById("item-job");
      var handSel = document.getElementById("item-hand");
      var catSel = document.getElementById("item-cat");
      handSel.innerHTML = '<option value="">한손·양손</option><option value="one">한손 무기</option><option value="two">양손 무기</option>';
      gradeSel.innerHTML = '<option value="">모든 등급</option>' + d.grades.map(function (g) {
        return '<option value="' + esc(g.key) + '">' + esc(g.name) + "</option>";
      }).join("") + '<option value="god">신급</option>';
      jobSel.innerHTML = '<option value="">모든 직업</option>' + (d.jobs || []).map(function (j) {
        return '<option value="' + esc(j.key) + '">' + esc(j.name) + " 착용</option>";
      }).join("") + (d.guardians && d.guardians.length ? '<optgroup label="가디언">' + d.guardians.map(function (g) {
        return '<option value="g' + esc(g.key) + '">' + esc(g.name) + " 착용</option>";
      }).join("") + "</optgroup>" : "");
      var rank = {};
      d.grades.forEach(function (g, i) { rank[g.key] = i; });
      rank.god = 99;
      var GRADE_CATS = { craft: 1, master: 1, god: 1 };
      var parts = d.categories.filter(function (c) { return !GRADE_CATS[c.key]; });
      var total = d.categories.filter(function (c) { return c.key !== "craft" && c.key !== "master"; }).reduce(function (n, c) { return n + c.items.length; }, 0);
      tabs.innerHTML = [{ key: "all", name: "전체", items: { length: total } }].concat(parts).map(function (c) {
        return '<button type="button" role="tab" aria-selected="false" data-k="' + c.key + '">' + esc(c.name) + " <span class=\"dim\">" + c.items.length + "</span></button>";
      }).join("");
      catSel.innerHTML = [{ key: "all", name: "모든 부위" }].concat(parts).map(function (c) {
        return '<option value="' + esc(c.key) + '">' + esc(c.name) + "</option>";
      }).join("");
      function secret(r) { return false; }
      function stat(k) {
        return { key: k, label: { atk: "공", def: "방", spi: "정", agi: "민" }[k], num: true, right: true,
          get: function (r) { return secret(r) || !r.it.stats || !r.it.stats[k] ? null : r.it.stats[k]; },
          html: function (r) { return secret(r) ? dash() : dash(r.it.stats && r.it.stats[k]); } };
      }
      var cols = [
        { key: "name", label: "이름", wide: true, get: function (r) { return secret(r) ? null : r.it.name; },
          html: function (r) {
            var it = r.it;
            if (secret(r)) return "???";
            return '<button type="button" class="item-name" data-item="' + it.id + '"><strong>' + esc(it.name) + "</strong></button> " + handChip(it) + (it.maxPlus ? ' <span class="dim pixel small">+' + it.maxPlus + "까지</span>" : "") +
              (it.job ? '<br><span class="pixel small gold">' + esc(it.job) + " 마스터</span>" : "");
          } },
        { key: "grade", label: "등급", num: true, get: function (r) { return rank[r.it.grade] == null ? 0 : rank[r.it.grade]; }, html: function (r) { return badge(r.it.grade); } },
        { key: "cat", label: "분류", get: function (r) { return r.cat; }, html: function (r) { return esc(r.cat); } },
        stat("atk"), stat("def"), stat("spi"), stat("agi"),
        { key: "price", label: "가격", num: true, right: true, get: function (r) { return secret(r) || !r.it.price ? null : r.it.price; },
          html: function (r) { return secret(r) || !r.it.price ? dash() : r.it.price.toLocaleString(); } },
        { key: "jobs", label: "착용", sort: false, wide: true,
          html: function (r) {
            if (secret(r)) return "";
            var g = guardChips(r.it);
            return (jobChips(r.it) || "") + (g ? '<br><span class="pixel small dim">가디언</span> ' + g : "");
          } },
        { key: "desc", label: "설명", sort: false, wide: true,
          html: function (r) {
            if (secret(r)) return "엔딩 뒤에야 모습을 드러내는 장비.";
            return esc(introOf(r.it)) + specChips(r.it) + fxChips(r.it) + srcBrief(r.it);
          } }
      ];
      bindSort(iEl, cols, sort, render);
      function render() {
        var word = q.value.trim().toLowerCase();
        var rows = [];
        var seen = {};
        var pool = cur === "all";
        // 한손·양손은 부위가 무기일 때만 뜻이 있다
        handSel.hidden = cur !== "weapon";
        if (handSel.hidden) handSel.value = "";
        catSel.value = cur;
        // 신급(비밀) 장비는 부위가 없어 전체에서만 보인다
        parts.concat(d.categories.filter(function (c) { return c.key === "god"; })).forEach(function (c) {
          if (!pool && c.key !== cur) return;
          c.items.forEach(function (it) {
            if (pool) { if (seen[it.id]) return; seen[it.id] = 1; }
            if (gradeSel.value && it.grade !== gradeSel.value) return;
            if (jobSel.value) {
              var gk = jobSel.value.charAt(0) === "g" ? jobSel.value.slice(1) : null;
              var ks = gk ? it.guardians : it.jobs;
              if (!isEquip(it) || (ks && ks.indexOf(gk || jobSel.value) < 0)) return;
            }
            if (handSel.value && !!it.twoHanded !== (handSel.value === "two")) return;
            if (word && ((it.name + " " + (it.desc || "") + " " + (it.job || "") + " " + dropSrc(it).map(function (s) { return s.name + " " + s.region; }).join(" ") + " " +
                (it.effects || []).map(function (f) { return f.name + " " + f.text; }).join(" ") + " " + (it.sources || []).map(function (s) { return s.places.join(" "); }).join(" ") + " " + (it.note || "")).toLowerCase().indexOf(word) < 0)) return;
            rows.push({ it: it, cat: c.name });
          });
        });
        tabs.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.k === cur ? "true" : "false"); });
        document.getElementById("item-count").textContent = word ? "\"" + q.value.trim() + "\" " + rows.length + "개" : rows.length + "개";
        if (getView() === "list") {
          iEl.className = "item-table";
          iEl.innerHTML = dataTable(cols, sortRows(rows, cols, sort), sort, "data-table--item", function (r) { return secret(r) ? null : "row-" + r.it.id; });
        } else {
          iEl.className = "item-list";
          iEl.innerHTML = rows.slice(0, 400).map(function (r) { return card(r.it); }).join("") +
            (rows.length > 400 ? '<p class="dim">처음 400개만 보인다. 이름으로 찾거나 분류를 골라 보자.</p>' : "");
        }
      }
      tabs.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { cur = b.dataset.k; render(); } });
      catSel.addEventListener("change", function () { cur = catSel.value; render(); });
      q.addEventListener("input", render);
      enterSearch(q);
      gradeSel.addEventListener("change", render);
      jobSel.addEventListener("change", render);
      handSel.addEventListener("change", render);
      viewToggle(render);
      render();
      // items.html#item-<번호> 로 오면 그 아이템 창을 연다 (공유용)
      var hm = /^#item-(\d+)$/.exec(location.hash);
      if (hm) openItem(+hm[1]);
    });
  }

  // 드롭 목록. RPG2000 적은 드롭이 하나라 같은 이름의 변형들이 서로 다른 아이템을 떨군다 → 모아서 drops 로 온다
  function dropsOf(m) { return m.drops || (m.drop ? [m.drop] : []); }
  function dropName(dr) { return dr.god ? "???" : esc(dr.name); }
  function dropLine(m) {
    var ds = dropsOf(m);
    if (!ds.length) return "";
    return '<p class="drop pixel">드롭 ' + ds.map(function (dr) { return dropName(dr) + " " + dr.prob + "%"; }).join("<br>") + "</p>";
  }

  // 잘 안 걸리는 상태이상: st = [[확률, [이름…]], …] (30% 이하, 낮은 것부터). 0% = 안 걸림
  function stText(g) { return esc(g[1].join("·")) + " " + g[0] + "%"; }
  function stLine(m) {
    var st = m.st || [];
    if (!st.length) return "";
    return '<p class="resist pixel">잘 안 걸림 ' + st.map(stText).join("<br>") + "</p>";
  }

  // ── 몬스터 및 던전 ──
  var mEl = document.getElementById("regions");
  if (mEl) {
    load("monsters").then(function (d) {
      function bossCard(b) {
        if (b.secret) {
          return '<article class="boss-card boss-card--secret win"><div class="boss-card__img">' + (b.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(b.img)) + '" alt="" loading="lazy">' : "") +
            '</div><div><h3>???</h3><p class="t">???</p></div></article>';
        }
        return '<article class="boss-card win" id="' + esc(b._row.id) + '"><div class="boss-card__img">' + (b.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(b.img)) + '" alt="' + esc(b.name) + '" loading="lazy">' : "") + "</div>" +
          "<div><h3>" + esc(b.name) + '</h3><p class="t">' + esc(b.title || "") + "</p><p>" + esc(b.desc) + "</p>" +
          '<p class="pixel" style="font-size:.72rem">' + locBtn(b._row, b.where || "위치") + "</p>" +
          '<p class="pixel" style="font-size:.72rem;color:var(--ink)">HP ' + b.hp + " 공 " + b.atk + "</p>" + dropLine(b) + stLine(b) + "</div></article>";
      }
      var regionBy = {};
      d.regions.forEach(function (r) { regionBy[r.key] = r; });
      var q = document.getElementById("mob-q");
      var sel = document.getElementById("mob-region");
      var sort = { key: null, dir: 1 };
      sel.innerHTML = '<option value="">모든 지역</option>' + d.regions.filter(function (r) { return r.monsters.length || d.bosses.some(function (b) { return b.region === r.key; }); }).map(function (r) {
        return '<option value="' + esc(r.key) + '">' + esc(r.name) + "</option>";
      }).join("");
      document.getElementById("region-nav").innerHTML = d.regions.map(function (r) {
        return '<li><a href="#' + r.key + '">' + esc(r.name) + "</a></li>";
      }).join("");

      var kindSel = document.getElementById("mob-kind");
      var KIND = { normal: 0, leader: 1, boss: 2, secret: 3 };
      var KIND_NAME = ["일반", "리더", "보스", "???"];
      function kindOf(m, isBoss) { return m.secret ? 3 : isBoss || m.boss ? 2 : m.leader ? 1 : 0; }
      kindSel.innerHTML = '<option value="">모든 구분</option>' + KIND_NAME.slice(0, 3).map(function (n, i) {
        return '<option value="' + i + '">' + n + "</option>";
      }).join("");
      var all = [];
      d.regions.forEach(function (r) { r.monsters.forEach(function (m) { all.push({ m: m, region: r, kind: kindOf(m), id: monAnchor(m, r.key) }); }); });
      d.bosses.forEach(function (b) { all.push({ m: b, region: regionBy[b.region] || { key: "", name: "" }, kind: kindOf(b, true), id: monAnchor(b, null) }); });
      all.forEach(function (r, i) { r.i = i; r.m._row = r; });

      // ── 세계 지도에서 위치 보기 ──
      var PLACES = d.places || {};
      function hasPlaces(r) { return !r.m.secret && (r.m.places || []).length; }
      function locBtn(r, label) {
        if (!hasPlaces(r)) return esc(label);
        return '<button type="button" class="loc" data-loc="' + r.i + '" title="세계 지도에서 보기">' + esc(label) + "</button>";
      }
      var dlg = document.createElement("dialog");
      dlg.className = "map-dlg win";
      document.body.appendChild(dlg);
      function showMap(r) {
        var ps = (r.m.places || []).map(function (k) { return PLACES[k]; }).filter(Boolean);
        var on = ps.filter(function (p) { return p.x != null; });
        var off = ps.filter(function (p) { return p.x == null; });
        // 지도에 없는 곳은 들어가는 곳(via)에 점선 핀
        var pins = on.map(function (p) { return { p: p, label: p.tag ? p.name : "" }; }).concat(off.filter(function (p) { return PLACES[p.via]; }).map(function (p) {
          return { p: PLACES[p.via], label: p.name + " 입구", via: true };
        }));
        dlg.innerHTML = '<div class="map-dlg__head"><h2>' + esc(r.m.name) + ' <span class="dim pixel">' + esc(r.region.name) + '</span></h2>' +
          '<button type="button" class="map-dlg__close" aria-label="닫기">×</button></div>' +
          (pins.length ? '<div class="map-dlg__map"><img class="px" src="assets/img/pic/worldmap.png" alt="세계 지도">' + pins.map(function (x) {
            return '<span class="pin' + (x.via ? " pin--via" : "") + '" style="left:' + (x.p.x / 320 * 100) + "%;top:" + (x.p.y / 240 * 100) + '%">' +
              (x.label ? '<span class="pin__label pixel">' + esc(x.label) + "</span>" : "") + "</span>";
          }).join("") + "</div>" : "") +
          (on.length ? '<p class="map-dlg__where">' + on.map(function (p) { return esc(p.name); }).join(", ") + "</p>" : "") +
          off.map(function (p) { return '<p class="map-dlg__off"><strong>' + esc(p.name) + "</strong> <span class=\"dim\">" + esc(p.note || "지도에 없는 곳") + "</span></p>"; }).join("") +
          (/^m-/.test(r.id) && r.kind < 2 ? '<p class="map-dlg__where"><a href="spawns.html#' + r.id + '">맵에서 리젠 자리 보기 →</a></p>' : "");
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      }
      dlg.addEventListener("click", function (e) {
        // 바깥(배경)이나 닫기 단추를 누르면 닫는다
        if (e.target === dlg || e.target.closest(".map-dlg__close")) dlg.close ? dlg.close() : dlg.removeAttribute("open");
      });
      document.addEventListener("click", function (e) {
        var b = e.target.closest("button.loc");
        if (b) showMap(all[+b.dataset.loc]);
      });
      function hidden(r) { return r.m.secret; }
      function matches(r, word) {
        if (!word) return true;
        if (hidden(r)) return false;
        return [r.m.name || ""].concat(dropsOf(r.m).filter(function (dr) { return !dr.god; }).map(function (dr) { return dr.name; }))
          .join(" ").toLowerCase().indexOf(word) >= 0;
      }
      function num(k) {
        return { key: k, label: { hp: "HP", atk: "공", def: "방", spi: "정", agi: "민" }[k], num: true, right: true,
          get: function (r) { return hidden(r) || r.m[k] == null ? null : r.m[k]; },
          html: function (r) { return hidden(r) ? dash() : dash(r.m[k]); } };
      }
      var cols = [
        { key: "name", label: "이름", wide: true, get: function (r) { return hidden(r) ? null : r.m.name; },
          html: function (r) {
            var m = r.m;
            var img = m.img ? '<img class="px mon-thumb' + (m.secret ? " mon-thumb--secret" : "") + '" src="assets/img/monster/' + esc(imgName(m.img)) + '"' + (m.hue && !m.secret ? ' style="filter:hue-rotate(' + m.hue + 'deg)"' : "") + ' alt="" loading="lazy">' : "";
            return '<span class="mon-name"><span class="mon-box">' + img + "</span><strong>" + (hidden(r) ? "???" : esc(m.name)) + "</strong></span>";
          } },
        { key: "region", label: "지역", get: function (r) { return r.region.name; }, html: function (r) { return locBtn(r, r.region.name); } },
        { key: "kind", label: "구분", num: true, get: function (r) { return r.kind; }, html: function (r) { return '<span class="kind kind--' + r.kind + '">' + KIND_NAME[r.kind] + "</span>"; } },
        num("hp"), num("atk"), num("def"), num("spi"), num("agi"),
        { key: "drop", label: "드롭", wide: true, get: function (r) { var ds = dropsOf(r.m); return hidden(r) || !ds.length ? null : (ds[0].god ? "???" : ds[0].name); },
          html: function (r) {
            var ds = dropsOf(r.m);
            if (hidden(r) || !ds.length) return dash();
            return ds.map(function (dr) { return dropName(dr) + ' <span class="dim pixel small">' + dr.prob + "%</span>"; }).join("<br>");
          } },
        { key: "st", label: "잘 안 걸림", wide: true, get: function (r) { var st = r.m.st || []; return hidden(r) || !st.length ? null : st[0][0]; },
          html: function (r) {
            var st = r.m.st || [];
            if (hidden(r) || !st.length) return dash();
            return st.map(stText).join("<br>");
          } }
      ];
      var tEl = document.getElementById("mob-table");
      bindSort(tEl, cols, sort, render);

      function cards(word, regionKey, kind) {
        var byKind = kind !== "";
        return d.regions.map(function (r) {
          if (regionKey && r.key !== regionKey) return "";
          var bosses = d.bosses.filter(function (b) { return b.region === r.key && (!byKind || kindOf(b, true) === +kind) && matches({ m: b }, word); });
          var mobs = r.monsters.filter(function (m) { return (!byKind || kindOf(m) === +kind) && matches({ m: m }, word); });
          if ((word || byKind) && !bosses.length && !mobs.length) return "";
          return '<section class="region" id="' + r.key + '"><div class="region__head"><h2>' + esc(r.name) + "</h2><p>" + esc(r.desc) + "</p></div>" +
            (word || byKind ? "" : '<div class="dungeons">' + r.dungeons.map(function (g) {
              return '<article class="dungeon win win--plain"><h3>' + esc(g.name) + (g.floors ? ' <span class="dim pixel" style="font-size:.72rem">' + esc(g.floors) + "</span>" : "") + "</h3>" +
                "<p>" + esc(g.desc) + "</p>" + (g.boss ? '<p class="boss">보스 ' + esc(g.boss) + "</p>" : "") + "</article>";
            }).join("") + "</div>") +
            (bosses.length ? '<div class="bosses">' + bosses.map(bossCard).join("") + "</div>" : "") +
            (mobs.length ? '<div class="mobs">' + mobs.map(function (m) {
              return '<article class="mob' + (m.secret ? " mob--secret" : "") + (m.leader ? " mob--leader" : "") + '" id="' + esc(m._row.id) + '"><div class="mob__img">' + (m.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(m.img)) + '"' + (m.hue && !m.secret ? ' style="filter:hue-rotate(' + m.hue + 'deg)"' : "") + ' alt="" loading="lazy">' : "") + "</div>" +
                (m.leader ? '<p class="mob__tag pixel">리더</p>' : "") +
                "<h3>" + (m.secret ? "???" : esc(m.name)) + "</h3>" +
                (m.secret ? "<p>???</p>" : "<p>HP " + m.hp + " 공 " + m.atk + "</p>" + dropLine(m) + stLine(m) + (hasPlaces(m._row) ? '<p class="mob__loc">' + locBtn(m._row, "위치") + "</p>" : "")) + "</article>";
            }).join("") + "</div>" : "") + "</section>";
        }).join("");
      }

      function render() {
        var word = q.value.trim().toLowerCase();
        var regionKey = sel.value;
        var list = getView() === "list";
        var kind = kindSel.value;
        var rows = all.filter(function (r) { return (!regionKey || r.region.key === regionKey) && (kind === "" || r.kind === +kind) && matches(r, word); });
        document.getElementById("mob-count").textContent = rows.length + "마리";
        document.getElementById("region-nav").hidden = list || !!word || !!regionKey || kind !== "";
        tEl.hidden = !list;
        mEl.hidden = list;
        if (list) tEl.innerHTML = dataTable(cols, sortRows(rows, cols, sort), sort, "data-table--mob", function (r) { return r.id; });
        else mEl.innerHTML = cards(word, regionKey, kind) || '<p class="dim">찾는 몬스터가 없다.</p>';
      }
      q.addEventListener("input", render);
      enterSearch(q);
      sel.addEventListener("change", render);
      kindSel.addEventListener("change", render);
      viewToggle(render);
      render();
      // 아이템 쪽 드롭 링크(#m-지역-번호, #boss-번호)로 오면 그 몬스터로 가서 잠깐 빛나게 한다
      function goHash() {
        var key = decodeURIComponent(location.hash.slice(1));
        if (!key) return;
        var t = document.getElementById(key);
        if (!t && all.some(function (r) { return r.id === key; })) {
          q.value = ""; sel.value = ""; kindSel.value = "";
          render();
          t = document.getElementById(key);
        }
        if (!t) return;
        t.scrollIntoView({ block: "center" });
        t.classList.remove("is-target");
        void t.offsetWidth;
        t.classList.add("is-target");
      }
      goHash();
      window.addEventListener("hashchange", goHash);
    });
  }
})();
