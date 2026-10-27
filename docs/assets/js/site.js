// 공통: 머리 메뉴·바닥 넣기, 메시지창 글자 찍기
(function () {
  var PAGES = [
    ["index.html", "홈"],
    ["synopsis.html", "시놉시스"],
    ["system.html", "시스템"],
    ["characters.html", "캐릭터"],
    ["guardians.html", "가디언"],
    ["items.html", "아이템"],
    ["monsters.html", "몬스터 및 던전"],
    ["contact.html", "문의"]
  ];
  var here = location.pathname.split("/").pop() || "index.html";

  var gnb = document.getElementById("gnb");
  if (gnb) {
    var items = PAGES.map(function (p) {
      var cur = p[0] === here ? ' aria-current="page"' : "";
      return '<li><a href="' + p[0] + '"' + cur + ">" + p[1] + "</a></li>";
    }).join("");
    gnb.className = "gnb";
    gnb.innerHTML =
      '<div class="gnb__in">' +
      '<a class="gnb__logo" href="index.html">로스트사가<small>LOST-SAGA</small></a>' +
      '<button class="gnb__toggle" type="button" aria-expanded="false" aria-controls="gnb-menu">메뉴</button>' +
      '<ul class="gnb__menu" id="gnb-menu">' + items + "</ul></div>";
    var btn = gnb.querySelector(".gnb__toggle");
    var menu = gnb.querySelector(".gnb__menu");
    btn.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var foot = document.getElementById("foot");
  if (foot) {
    foot.className = "foot";
    foot.innerHTML =
      '<div class="foot__in">' +
      "<p>로스트사가 (LOST-SAGA Expansion Quest)<br>원작 히어로소프트. RPG Maker 2000.</p>" +
      '<p><a href="contact.html">문의</a></p></div>';
  }

  // 메시지창: data-type 속성이 있는 요소의 글자를 게임처럼 한 글자씩 찍는다
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-type]").forEach(function (el) {
    if (reduce) return;
    var lines = Array.prototype.slice.call(el.querySelectorAll("[data-line]"));
    var texts = lines.map(function (l) { return l.textContent; });
    lines.forEach(function (l) { l.textContent = ""; });
    var li = 0, ci = 0;
    function tick() {
      if (li >= lines.length) { el.classList.add("is-done"); return; }
      ci++;
      lines[li].textContent = texts[li].slice(0, ci);
      if (ci >= texts[li].length) { li++; ci = 0; setTimeout(tick, 380); }
      else setTimeout(tick, 42);
    }
    setTimeout(tick, 500);
  });
})();
