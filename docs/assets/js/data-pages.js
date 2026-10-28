// 가디언·아이템·몬스터 페이지: assets/data/*.json 을 읽어 그린다
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function load(name) { return fetch("assets/data/" + name + ".json").then(function (r) { return r.json(); }); }
  function imgName(path) { return path.split("/").pop().replace(/\.[^.]+$/, "") + ".png"; }

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
  function dataTable(cols, rows, sort, cls) {
    var head = cols.map(function (c) {
      if (c.sort === false) return '<th class="' + (c.wide ? "wide" : "") + '">' + c.label + "</th>";
      var on = sort.key === c.key;
      return '<th class="' + (c.right ? "num" : "") + '" aria-sort="' + (on ? (sort.dir > 0 ? "ascending" : "descending") : "none") + '">' +
        '<button type="button" data-sort="' + c.key + '">' + c.label + '<span aria-hidden="true">' + (on ? (sort.dir > 0 ? " ▲" : " ▼") : "") + "</span></button></th>";
    }).join("");
    var body = rows.map(function (r) {
      return "<tr>" + cols.map(function (c) {
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
      tabs.addEventListener("click", function (e) {
        var btn = e.target.closest("button");
        if (!btn) return;
        var isB = btn.dataset.k === "bertz";
        tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x === btn ? "true" : "false"); });
        gEl.hidden = isB;
        bEl.hidden = !isB;
        document.getElementById("hire-title").hidden = isB;
        hireEl.hidden = isB;
      });
    });
  }

  // ── 아이템 ──
  var iEl = document.getElementById("items");
  if (iEl) {
    Promise.all([load("items"), load("recipes").catch(function () { return {}; })]).then(function (res) {
      var d = res[0], recipes = res[1];
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
      function jobLine(it) {
        var c = jobChips(it);
        return c ? '<p class="item__jobs"><span class="pixel">착용</span> ' + c + "</p>" : "";
      }
      function recipe(r) {
        if (!r || !r.materials || !r.materials.length) return "";
        var mats = r.materials.map(function (m) { return esc(m.name) + (m.count > 1 ? " ×" + m.count : ""); });
        if (r.gold) mats.push(r.gold.toLocaleString() + "이드");
        return '<p class="recipe"><span class="pixel">만드는 법</span> ' + mats.join(", ") + (r.by ? ' <span class="dim">· ' + esc(r.by) + "</span>" : "") + "</p>";
      }
      function card(it) {
        if (it.grade === "god") {
          return '<article class="item item--secret win win--plain"><h3>??? ' + badge("god") + "</h3><p>엔딩 뒤에야 모습을 드러내는 장비.</p></article>";
        }
        return '<article class="item win win--plain"><h3>' + esc(it.name) + " " + badge(it.grade) +
          (it.maxPlus ? ' <span class="dim pixel" style="font-size:.7rem">+' + it.maxPlus + "까지 강화</span>" : "") + "</h3>" +
          (it.job ? '<p class="pixel" style="font-size:.74rem;color:var(--gold)">' + esc(it.job) + " 마스터</p>" : "") +
          "<p>" + esc(it.desc) + "</p>" + stats(it.stats) + jobLine(it) + recipe(recipes[it.id]) +
          (it.note ? '<p class="dim">' + esc(it.note) + "</p>" : "") + "</article>";
      }
      document.getElementById("grades").innerHTML = d.grades.filter(function (g) { return g.key !== "rare"; }).map(function (g) {
        return "<tr><th>" + badge(g.key) + "</th><td>" + esc(g.desc) + "</td></tr>";
      }).join("") + "<tr><th>" + badge("god") + "</th><td>???</td></tr>";
      document.getElementById("upgrade").textContent = d.upgrade.desc;
      var tabs = document.getElementById("item-tabs");
      var q = document.getElementById("item-q");
      var cur = "all";
      var sort = { key: null, dir: 1 };
      var gradeSel = document.getElementById("item-grade");
      var jobSel = document.getElementById("item-job");
      gradeSel.innerHTML = '<option value="">모든 등급</option>' + d.grades.filter(function (g) { return g.key !== "rare"; }).map(function (g) {
        return '<option value="' + esc(g.key) + '">' + esc(g.name) + "</option>";
      }).join("");
      jobSel.innerHTML = '<option value="">모든 직업</option>' + (d.jobs || []).map(function (j) {
        return '<option value="' + esc(j.key) + '">' + esc(j.name) + " 착용</option>";
      }).join("");
      var rank = {};
      d.grades.forEach(function (g, i) { rank[g.key] = i; });
      rank.god = 99;
      var total = d.categories.reduce(function (n, c) { return n + c.items.length; }, 0);
      tabs.innerHTML = [{ key: "all", name: "전체", items: { length: total } }].concat(d.categories).map(function (c) {
        return '<button type="button" role="tab" aria-selected="false" data-k="' + c.key + '">' + esc(c.name) + " <span class=\"dim\">" + c.items.length + "</span></button>";
      }).join("");
      function secret(r) { return r.it.grade === "god"; }
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
            return "<strong>" + esc(it.name) + "</strong>" + (it.maxPlus ? ' <span class="dim pixel small">+' + it.maxPlus + "까지</span>" : "") +
              (it.job ? '<br><span class="pixel small gold">' + esc(it.job) + " 마스터</span>" : "");
          } },
        { key: "grade", label: "등급", num: true, get: function (r) { return rank[r.it.grade] == null ? 0 : rank[r.it.grade]; }, html: function (r) { return badge(r.it.grade); } },
        { key: "cat", label: "분류", get: function (r) { return r.cat; }, html: function (r) { return esc(r.cat); } },
        stat("atk"), stat("def"), stat("spi"), stat("agi"),
        { key: "price", label: "가격", num: true, right: true, get: function (r) { return secret(r) || !r.it.price ? null : r.it.price; },
          html: function (r) { return secret(r) || !r.it.price ? dash() : r.it.price.toLocaleString(); } },
        { key: "jobs", label: "착용", sort: false, wide: true,
          html: function (r) { return secret(r) ? "" : jobChips(r.it) || ""; } },
        { key: "desc", label: "설명", sort: false, wide: true,
          html: function (r) {
            if (secret(r)) return "엔딩 뒤에야 모습을 드러내는 장비.";
            return esc(r.it.desc) + (r.it.note ? '<br><span class="dim">' + esc(r.it.note) + "</span>" : "") + recipe(recipes[r.it.id]);
          } }
      ];
      bindSort(iEl, cols, sort, render);
      function render() {
        var word = q.value.trim().toLowerCase();
        var rows = [];
        var seen = {};
        var pool = word || cur === "all";
        // 제작 분류는 다른 분류 아이템과 겹치므로, 전체·검색에서는 뒤로 미뤄 한 번만 보이게 한다
        d.categories.filter(function (c) { return c.key !== "craft"; }).concat(d.categories.filter(function (c) { return c.key === "craft"; })).forEach(function (c) {
          if (!pool && c.key !== cur) return;
          c.items.forEach(function (it) {
            if (pool) { if (seen[it.id]) return; seen[it.id] = 1; }
            if (gradeSel.value && it.grade !== gradeSel.value) return;
            if (jobSel.value && (!isEquip(it) || (it.jobs && it.jobs.indexOf(jobSel.value) < 0))) return;
            if (word && (it.grade === "god" || (it.name + " " + (it.desc || "") + " " + (it.job || "")).toLowerCase().indexOf(word) < 0)) return;
            rows.push({ it: it, cat: c.name });
          });
        });
        tabs.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", !word && b.dataset.k === cur ? "true" : "false"); });
        document.getElementById("item-count").textContent = word ? "\"" + q.value.trim() + "\" " + rows.length + "개" : rows.length + "개";
        if (getView() === "list") {
          iEl.className = "item-table";
          iEl.innerHTML = dataTable(cols, sortRows(rows, cols, sort), sort, "data-table--item");
        } else {
          iEl.className = "item-list";
          iEl.innerHTML = rows.slice(0, 400).map(function (r) { return card(r.it); }).join("") +
            (rows.length > 400 ? '<p class="dim">처음 400개만 보인다. 이름으로 찾거나 분류를 골라 보자.</p>' : "");
        }
      }
      tabs.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { cur = b.dataset.k; q.value = ""; render(); } });
      q.addEventListener("input", render);
      gradeSel.addEventListener("change", render);
      jobSel.addEventListener("change", render);
      viewToggle(render);
      render();
    });
  }

  function dropLine(dr) {
    if (!dr) return "";
    return '<p class="drop pixel">드롭 ' + (dr.god ? "???" : esc(dr.name)) + " " + dr.prob + "%</p>";
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
        return '<article class="boss-card win"><div class="boss-card__img">' + (b.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(b.img)) + '" alt="' + esc(b.name) + '" loading="lazy">' : "") + "</div>" +
          "<div><h3>" + esc(b.name) + '</h3><p class="t">' + esc(b.title || "") + "</p><p>" + esc(b.desc) + "</p>" +
          '<p class="pixel" style="font-size:.72rem">' + esc(b.where || "") + "</p>" +
          '<p class="pixel" style="font-size:.72rem;color:var(--ink)">HP ' + b.hp + " 공 " + b.atk + "</p>" + dropLine(b.drop) + "</div></article>";
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
      d.regions.forEach(function (r) { r.monsters.forEach(function (m) { all.push({ m: m, region: r, kind: kindOf(m) }); }); });
      d.bosses.forEach(function (b) { all.push({ m: b, region: regionBy[b.region] || { key: "", name: "" }, kind: kindOf(b, true) }); });
      function hidden(r) { return r.m.secret; }
      function matches(r, word) {
        if (!word) return true;
        if (hidden(r)) return false;
        var dr = r.m.drop;
        return ((r.m.name || "") + " " + (dr && !dr.god ? dr.name : "")).toLowerCase().indexOf(word) >= 0;
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
        { key: "region", label: "지역", get: function (r) { return r.region.name; }, html: function (r) { return esc(r.region.name); } },
        { key: "kind", label: "구분", num: true, get: function (r) { return r.kind; }, html: function (r) { return '<span class="kind kind--' + r.kind + '">' + KIND_NAME[r.kind] + "</span>"; } },
        num("hp"), num("atk"), num("def"), num("spi"), num("agi"),
        { key: "drop", label: "드롭", wide: true, get: function (r) { return hidden(r) || !r.m.drop ? null : (r.m.drop.god ? "???" : r.m.drop.name); },
          html: function (r) {
            var dr = r.m.drop;
            if (hidden(r) || !dr) return dash();
            return (dr.god ? "???" : esc(dr.name)) + ' <span class="dim pixel small">' + dr.prob + "%</span>";
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
              return '<article class="mob' + (m.secret ? " mob--secret" : "") + (m.leader ? " mob--leader" : "") + '"><div class="mob__img">' + (m.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(m.img)) + '"' + (m.hue && !m.secret ? ' style="filter:hue-rotate(' + m.hue + 'deg)"' : "") + ' alt="" loading="lazy">' : "") + "</div>" +
                (m.leader ? '<p class="mob__tag pixel">리더</p>' : "") +
                "<h3>" + (m.secret ? "???" : esc(m.name)) + "</h3>" +
                (m.secret ? "<p>???</p>" : "<p>HP " + m.hp + " 공 " + m.atk + "</p>" + dropLine(m.drop)) + "</article>";
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
        if (list) tEl.innerHTML = dataTable(cols, sortRows(rows, cols, sort), sort, "data-table--mob");
        else mEl.innerHTML = cards(word, regionKey, kind) || '<p class="dim">찾는 몬스터가 없다.</p>';
      }
      q.addEventListener("input", render);
      sel.addEventListener("change", render);
      kindSel.addEventListener("change", render);
      viewToggle(render);
      render();
      if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    });
  }
})();
