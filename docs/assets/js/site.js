// 공통: 머리 메뉴·바닥 넣기, 메시지창 글자 찍기
(function () {
  var CAFE = "https://cafe.daum.net/_c21_/bbs_list?grpid=10EOS&fldid=7Qnc"; // 히어로소프트 다음 카페 자유게시판
  var INTRO = [
    ["intro.html", "게임소개"],
    ["synopsis.html", "시놉시스"],
    ["system.html", "시스템"],
    ["characters.html", "캐릭터"],
    ["guardians.html", "가디언"],
    ["items.html", "아이템"],
    ["monsters.html", "몬스터 및 던전"]
  ];
  var here = location.pathname.split("/").pop() || "index.html";
  var inIntro = INTRO.some(function (p) { return p[0] === here; });

  function link(p, cur) {
    return '<a href="' + p[0] + '"' + (cur ? ' aria-current="page"' : "") + ">" + p[1] + "</a>";
  }

  var gnb = document.getElementById("gnb");
  if (gnb) {
    var sub = INTRO.slice(1).map(function (p) { return "<li>" + link(p, p[0] === here) + "</li>"; }).join("");
    var items =
      "<li>" + link(["index.html", "홈"], here === "index.html") + "</li>" +
      '<li class="has-sub">' + link(INTRO[0], inIntro) + '<ul class="gnb__sub">' + sub + "</ul></li>" +
      '<li><a href="' + CAFE + '" target="_blank" rel="noopener">게시판<span class="gnb__ext" aria-hidden="true">↗</span><span class="sr">(새 창, 다음 카페 자유게시판)</span></a></li>' +
      "<li>" + link(["download.html", "다운로드"], here === "download.html") + "</li>" +
      "<li>" + link(["contact.html", "문의"], here === "contact.html") + "</li>";
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

    // 게임소개 아래 탭: 게임소개와 그 하위 여섯 쪽에서 보인다
    if (inIntro) {
      var tabs = document.createElement("nav");
      tabs.className = "subtabs";
      tabs.setAttribute("aria-label", "게임소개");
      tabs.innerHTML =
        '<ul class="subtabs__in">' +
        INTRO.map(function (p) { return "<li>" + link(p, p[0] === here) + "</li>"; }).join("") + "</ul>";
      gnb.insertAdjacentElement("afterend", tabs);
    }
  }

  var foot = document.getElementById("foot");
  if (foot) {
    foot.className = "foot";
    foot.innerHTML =
      '<div class="foot__in">' +
      "<p>로스트사가 (LOST-SAGA Expansion Quest)<br>원작 히어로소프트. RPG Maker 2000.</p>" +
      '<p><a href="download.html">다운로드</a> · <a href="' + CAFE + '" target="_blank" rel="noopener">게시판</a> · <a href="contact.html">문의</a> · <a href="privacy.html">개인정보처리방침</a></p></div>';
  }

  // 새 버전 알림: 다운로드 버튼을 누른 적 있는 방문자에게만, 그 뒤 정식 릴리즈가 나오면 머리 아래에 띄운다
  var REPO = "tommy-user/rm2k-lostsaga";
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  function latestTag(cb) {
    var c = store("ls.latest");
    if (c) { try { c = JSON.parse(c); if (Date.now() - c.at < 36e5) return cb(c.tag); } catch (e) {} }
    fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=10")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        var r = list.filter(function (x) { return !x.prerelease && !x.draft; })[0];
        if (!r) return;
        store("ls.latest", JSON.stringify({ tag: r.tag_name, at: Date.now() }));
        cb(r.tag_name);
      })
      .catch(function () {});
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-dl]");
    if (a) store("ls.got", a.getAttribute("data-dl"));
  });
  var got = store("ls.got");
  if (got && gnb) {
    latestTag(function (tag) {
      if (tag === got || store("ls.dismissed") === tag) return;
      var bar = document.createElement("div");
      bar.className = "update";
      bar.setAttribute("role", "status");
      bar.innerHTML =
        '<span>새 버전 <b></b> 이 나왔습니다. 받은 버전은 ' + "<b></b>" + ".</span>" +
        '<a href="download.html">받으러 가기</a>' +
        '<button type="button" aria-label="닫기">×</button>';
      var bs = bar.querySelectorAll("b");
      bs[0].textContent = tag;
      bs[1].textContent = got;
      bar.querySelector("button").addEventListener("click", function () {
        store("ls.dismissed", tag);
        bar.remove();
      });
      gnb.insertAdjacentElement("afterend", bar);
    });
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

// 방문 집계 (Cloudflare Web Analytics). 주소 끝에 ?notrack 으로 한 번 열면 그 브라우저는 집계에서 빠지고, ?track 으로 해제
(function () {
  var KEY = "rm2k-notrack";
  try {
    if (/[?&]notrack\b/.test(location.search)) localStorage.setItem(KEY, "1");
    if (/[?&]track\b/.test(location.search)) localStorage.removeItem(KEY);
    if (localStorage.getItem(KEY)) return;
  } catch (e) {}
  var s = document.createElement("script");
  s.type = "module";
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", '{"token": "af2e70d4cf5f4f8bbd53b5cf7cec49cd"}');
  document.head.appendChild(s);
})();
