// 캐릭터 선택 화면: 초상화 격자에서 고르면 아래 창이 바뀐다. 주소 #<id> 로 바로 열 수 있다.
(function () {
  var people = [];
  CLASSES.forEach(function (c) {
    c.people.forEach(function (p) { people.push({ c: c, p: p }); });
  });

  var roster = document.getElementById("roster");
  people.forEach(function (x) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "pick pick--" + x.c.faction;
    b.setAttribute("role", "tab");
    b.dataset.id = x.p.id;
    b.title = x.p.name + " (" + x.c.name + ")";
    b.innerHTML = '<img src="assets/img/face/' + x.p.id + '.png" alt=""><span>' + x.p.name + "</span>";
    b.addEventListener("click", function () { show(x.p.id, true); });
    roster.appendChild(b);
  });

  function $(id) { return document.getElementById(id); }

  var learn = null;
  fetch("assets/data/skills.json").then(function (r) { return r.json(); }).then(function (d) {
    learn = d;
    renderLearn(current);
  });
  var current = null;
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // 그림과 같은 갈래를 먼저 보여 준다 (아이멜 얼음, 린도르 검)
  var FIRST = { wizard_f: "얼음", elf_m: "검" };
  function renderLearn(id, label) {
    current = id;
    if (!learn || !id) return;
    shown = {};
    var vs = learn[id] || [];
    var pick = label || FIRST[id] || (vs[0] && vs[0].label);
    var v = vs.filter(function (x) { return x.label === pick; })[0] || vs[0] || { rows: [] };
    var tabs = $("c-learn-tabs");
    tabs.hidden = vs.length < 2;
    tabs.innerHTML = vs.length < 2 ? "" : vs.map(function (x) {
      return '<button type="button" aria-pressed="' + (x === v) + '" data-l="' + esc(x.label) + '">' + esc(x.label) + "</button>";
    }).join("");
    // 승급 기술: 승급 이벤트가 주는 기술 전부 (검기·아머 블레스·메디테이션 같은 공통 기술 포함)
    if (v.promo && v.promo.length) {
      $("c-skills").innerHTML = v.promo.map(function (k) {
        return '<li><span class="pixel dim">' + k.step + "</span> " + skBtn(k, k.step + " 승급") + "</li>";
      }).join("");
    }
    $("c-learn").innerHTML = v.rows.map(function (k) {
      return '<tr><td class="pixel">' + k.lv + "</td><th>" + skBtn(k, "Lv" + k.lv) + '</th><td class="pixel">' + k.mp + '</td><td class="dim">' + esc(k.desc) + "</td></tr>";
    }).join("");
    // 퓨전의 방 융합·연마의 방 연마: 두 기술을 잊고 새 기술 하나
    var fu = v.fuse || [];
    $("c-fuse-box").hidden = !fu.length;
    $("c-fuse").innerHTML = fu.map(function (k) {
      return '<tr><td class="pixel">' + esc(k.kind) + "</td><th>" + skBtn(k, k.kind + " · " + k.from.join(" + ")) + '</th><td class="pixel">' + k.mp + '</td><td class="dim">' +
        esc(k.from.join(" + ")) + "<br>" + esc(k.desc) + "</td></tr>";
    }).join("");
  }
  // ── 기술 자세히 창: 승급 기술·레벨업 기술·융합 기술 이름을 누르면 성능을 보인다 (skills.json 의 _skills) ──
  var shown = {};   // 지금 그린 기술 번호 → { 이름, 설명, 얻는 때 }
  function skBtn(k, when) {
    if (k.id == null) return esc(k.name);
    shown[k.id] = { name: k.name, desc: k.desc, when: when };
    return '<button type="button" class="sk-name" data-sk="' + k.id + '">' + esc(k.name) + "</button>";
  }
  var dlg = document.createElement("dialog");
  dlg.className = "sk-dlg win";
  dlg.setAttribute("aria-labelledby", "sk-dlg-title");
  document.body.appendChild(dlg);
  function num(x) { return String(+x.toFixed(3)); }
  function skDetail(id) {
    var s = shown[id], f = (learn._skills || {})[id];
    if (!s || !f) return;
    var ally = f.scope && f.scope.indexOf("아군") === 0 || f.scope === "자신";
    var rows = [["종류", f.kind]];
    if (f.scope) rows.push(["대상", f.scope]);
    rows.push(["MP", typeof f.mp === "number" ? String(f.mp) : f.mp]);
    if (f.stats) {
      var pw = String(f.power);
      if (f.atk) pw += " + 공격력×" + num(f.atk);
      if (f.spi) pw += " + 정신력×" + num(f.spi);
      rows.push(["위력", pw]);
      rows.push(["효과", f.stats.map(function (x) {
        return x + (x === "HP" || x === "MP" ? (ally ? " 회복" : " 피해") : (ally ? " 상승" : " 하락"));
      }).join(" · ")]);
      if (f.var) rows.push(["편차", "±" + f.var + "%"]);
    }
    if (f.hit != null) rows.push(["명중", f.hit + "%"]);
    if (f.crit) rows.push(["치명", f.crit + "%"]);
    if (f.attrs) rows.push(["속성", f.attrs.join(" · ") + (f.attrMode ? " " + f.attrMode : "")]);
    if (f.states) rows.push(["상태 " + f.stateMode, f.states.join(" · ")]);
    if (f.absorb) rows.push(["흡수", "준 피해만큼 회복"]);
    if (f.pierce) rows.push(["방어 무시", "적 방어력을 보지 않음"]);
    dlg.innerHTML = '<div class="sk-dlg__head"><h2 id="sk-dlg-title">' + esc(s.name) + ' <span class="pixel dim">' + esc(s.when) + "</span></h2>" +
      '<button type="button" class="sk-dlg__close" aria-label="닫기">×</button></div>' +
      (s.desc ? '<p class="sk-dlg__desc">' + esc(s.desc) + "</p>" : "") +
      '<dl class="sk-dlg__rows">' + rows.map(function (r) {
        return "<div><dt class=\"pixel\">" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>";
      }).join("") + "</dl>";
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
  }
  function skClose() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg || e.target.closest(".sk-dlg__close")) skClose();
  });
  $("card").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sk]");
    if (b) skDetail(b.dataset.sk);
  });

  document.getElementById("c-learn-tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b) renderLearn(current, b.dataset.l);
  });

  function show(id, push) {
    var x = people.filter(function (y) { return y.p.id === id; })[0] || people[0];
    var c = x.c, p = x.p;
    roster.querySelectorAll(".pick").forEach(function (b) {
      var on = b.dataset.id === p.id;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    var card = $("card");
    card.dataset.faction = c.faction;
    var ill = $("c-illust");
    ill.src = "assets/img/illust/" + p.id + ".webp";
    ill.alt = p.name + ", " + p.titles[3] + " 일러스트";
    $("c-faction").className = "faction faction--" + c.faction;
    $("c-faction").textContent = c.faction === "light" ? "빛" : "어둠";
    $("c-class").textContent = c.name + (p.gender ? " (" + p.gender + ")" : "");
    $("c-steps-title").textContent = p.steps ? "진화" : "승급";
    $("c-skills-title").textContent = p.steps ? "각성 기술" : "승급 기술";
    $("c-name").textContent = p.name;
    $("c-master").textContent = (p.steps ? "각성 " : "마스터 ") + p.titles[3];
    $("c-concept").textContent = p.desc;
    $("c-steps").innerHTML = p.titles.map(function (t, i) {
      return '<li><img class="px" src="assets/img/sprite/' + p.id + "_" + i + '.png" alt="">' +
        '<span class="steps__no pixel">' + (p.steps || STEP_NAMES)[i] + "</span><span>" + t + "</span></li>";
    }).join("");
    $("c-skills").innerHTML = p.skills.map(function (s, i) {
      return "<li><span class=\"pixel dim\">" + (p.skillSteps ? p.skillSteps[i] : STEP_NAMES[i + 1]) + "</span> " + s + "</li>";
    }).join("");
    var max = [60, 60, 30, 30, 40, 40];
    $("c-stats").innerHTML = p.stats.map(function (v, i) {
      return "<div><dt class=\"pixel\">" + STAT_NAMES[i] + "</dt><dd><span class=\"bar\" style=\"--v:" +
        Math.min(1, v / max[i]).toFixed(3) + "\"></span><span class=\"pixel\">" + v + "</span></dd></div>";
    }).join("");
    $("evo").hidden = p.id !== "monster";
    renderLearn(p.id);
    if (push) history.replaceState(null, "", "#" + p.id);
  }

  show(location.hash.slice(1), false);
  window.addEventListener("hashchange", function () { show(location.hash.slice(1), false); });
})();
