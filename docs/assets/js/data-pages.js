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
      document.getElementById("hire").textContent = d.hire;
      gEl.innerHTML = d.guardians.map(function (g) {
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
      }).join("");
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
      document.getElementById("region-nav").innerHTML = d.regions.map(function (r) {
        return '<li><a href="#' + r.key + '">' + esc(r.name) + "</a></li>";
      }).join("") + '<li><a href="#bosses">보스</a></li>';
      mEl.innerHTML = d.regions.map(function (r) {
        return '<section class="region" id="' + r.key + '"><div class="region__head"><h2>' + esc(r.name) + "</h2><p>" + esc(r.desc) + "</p></div>" +
          '<div class="dungeons">' + r.dungeons.map(function (g) {
            return '<article class="dungeon win win--plain"><h3>' + esc(g.name) + (g.floors ? ' <span class="dim pixel" style="font-size:.72rem">' + esc(g.floors) + "</span>" : "") + "</h3>" +
              "<p>" + esc(g.desc) + "</p>" + (g.boss ? '<p class="boss">보스 ' + esc(g.boss) + "</p>" : "") + "</article>";
          }).join("") + "</div>" +
          '<div class="mobs">' + r.monsters.map(function (m) {
            return '<article class="mob' + (m.secret ? " mob--secret" : "") + '"><div class="mob__img">' + (m.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(m.img)) + '" alt="" loading="lazy">' : "") + "</div>" +
              "<h3>" + (m.secret ? "???" : esc(m.name)) + "</h3>" +
              (m.secret ? "<p>???</p>" : "<p>HP " + m.hp + " 공 " + m.atk + "</p>" + dropLine(m.drop)) + "</article>";
          }).join("") + "</div></section>";
      }).join("");
      document.getElementById("secret-list").innerHTML = d.bosses.filter(function (b) { return b.secret; }).map(function (b) {
        return '<article class="boss-card boss-card--secret win"><div class="boss-card__img">' + (b.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(b.img)) + '" alt="" loading="lazy">' : "") +
          '</div><div><h3>???</h3><p class="t">???</p></div></article>';
      }).join("");
      document.getElementById("bosses-list").innerHTML = d.bosses.filter(function (b) { return !b.secret; }).map(function (b) {
        return '<article class="boss-card win"><div class="boss-card__img">' + (b.img ? '<img class="px" src="assets/img/monster/' + esc(imgName(b.img)) + '" alt="' + esc(b.name) + '" loading="lazy">' : "") + "</div>" +
          "<div><h3>" + esc(b.name) + '</h3><p class="t">' + esc(b.title || "") + "</p><p>" + esc(b.desc) + "</p>" +
          '<p class="pixel" style="font-size:.72rem">' + esc(b.where || "") + "</p>" +
          '<p class="pixel" style="font-size:.72rem;color:var(--ink)">HP ' + b.hp + " 공 " + b.atk + "</p>" + dropLine(b.drop) + "</div></article>";
      }).join("");
      if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    });
  }
})();
