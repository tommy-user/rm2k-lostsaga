// 가디언·아이템·몬스터 페이지: assets/data/*.json 을 읽어 그린다
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function load(name) { return fetch("assets/data/" + name + ".json").then(function (r) { return r.json(); }); }
  function imgName(path) { return path.split("/").pop().replace(/\.[^.]+$/, "") + ".png"; }

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
          "<p>" + esc(it.desc) + "</p>" + stats(it.stats) + recipe(recipes[it.id]) +
          (it.note ? '<p class="dim">' + esc(it.note) + "</p>" : "") + "</article>";
      }
      document.getElementById("grades").innerHTML = d.grades.filter(function (g) { return g.key !== "rare"; }).map(function (g) {
        return "<tr><th>" + badge(g.key) + "</th><td>" + esc(g.desc) + "</td></tr>";
      }).join("") + "<tr><th>" + badge("god") + "</th><td>???</td></tr>";
      document.getElementById("upgrade").textContent = d.upgrade.desc;
      var tabs = document.getElementById("item-tabs");
      var q = document.getElementById("item-q");
      var cur = d.categories[0].key;
      tabs.innerHTML = d.categories.map(function (c) {
        return '<button type="button" role="tab" aria-selected="false" data-k="' + c.key + '">' + esc(c.name) + " <span class=\"dim\">" + c.items.length + "</span></button>";
      }).join("");
      function render() {
        var word = q.value.trim();
        var list;
        if (word) {
          list = [];
          d.categories.forEach(function (c) {
            c.items.forEach(function (it) {
              if (it.grade !== "god" && (it.name.indexOf(word) >= 0 || (it.desc || "").indexOf(word) >= 0)) list.push(it);
            });
          });
        } else {
          list = d.categories.filter(function (x) { return x.key === cur; })[0].items;
        }
        tabs.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", !word && b.dataset.k === cur ? "true" : "false"); });
        document.getElementById("item-count").textContent = word ? "\"" + word + "\" " + list.length + "개" : list.length + "개";
        iEl.innerHTML = list.slice(0, 400).map(card).join("");
      }
      tabs.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { cur = b.dataset.k; q.value = ""; render(); } });
      q.addEventListener("input", render);
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
      document.getElementById("region-nav").innerHTML = d.regions.map(function (r) {
        return '<li><a href="#' + r.key + '">' + esc(r.name) + "</a></li>";
      }).join("");
      mEl.innerHTML = d.regions.map(function (r) {
        var bosses = d.bosses.filter(function (b) { return b.region === r.key; });
        return '<section class="region" id="' + r.key + '"><div class="region__head"><h2>' + esc(r.name) + "</h2><p>" + esc(r.desc) + "</p></div>" +
          '<div class="dungeons">' + r.dungeons.map(function (g) {
            return '<article class="dungeon win win--plain"><h3>' + esc(g.name) + (g.floors ? ' <span class="dim pixel" style="font-size:.72rem">' + esc(g.floors) + "</span>" : "") + "</h3>" +
              "<p>" + esc(g.desc) + "</p>" + (g.boss ? '<p class="boss">보스 ' + esc(g.boss) + "</p>" : "") + "</article>";
          }).join("") + "</div>" +
          (bosses.length ? '<div class="bosses">' + bosses.map(bossCard).join("") + "</div>" : "") +
          (r.monsters.length ? '<div class="mobs">' + r.monsters.map(function (m) {
            return '<article class="mob' + (m.secret ? " mob--secret" : "") + (m.leader ? " mob--leader" : "") + '"><div class="mob__img">' + (m.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(m.img)) + '"' + (m.hue && !m.secret ? ' style="filter:hue-rotate(' + m.hue + 'deg)"' : "") + ' alt="" loading="lazy">' : "") + "</div>" +
              (m.leader ? '<p class="mob__tag pixel">리더</p>' : "") +
              "<h3>" + (m.secret ? "???" : esc(m.name)) + "</h3>" +
              (m.secret ? "<p>???</p>" : "<p>HP " + m.hp + " 공 " + m.atk + "</p>" + dropLine(m.drop)) + "</article>";
          }).join("") + "</div>" : "") + "</section>";
      }).join("");
      if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    });
  }
})();
