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
    var vs = learn[id] || [];
    var pick = label || FIRST[id] || (vs[0] && vs[0].label);
    var v = vs.filter(function (x) { return x.label === pick; })[0] || vs[0] || { rows: [] };
    var tabs = $("c-learn-tabs");
    tabs.hidden = vs.length < 2;
    tabs.innerHTML = vs.length < 2 ? "" : vs.map(function (x) {
      return '<button type="button" aria-pressed="' + (x === v) + '" data-l="' + esc(x.label) + '">' + esc(x.label) + "</button>";
    }).join("");
    $("c-learn").innerHTML = v.rows.map(function (k) {
      return '<tr><td class="pixel">' + k.lv + "</td><th>" + esc(k.name) + '</th><td class="pixel">' + k.mp + '</td><td class="dim">' + esc(k.desc) + "</td></tr>";
    }).join("");
  }
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
    $("monster-info").hidden = p.id !== "monster";
    renderLearn(p.id);
    if (push) history.replaceState(null, "", "#" + p.id);
  }

  show(location.hash.slice(1), false);
  window.addEventListener("hashchange", function () { show(location.hash.slice(1), false); });
})();
