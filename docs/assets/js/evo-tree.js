// 캐릭터 쪽 몬스터의 진화 트리 (운영 지시 #227). 데이터는 assets/data/evo.json (scripts/site/build_evo.py 가 진화 공통 이벤트에서 뽑음)
// 형태를 누르면 거쳐 오는 길과 이어지는 길이 밝아지고, 오른쪽 창에 조건·능력치·기술이 보인다.
(function () {
  var map = document.getElementById("evo-map");
  var info = document.getElementById("evo-info");
  if (!map) return;

  // 자리: [열, 줄]. 열 = 시작·Lv5·Lv10·Lv20·Lv30·Lv40·Lv45·각성
  var POS = {
    "슬라임": [0, 3.5],
    "오크": [1, 2], "좀비": [1, 5],
    "오크로드": [2, 0.5], "하피": [2, 2.1], "고스트": [2, 3.9], "스켈레톤": [2, 5.5],
    "오크나이트": [3, 0.5], "뱀파이어": [3, 3], "스켈톤워리어": [3, 5.5],
    "오크마스터": [4, 0.5], "뱀파이어로드": [4, 3], "스켈톤나이트": [4, 5.5],
    "쉐도우": [5, 1.5], "다크마스터": [5, 4.6],
    "나이트마스터": [6, 0.55], "드래곤마스터": [6, 2.75],
    "데스나이트": [7, 0], "다크나이트": [7, 1.1], "슬레이어": [7, 2.2], "하프드래곤": [7, 3.3],
    "엘더리치": [7, 4.5], "카오스마스터": [7, 5.6]
  };
  var COLS = ["시작", "Lv5", "Lv10", "Lv20", "Lv30", "Lv40", "Lv45", "각성·마스터"];
  var COL = 94, ROW = 74, NW = 74, NH = 82, TOP = 26;
  var ORDER = ["HP", "MP", "공격", "방어", "정신", "민첩"];

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  fetch("assets/data/evo.json").then(function (r) { return r.json(); }).then(draw);

  function draw(d) {
    var nodes = {}, kids = {}, parents = {};
    d.nodes.forEach(function (n) { nodes[n.name] = n; kids[n.name] = []; parents[n.name] = []; });
    d.edges.forEach(function (e) { kids[e[0]].push(e[1]); parents[e[1]].push(e[0]); });
    var miss = d.nodes.filter(function (n) { return !POS[n.name]; });
    if (miss.length) console.warn("진화 트리 자리 없음:", miss.map(function (n) { return n.name; }));

    var maxRow = 0;
    Object.keys(POS).forEach(function (k) { maxRow = Math.max(maxRow, POS[k][1]); });
    var W = COL * (COLS.length - 1) + NW, H = TOP + ROW * maxRow + NH;
    map.style.width = W + "px";
    map.style.height = H + "px";

    function xy(name) { var p = POS[name]; return [p[0] * COL, TOP + p[1] * ROW]; }

    var html = COLS.map(function (c, i) {
      return '<span class="evo__col pixel" style="left:' + (i * COL) + "px;width:" + NW + 'px">' + c + "</span>";
    }).join("");
    var svg = '<svg class="evo__lines" width="' + W + '" height="' + H + '" aria-hidden="true">';
    d.edges.forEach(function (e, i) {
      if (!POS[e[0]] || !POS[e[1]]) return;
      var a = xy(e[0]), b = xy(e[1]);
      var x1 = a[0] + NW, y1 = a[1] + 36, x2 = b[0], y2 = b[1] + 36, m = (x2 - x1) / 2;
      svg += '<path data-e="' + i + '" d="M' + x1 + " " + y1 + " C" + (x1 + m) + " " + y1 + " " + (x2 - m) + " " + y2 + " " + x2 + " " + y2 + '"/>';
    });
    svg += "</svg>";
    html += svg;
    d.nodes.forEach(function (n) {
      if (!POS[n.name]) return;
      var p = xy(n.name);
      html += '<button type="button" class="evo__node' + (n.awaken ? " evo__node--awaken" : "") + (n.last ? " evo__node--last" : "") +
        '" data-n="' + esc(n.name) + '" style="left:' + p[0] + "px;top:" + p[1] + 'px">' +
        '<img class="px" src="assets/img/evo/' + n.img + '" alt=""><span>' + esc(n.name) + "</span></button>";
    });
    map.innerHTML = html;

    function walk(start, next) {
      var seen = {}, stack = [start];
      while (stack.length) {
        var k = stack.pop();
        if (seen[k]) continue;
        seen[k] = 1;
        next[k].forEach(function (x) { stack.push(x); });
      }
      return seen;
    }

    function pick(name) {
      var n = nodes[name];
      if (!n) return;
      var up = walk(name, parents), down = walk(name, kids);
      map.querySelectorAll(".evo__node").forEach(function (b) {
        var k = b.dataset.n;
        b.classList.toggle("is-on", k === name);
        b.classList.toggle("is-path", k !== name && !!(up[k] || down[k]));
        b.setAttribute("aria-pressed", k === name ? "true" : "false");
      });
      map.querySelectorAll("path").forEach(function (p) {
        var e = d.edges[+p.dataset.e];
        var on = (up[e[0]] && up[e[1]]) || (down[e[0]] && down[e[1]]);
        p.classList.toggle("on", !!on);
      });

      var from = parents[name];
      var cond = !from.length ? "처음 모습" :
        n.awaken ? from.join(", ") + " → 왕좌의 의식 (마스터 승급)" :
        "Lv" + n.lv + " · " + from.join(", ") + "에서";
      var stats = ORDER.filter(function (k) { return n.stats[k]; }).map(function (k) {
        return "<li>" + k + ' <b class="pixel">+' + n.stats[k] + "</b></li>";
      });
      if (n.speed) stats.push("<li>이동 속도 <b class=\"pixel\">" + (n.speed > 0 ? "+" : "") + n.speed + "</b></li>");
      var next = kids[name].map(function (k) {
        var c = nodes[k];
        return '<li><button type="button" data-n="' + esc(k) + '"><img class="px" src="assets/img/evo/' + c.img + '" alt="">' +
          esc(k) + ' <span class="pixel dim">' + (c.awaken ? "각성" : "Lv" + c.lv) + "</span></button></li>";
      });
      info.innerHTML =
        '<div class="evo__who"><img class="px" src="assets/img/evo/' + n.img + '" alt=""><div>' +
        '<h3>' + esc(n.name) + "</h3>" +
        '<p class="pixel">' + esc(cond) + "</p>" +
        (n.awaken ? '<span class="evo__tag evo__tag--awaken pixel">각성 = 마스터</span>' : n.last ? '<span class="evo__tag pixel">마지막 진화</span>' : "") +
        "</div></div>" +
        (stats.length ? '<h4 class="pixel">능력치</h4><ul class="evo__stats">' + stats.join("") + "</ul>" : "") +
        (n.skills.length ? '<h4 class="pixel">배우는 기술</h4><ul class="evo__skills">' + n.skills.map(function (s) {
          return "<li><b>" + esc(s.name) + "</b>" + (s.desc ? '<span class="dim">' + esc(s.desc) + "</span>" : "") + "</li>";
        }).join("") + "</ul>" : "") +
        (next.length ? '<h4 class="pixel">다음 진화</h4><ul class="evo__next">' + next.join("") + "</ul>" : "");
    }

    var narrow = window.matchMedia("(max-width: 1100px)");
    function onClick(e) {
      var b = e.target.closest("[data-n]");
      if (!b) return;
      pick(b.dataset.n);
      // 좁은 화면은 설명 창이 트리 아래에 있어 눌러도 안 보인다
      if (narrow.matches && map.contains(b)) info.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    map.addEventListener("click", onClick);
    info.addEventListener("click", onClick);
    pick("슬라임");
  }
})();
