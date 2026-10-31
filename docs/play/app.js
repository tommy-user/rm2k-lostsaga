// 런처 화면: 홈(세이브 고르기) → 플레이(플레이어 + 화면 버튼).
import { SaveSync, readLocalSaves } from "./sync.js";
import { parseLsd, renameLeader, nameNormal, NAME_CHARS, NAME_MAX } from "./lsd.js";
import { registerWorker, prepareFiles, preloadGraphics, installPreload } from "./files.js";
import { JOBS, resolveLook, drawSprite, drawFace, lookLine, growthText, playTime } from "./look.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// ?offline 이면 클라우드 없이 이 기기에만 저장한다 (기준 세이브를 만들 때 쓴다).
const offline = params.has("offline");
// 내 컴퓨터(127.0.0.1)에서 띄울 때만 ?dev=test-play 처럼 플레이어 인자를 더 줄 수 있다. 배포 주소에서는 무시한다.
const dev = location.hostname === "127.0.0.1" && params.get("dev") ? `&${params.get("dev")}` : "";
// Google 로그인에서 돌아올 때 실패하면 주소에 error_code 가 붙어 온다. 읽고 지운다.
const authParams = new URLSearchParams(location.hash.slice(1) + "&" + location.search.slice(1));
const authError = authParams.get("error_code") || authParams.get("error");
if (authError) {
  for (const k of ["error", "error_code", "error_description"]) params.delete(k);
  history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : ""));
}
const search = location.search;
const returnTo = location.origin + location.pathname;

const touch = matchMedia("(hover: none), (pointer: coarse)").matches;
document.body.classList.toggle("touch", touch);

// 홈 일러스트: 그림이 테두리에서 잘리지 않는 것들 중 하나.
const ARTS = [
  ["warrior_m", "워리어 카이져"], ["priest_m", "프리스트 리안"], ["tamer_m", "테이머 크로노"], ["tamer_f", "테이머 루이"],
  ["fighter_m", "격투가 카론"], ["fighter_f", "격투가 메이"], ["thief_m", "도적 메테르"], ["thief_f", "도적 페이란"],
  ["ninja_m", "닌자 켈"], ["necro_m", "네크로맨서 테일즈"], ["necro_f", "네크로맨서 루나"], ["anti_m", "안티프리스트 하사드"],
];
const [artId, artName] = ARTS[Math.floor(Math.random() * ARTS.length)];
$("#art-img").src = `../assets/img/illust/${artId}.webp`;
$("#art-name").textContent = artName;

fetch("version.json", { cache: "no-cache" }).then((r) => r.json()).then((v) => {
  $("#version").textContent = v.game;
  $("#version").title = `게임 ${v.game} · ${new Date(v.built).toLocaleDateString("ko-KR")} 배포`;
  $("#version").hidden = false;
}).catch(() => {});

const mapNames = fetch("maps.json").then((r) => r.json()).catch(() => ({}));

// ---- 동기화 상태 ----

function setStatus(state, text) {
  for (const el of document.querySelectorAll(".sync")) {
    el.dataset.state = state;
    el.firstElementChild.textContent = text;
  }
}

const sync = new SaveSync(setStatus, (slot, bytes) => {
  const s = parseLsd(bytes);
  $("#play-title").textContent = `슬롯 ${slot} · ${who(s)}`;
});

// ---- 세이브 표시 ----

const who = (s) => `${s.leader_name || "이름 없음"} Lv${s.level}`;

function when(t) {
  if (!t) return "";
  const d = new Date(t);
  const now = new Date();
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `오늘 ${hm}`;
  if (diff === 1) return `어제 ${hm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 오늘·내일 시각 (대표 캐릭터를 다시 바꿀 수 있는 때)
function soon(t) {
  const d = new Date(t);
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${d.toDateString() === new Date().toDateString() ? "오늘" : "내일"} ${hm}`;
}

function fillSum(el, save, names, label) {
  el.querySelector(".when").textContent = `${label} · ${when(save.time)}`;
  el.querySelector(".who").textContent = who(save.sum);
  el.querySelector(".where").textContent = names[save.sum.map_id] ?? `맵 ${save.sum.map_id}`;
}

function download(slot, bytes) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  a.download = `Save${String(slot).padStart(2, "0")}.lsd`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let saves = [];  // 이 기기의 세이브 [{slot, bytes, time, sum}]

async function renderHome() {
  const names = await mapNames;
  saves = [];
  for (const [slot, v] of await readLocalSaves()) {
    try {
      saves.push({ slot, ...v, sum: parseLsd(v.bytes) });
    } catch (e) {
      console.warn("[launcher] slot", slot, e);
    }
  }
  saves.sort((a, b) => a.slot - b.slot);
  const latest = saves.reduce((a, b) => (!a || b.time > a.time ? b : a), null);

  const cont = $("#btn-continue");
  $("#latest").hidden = !latest;
  $("#no-save").hidden = !!latest;
  if (latest) {
    fillSum($("#latest"), latest, names, `슬롯 ${latest.slot}`);
    cont.lastElementChild.textContent = "이어하기";
    cont.onclick = () => launch(`&load-game-id=${latest.slot}`, `슬롯 ${latest.slot} · ${who(latest.sum)}`);
  } else {
    cont.lastElementChild.textContent = "새 게임 시작";
    cont.onclick = () => newGame();
  }
  $("#btn-new").hidden = !latest;
  for (const b of [cont, $("#btn-new"), $("#btn-title")]) b.disabled = false;

  renderAccount(saves.length);
  await loadRep();
  const repOf = repSlots();

  $("#saves-meta").textContent = saves.length
    ? `${saves.length}개${sync.online ? "" : " · 오프라인"}`
    : "없음";
  const list = $("#slot-list");
  list.replaceChildren(...saves.map((s) => {
    const li = $("#slot-tpl").content.firstElementChild.cloneNode(true);
    li.classList.toggle("latest", s === latest);
    fillSum(li, s, names, `슬롯 ${s.slot}${s === latest ? " · 최근" : ""}`);
    resolveLook(s.sum.leader).then((l) => {
      drawSprite(li.querySelector("canvas"), l);
      if (l.title) li.querySelector(".where").prepend(`${l.title} · `);
    });
    if (repOf.includes(s.slot)) {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = "대표";
      li.querySelector(".who").append(b);
    }
    const menu = li.querySelector('[data-act="menu"]');
    menu.setAttribute("aria-label", `슬롯 ${s.slot} 메뉴`);
    menu.onclick = (e) => { e.stopPropagation(); openSlotMenu(s, menu); };
    const load = li.querySelector('[data-act="load"]');
    load.setAttribute("aria-label", `슬롯 ${s.slot} 이어하기`);
    load.onclick = () => launch(`&load-game-id=${s.slot}`, `슬롯 ${s.slot} · ${who(s.sum)}`);
    return li;
  }));
  renderProfile();
}

// ---- 슬롯 메뉴 ----

const slotMenu = $("#slot-menu");
function closeSlotMenu() {
  slotMenu.hidden = true;
  slotMenu.opener?.setAttribute("aria-expanded", "false");
}
function openSlotMenu(s, btn) {
  if (!slotMenu.hidden && slotMenu.opener === btn) return closeSlotMenu();
  closeSlotMenu();
  slotMenu.opener = btn;
  btn.setAttribute("aria-expanded", "true");
  const [rename, pick, exp] = slotMenu.querySelectorAll("button");
  rename.onclick = () => { closeSlotMenu(); openRename(s); };
  pick.hidden = !canChooseRep();
  pick.onclick = () => { closeSlotMenu(); openPicker(s.slot); };
  exp.onclick = () => { closeSlotMenu(); download(s.slot, s.bytes); };
  const r = btn.getBoundingClientRect();
  slotMenu.hidden = false;
  const w = slotMenu.offsetWidth;
  slotMenu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + scrollX}px`;
  slotMenu.style.top = `${r.bottom + 6 + scrollY}px`;
  rename.focus();
}
document.addEventListener("click", (e) => { if (!slotMenu.contains(e.target)) closeSlotMenu(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !slotMenu.hidden) closeSlotMenu(); });

function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 4000);
}

// ---- 계정 ----

function renderAccount(saveCount) {
  const box = $("#account");
  box.hidden = offline || !sync.user;
  $("#who-chip").hidden = box.hidden;
  if (box.hidden) return;
  $("#nick-form").hidden = true;
  const btn = $("#acct-btn");
  const cancel = $("#acct-cancel");
  const set = (title, note, label, action, warn = false) => {
    $("#acct-title").textContent = title;
    $("#acct-note").textContent = note;
    btn.lastElementChild.textContent = label;
    btn.firstElementChild.style.display = action === logout ? "none" : "";
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await action();
      } catch (e) {
        console.warn("[launcher] auth", e);
        btn.disabled = false;
        set("Google 연결 안 됨", e.message ?? String(e), label, action, true);
      }
    };
    box.classList.toggle("warn", warn);
    cancel.hidden = !warn;
  };
  const link = () => sync.linkGoogle(returnTo);
  const login = () => sync.signInGoogle(returnTo);
  const logout = async () => { await sync.signOut(); location.assign(returnTo); };
  cancel.onclick = () => { authErrorShown = true; renderAccount(saveCount); };

  $("#who-chip").textContent = sync.anonymous ? "게스트" : sync.accountName;
  if (authError && !authErrorShown) {
    if (authError === "identity_already_exists") {
      set("이 Google 계정은 이미 다른 세이브 계정에 연결돼 있습니다",
        saveCount
          ? `그 계정으로 로그인하면 이 브라우저의 게스트 세이브 ${saveCount}개는 사라집니다. 필요하면 먼저 내보내기로 받아 두세요.`
          : "그 계정으로 로그인하면 그 계정의 세이브를 받습니다.",
        "그 계정으로 로그인", login, true);
    } else {
      set("Google 연결 안 됨", authError, "다시 시도", sync.anonymous ? link : login, true);
    }
  } else if (!sync.anonymous) {
    set(sync.accountName, "Google 계정입니다. 다른 기기에서도 이 계정으로 로그인하면 이어 할 수 있습니다.", "로그아웃", logout);
    renderNickname();
  } else if (saveCount) {
    set("게스트", "이 브라우저에만 연결된 계정입니다. Google 계정을 연결하면 다른 기기에서 이어 할 수 있습니다.", "Google 계정 연결", link);
  } else {
    set("게스트", "Google 계정으로 로그인하면 다른 기기에서 저장한 세이브를 받습니다.", "Google로 로그인", login);
  }
}
let authErrorShown = false;

// 정식(Google) 계정만 닉네임을 정한다. 랭킹 등 남에게 보이는 곳에는 닉네임과 고유 아이디(#XXXXXX)가 나간다.
// 서버(set_nickname)와 같은 규칙. 저장하기 전에 무엇이 틀렸는지 바로 알려 주려고 여기서도 본다.
const NICK_CHARS = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 _.~!?'^*♡♥☆★♪♬·-]+$/;
const NICK_LETTER = /[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]/;
const NICK_SYMBOLS = "_ - . ~ ! ? ' ^ * ♡ ♥ ☆ ★ ♪ ♬ ·";
const nickNormal = (s) => s.normalize("NFC").trim().replace(/\s+/g, " ");
function nickProblem(s) {
  const n = nickNormal(s);
  if ([...n].length < 2 || [...n].length > 12) return "2~12자로 정해 주세요.";
  const bad = [...new Set([...n].filter((c) => !NICK_CHARS.test(c)))];
  if (bad.length) return `쓸 수 없는 글자: ${bad.join(" ")} (한글·영문·숫자·띄어쓰기와 ${NICK_SYMBOLS})`;
  if (!NICK_LETTER.test(n)) return "글자나 숫자를 하나는 넣어 주세요.";
  return null;
}
const NICK_ERRORS = {
  invalid: `2~12자. 한글·영문·숫자·띄어쓰기와 기호 ${NICK_SYMBOLS} 를 쓸 수 있습니다.`,
  banned: "쓸 수 없는 닉네임입니다.",
  too_soon: "닉네임은 하루에 한 번 바꿀 수 있습니다.",
  anonymous: "Google 계정으로 로그인하면 닉네임을 정할 수 있습니다.",
};
async function renderNickname() {
  if (!sync.online) return;
  const form = $("#nick-form"), input = $("#nick-input"), btn = $("#nick-btn"), msg = $("#nick-msg");
  const show = (profile) => {
    input.value = profile?.nickname ?? "";
    btn.textContent = profile ? "바꾸기" : "정하기";
    msg.className = "";
    msg.textContent = profile ? `고유 아이디 #${profile.public_id}` : "랭킹 등에 보이는 이름입니다. 한 번 정하면 하루에 한 번 바꿀 수 있습니다.";
    form.hidden = false;
  };
  let profile = null;
  try {
    profile = await sync.myProfile();
  } catch (e) {
    console.warn("[launcher] profile", e);
    return;
  }
  show(profile);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const problem = nickProblem(input.value);
    if (problem) {
      msg.className = "err";
      msg.textContent = problem;
      return;
    }
    btn.disabled = true;
    try {
      const r = await sync.setNickname(nickNormal(input.value));
      if (r === "ok") {
        profile = await sync.myProfile();
        show(profile);
        msg.textContent = `저장했습니다. 고유 아이디 #${profile.public_id}`;
      } else {
        msg.className = "err";
        msg.textContent = NICK_ERRORS[r] ?? "저장하지 못했습니다.";
      }
    } catch (e) {
      console.warn("[launcher] nickname", e);
      msg.className = "err";
      msg.textContent = "저장하지 못했습니다. 잠시 뒤 다시 해 주세요.";
    }
    btn.disabled = false;
  };
}

// ---- 대표 캐릭터·프로필 ----
// 슬롯의 세이브가 속한 플레이를 대표로 정한다. 그 플레이를 저장할 때마다 서버가 대표 캐릭터를 갱신한다.

let rep = null;
const canChooseRep = () => !offline && sync.online && !sync.anonymous;
const repSlots = () => (rep ? [...sync.slotRuns].filter(([, run]) => run === rep.run_id).map(([slot]) => slot) : []);
const repLocked = () => rep && new Date(rep.next_change_at) > new Date();

async function loadRep() {
  rep = null;
  if (!canChooseRep()) return;
  try {
    rep = await sync.myRepresentative();
  } catch (e) {
    console.warn("[launcher] representative", e);
  }
}

function clearCanvas(c) {
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

// 내 프로필: 닉네임 #고유아이디, 대표 캐릭터, 세 랭킹의 내 순위.
async function renderProfile() {
  const box = $("#profile");
  box.hidden = !canChooseRep();
  if (box.hidden) return;
  const face = box.querySelector(".face"), sprite = box.querySelector(".sprite");
  clearCanvas(face);
  clearCanvas(sprite);
  let profile = null;
  try {
    profile = await sync.myProfile();
  } catch (e) {
    console.warn("[launcher] profile", e);
  }
  const nick = $("#pf-nick");
  if (profile) {
    const id = document.createElement("small");
    id.textContent = ` #${profile.public_id}`;
    nick.replaceChildren(profile.nickname, id);
  } else {
    nick.textContent = "닉네임 없음";
  }
  $("#pf-ranks").hidden = !profile || !rep;
  if (!rep) {
    $("#pf-rep").textContent = "대표 캐릭터 없음";
    $("#pf-note").textContent = profile ? "대표 캐릭터를 정하면 랭킹에 오릅니다." : "닉네임과 대표 캐릭터를 정하면 랭킹에 오릅니다.";
    return;
  }
  const l = await resolveLook(rep.look);
  drawFace(face, l);
  drawSprite(sprite, l);
  $("#pf-rep").textContent = `대표 캐릭터 · ${[l.name, l.title, growthText(l)].filter(Boolean).join(" · ")}`;
  const slots = repSlots();
  const notes = [slots.length ? `대표는 슬롯 ${slots.join(", ")} 의 플레이 · 저장하면 갱신` : "대표 플레이가 슬롯에 없음"];
  if (repLocked()) notes.push(`다음 변경 ${soon(rep.next_change_at)}`);
  if (!profile) notes.push("닉네임을 정하면 랭킹에 오릅니다");
  $("#pf-note").textContent = notes.join(" · ");
  if (!profile) return;
  for (const kind of ["growth", "adventure", "wave"]) {
    const dd = $(`#pf-rank-${kind}`);
    dd.textContent = "…";
    sync.ranking(kind, null, 1)
      .then((rows) => {
        const me = rows.find((r) => r.me);
        dd.textContent = !me ? "—" : kind === "wave" ? `웨이브 ${me.value}` : `${me.rank}위`;
      })
      .catch(() => { dd.textContent = "—"; });
  }
}
$("#pf-pick").onclick = () => openPicker();

const REP_ERRORS = {
  too_soon: "대표 캐릭터는 하루에 한 번 바꿀 수 있습니다.",
  no_save: "이 슬롯은 아직 백업되지 않았습니다.",
  anonymous: "Google 계정으로 로그인하면 대표 캐릭터를 정할 수 있습니다.",
};

// "카이져로", "켈로", "아린으로": 마지막 글자 받침에 맞춰 조사를 붙인다 (ㄹ 받침은 "로").
function withRo(name) {
  const c = name.charCodeAt(name.length - 1) - 0xac00;
  const jong = c >= 0 && c < 11172 ? c % 28 : 0;
  return name + (jong === 0 || jong === 8 ? "로" : "으로");
}

// 대표 바꾸기: 세이브를 고르고 버튼으로 정한다.
async function openPicker(slot = null) {
  const dlg = $("#pick-dlg"), list = $("#pick-list"), ok = $("#pick-ok"), msg = $("#pick-msg");
  const repOf = repSlots();
  let chosen = slot ?? saves.find((s) => sync.slotRuns.has(s.slot) && !repOf.includes(s.slot))?.slot ?? null;
  const looks = await Promise.all(saves.map((s) => resolveLook(s.sum.leader)));
  const update = () => {
    for (const li of list.children) li.setAttribute("aria-checked", String(Number(li.dataset.slot) === chosen));
    const s = saves.find((x) => x.slot === chosen);
    const same = s && repOf.includes(s.slot);
    ok.disabled = !s || same || repLocked();
    ok.textContent = s && !same ? `${withRo(looks[saves.indexOf(s)].name || who(s.sum))} 정하기` : "대표로 정하기";
    msg.className = "";
    msg.textContent = repLocked() ? `다음 변경 ${soon(rep.next_change_at)} 부터` : "정하면 하루 동안 다시 바꿀 수 없습니다";
  };
  list.replaceChildren(...saves.map((s, i) => {
    const li = $("#pick-tpl").content.firstElementChild.cloneNode(true);
    li.dataset.slot = s.slot;
    const backed = sync.slotRuns.has(s.slot);
    li.querySelector(".pick-name").textContent = backed ? `${looks[i].name || who(s.sum)} Lv${s.sum.level}` : `슬롯 ${s.slot} · 백업 전`;
    li.querySelector(".pick-sub").textContent = backed ? `${looks[i].title} · 슬롯 ${s.slot}` : "온라인에서 한 번 저장하면 고를 수 있습니다";
    li.querySelector(".tag").hidden = !repOf.includes(s.slot);
    drawSprite(li.querySelector("canvas"), looks[i]);
    if (backed) {
      li.tabIndex = 0;
      li.onclick = () => { chosen = s.slot; update(); };
      li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); li.onclick(); } };
    } else {
      li.setAttribute("aria-disabled", "true");
    }
    return li;
  }));
  update();
  ok.onclick = async () => {
    ok.disabled = true;
    try {
      const r = await sync.setRepresentative(chosen);
      if (r === "ok") {
        dlg.close();
        toast("대표 캐릭터를 바꿨습니다");
        return await renderHome();
      }
      msg.className = "err";
      msg.textContent = REP_ERRORS[r] ?? "정하지 못했습니다.";
    } catch (e) {
      console.warn("[launcher] representative", e);
      msg.className = "err";
      msg.textContent = "정하지 못했습니다. 잠시 뒤 다시 해 주세요.";
    }
    ok.disabled = false;
  };
  dlg.showModal();
}

// ---- 캐릭터 이름 바꾸기 ----
// 게임 안 이름 입력은 정해진 글자표에서만 고를 수 있어서, 웹판은 여기서 세이브의 이름을 바꾼다 (게임을 켜기 전에만).

async function openRename(s) {
  const dlg = $("#name-dlg"), input = $("#name-input"), count = $("#name-count"), msg = $("#name-msg"), ok = $("#name-ok");
  const l = await resolveLook(s.sum.leader);
  const current = s.sum.leader_name || l.name;
  $("#name-slot").textContent = `슬롯 ${s.slot} · ${current} Lv${s.sum.level}${l.title ? ` · ${l.title}` : ""}`;
  drawFace($("#name-face"), l);
  drawSprite($("#name-sprite"), l);
  $("#name-pv-sub").textContent = `${l.title || ""} · Lv ${s.sum.level}`;
  let profile = null;
  try {
    if (sync.online && !sync.anonymous) profile = await sync.myProfile();
  } catch {}
  $("#name-rank").hidden = !profile;
  if (profile) {
    const id = document.createElement("small");
    id.textContent = ` #${profile.public_id}`;
    $("#name-rank-nick").replaceChildren(profile.nickname, id);
  }
  const problem = () => {
    const n = nameNormal(input.value);
    if (!n) return "이름을 넣어 주세요.";
    if ([...n].length > NAME_MAX) return `${NAME_MAX}자까지 쓸 수 있습니다.`;
    const bad = [...new Set([...n].filter((c) => !NAME_CHARS.test(c)))];
    if (bad.length) return `게임에서 쓸 수 없는 글자: ${bad.join(" ")}`;
    if (n === current) return "지금 이름과 같습니다.";
    return null;
  };
  const update = () => {
    const n = nameNormal(input.value);
    count.textContent = `${[...n].length}/${NAME_MAX}`;
    $("#name-pv").textContent = n || current;
    $("#name-rank-who").textContent = `${n || current}${l.title ? ` · ${l.title}` : ""}`;
    const p = problem();
    const shown = p && n && n !== current ? p : "";
    msg.textContent = shown || "한글·영문·숫자 6자까지. 띄어쓰기와 기호 · ☆ ~ 는 됩니다.";
    msg.className = shown ? "err" : "";
    input.setAttribute("aria-invalid", String(!!shown));
    ok.disabled = !!p;
  };
  input.value = current;
  input.oninput = update;
  update();
  $("#name-form").onsubmit = async (ev) => {
    ev.preventDefault();
    if (problem()) return;
    const n = nameNormal(input.value);
    ok.disabled = true;
    try {
      if (sync.online && await sync.nameBanned(n)) {
        msg.textContent = "쓸 수 없는 이름입니다.";
        msg.className = "err";
        input.setAttribute("aria-invalid", "true");
        return;
      }
      await sync.replaceSave(s.slot, renameLeader(s.bytes, n));
      dlg.close();
      toast(`슬롯 ${s.slot} 이름을 바꿨습니다`);
      await renderHome();
    } catch (e) {
      console.warn("[launcher] rename", e);
      msg.textContent = "바꾸지 못했습니다.";
      msg.className = "err";
    } finally {
      ok.disabled = !!problem();
    }
  };
  dlg.showModal();
  input.select();
}

for (const d of document.querySelectorAll("dialog.sheet")) {
  d.querySelector("[data-close]").onclick = () => d.close();
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });  // 바깥(배경)을 누르면 닫는다
}

// ---- 랭킹 ----

// 모험 단계 이름. 순서는 lsd.js 의 STAGES (스위치 번호) 와 같다.
const STAGE_NAMES = [
  "", "제2회 토너먼트 우승", "카오스 처치", "크리엔드Ⅳ세 처단", "마스터 승급", "트롤킹 프리조락 처치", "골렘 수호자 처치",
  "우라노스 처치", "에피소드2 쉐도우 처치", "에피소드2 수호 골렘 처치", "에피소드2 카르도어 처치",
  "에피소드3 대천사 처치", "에피소드3 문지기 처치", "에피소드3 카오스 처치", "에피소드3 엔딩",
];
const RANKS = {
  growth: "대표 캐릭터 기준 · 승급 단계 › 돌파 › 레벨 · 같으면 먼저 닿은 사람",
  adventure: "모든 세이브 중 가장 앞선 기록 · 같은 단계면 플레이 시간이 짧은 순",
  wave: "무한 웨이브 최고 기록 · 같으면 걸린 시간이 짧은 순",
};
const RANK_LIMIT = 100;
let rankKind = "growth", rankJob = null, rankSeq = 0;

for (const b of document.querySelectorAll("#ranking [data-kind]")) {
  b.onclick = () => { rankKind = b.dataset.kind; showRanking(); };
}
$("#rank-jobs").replaceChildren(...[[null, "전체"], ...Object.entries(JOBS)].map(([key, label]) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.dataset.job = key ?? "";
  b.onclick = () => { rankJob = key; showRanking(); };
  return b;
}));

function rankValue(r, l) {
  if (rankKind === "growth") return growthText(l);
  if (rankKind === "adventure") return STAGE_NAMES[r.value] ?? `단계 ${r.value}`;
  return `웨이브 ${r.value}`;
}

// 성장·모험은 플레이 시간(시:분), 무한대전은 그 기록에 걸린 시간(분:초)
function rankTime(r) {
  if (r.frames == null) return "";
  if (rankKind !== "wave") return `플레이 ${playTime(r.frames)}`;
  const s = Math.round(r.frames / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function nickLine(el, r) {
  const small = document.createElement("small");
  small.textContent = ` #${r.public_id}${r.me ? " · 나" : ""}`;
  el.replaceChildren(r.nickname, small);
}

function rankRow(tpl, r, l) {
  const li = $(tpl).content.firstElementChild.cloneNode(true);
  li.classList.toggle("me", r.me);
  li.querySelector(".no").textContent = r.rank;
  nickLine(li.querySelector(".nick-line"), r);
  li.querySelector(".who-line").textContent = lookLine(l);
  li.querySelector(".val").textContent = rankValue(r, l);
  li.querySelector(".time").textContent = rankTime(r);
  const face = li.querySelector(".face");
  if (face) drawFace(face, l);
  drawSprite(li.querySelector(".sprite"), l);
  return li;
}

async function showRanking() {
  const seq = ++rankSeq;
  for (const b of document.querySelectorAll("#ranking [data-kind]")) b.setAttribute("aria-selected", String(b.dataset.kind === rankKind));
  for (const b of $("#rank-jobs").children) b.setAttribute("aria-pressed", String(b.dataset.job === (rankJob ?? "")));
  $("#rank-note").textContent = RANKS[rankKind];
  const podium = $("#rank-podium"), list = $("#rank-list"), empty = $("#rank-empty"), bar = $("#rank-me");
  podium.replaceChildren();
  list.replaceChildren();
  bar.replaceChildren();
  bar.hidden = true;
  empty.hidden = false;
  if (!sync.online) {
    empty.textContent = "인터넷에 연결하면 랭킹을 볼 수 있습니다.";
    return;
  }
  empty.textContent = "불러오는 중";
  let rows, looks;
  try {
    rows = await sync.ranking(rankKind, rankJob, RANK_LIMIT);
    looks = await Promise.all(rows.map((r) => resolveLook(r.look ?? {})));
  } catch (e) {
    console.warn("[launcher] ranking", e);
    if (seq === rankSeq) empty.textContent = "랭킹을 불러오지 못했습니다.";
    return;
  }
  if (seq !== rankSeq) return;
  if (!rows.length) {
    empty.textContent = rankKind === "wave" ? "아직 기록이 없습니다. 몬스터대기실의 무한 웨이브에서 기록을 세울 수 있습니다." : "아직 기록이 없습니다.";
    return;
  }
  empty.hidden = true;
  rows.forEach((r, i) => {
    const l = looks[i];
    // 위 세 명은 시상대 (1등이 가운데). 내 순위가 100위 밖이면 아래 고정 줄에만 보인다.
    if (i < 3 && r.rank <= 3) podium.append(rankRow("#podium-tpl", r, l));
    else if (r.rank <= RANK_LIMIT) list.append(rankRow("#rank-tpl", r, l));
    if (r.me) {
      bar.append(rankRow("#rank-tpl", r, l));
      bar.hidden = false;
    }
  });
}

// 주소가 #ranking 이면 랭킹 화면을 보인다.
function route() {
  if (started) return;
  const ranking = location.hash === "#ranking";
  $("#home").hidden = ranking;
  $("#ranking").hidden = !ranking;
  if (ranking) {
    scrollTo(0, 0);
    showRanking();
  }
}
addEventListener("hashchange", route);

async function newGame() {
  if (started) return;
  if (!offline) await sync.prepareNewGame();
  launch("&new-game", "새 게임");
}
$("#btn-new").onclick = newGame;
$("#btn-title").onclick = () => launch("", "타이틀 화면");

// ---- 플레이 ----

let started = false;

async function launch(args, title) {
  if (started) return;
  started = true;
  $("#play-title").textContent = title;
  $("#home").hidden = true;
  $("#play").hidden = false;
  scrollTo(0, 0);  // 홈에서 내려 둔 스크롤이 남으면 모바일에서 터치 위치가 어긋난다
  // 플레이어는 주소의 쿼리를 명령줄 인자로 읽는다. 엔진은 exe 크기로 판별하지 못해 직접 정한다.
  installPreload(await graphics);
  history.replaceState(null, "", `?game=lostsaga&engine=rpg2kv150${args}${dev}`);
  const player = await createEasyRpgPlayer({ game: "lostsaga" });
  history.replaceState(null, "", location.pathname + search);
  player.initApi();
  window.easyrpgPlayer = player;
  if (!offline) sync.watch(player.FS);
  canvas.focus();
}

// 플레이어는 한 페이지에서 한 번만 켤 수 있어서, 홈으로 갈 때는 페이지를 새로 연다.
for (const b of document.querySelectorAll('[data-act="home"]')) {
  b.onclick = () => location.assign(location.pathname + search);
}

// 방향키를 꾹 누르면 휴대폰이 길게 누르기 메뉴를 띄우므로 플레이 화면에서는 막는다.
$("#play").addEventListener("contextmenu", (e) => e.preventDefault());

const canvas = $("#canvas");
canvas.addEventListener("click", () => canvas.focus());

// 빨리 감기(EasyRPG 기본 F·G 키)는 웹판에서 쓰지 않는다. 플레이 시간 확인이 어긋난다.
for (const type of ["keydown", "keyup"]) {
  window.addEventListener(type, (e) => {
    if (e.code === "KeyF" || e.code === "KeyG") { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

const full = $("#btn-full");
if (!document.fullscreenEnabled) full.hidden = true;
full.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : $("#play").requestFullscreen());

// ---- 화면 버튼 ----

// 공식 웹 플레이어와 같은 방식: code 만 담은 키 이벤트를 캔버스에 보낸다.
function key(type, code) {
  const e = new Event(type, { bubbles: true });
  e.code = code;
  canvas.dispatchEvent(e);
}

// 손가락이 버튼 밖으로 나가도 떼는 순간을 받도록 포인터를 붙잡는다. 못 붙잡아도 입력은 보낸다.
function capture(el, e) {
  try { el.setPointerCapture(e.pointerId); } catch {}
}

// 방향 패드는 누른 채 미끄러지면 방향이 바뀐다.
const dpad = $("#dpad");
let dir = null;
function setDir(next) {
  if (next === dir) return;
  if (dir) key("keyup", dir);
  dir = next;
  if (dir) key("keydown", dir);
  for (const i of dpad.querySelectorAll("[data-key]")) i.classList.toggle("on", i.dataset.key === dir);
}
function dirAt(e) {
  const r = dpad.getBoundingClientRect();
  const x = e.clientX - (r.left + r.width / 2);
  const y = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(x, y) < r.width * 0.12) return dir;  // 가운데는 방향을 유지
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? "ArrowLeft" : "ArrowRight") : (y < 0 ? "ArrowUp" : "ArrowDown");
}
dpad.addEventListener("pointerdown", (e) => {
  setDir(dirAt(e));
  capture(dpad, e);
  e.preventDefault();
});
dpad.addEventListener("pointermove", (e) => { if (dir) setDir(dirAt(e)); });
for (const t of ["pointerup", "pointercancel"]) dpad.addEventListener(t, () => setDir(null));

for (const b of document.querySelectorAll(".pad button[data-key]")) {
  const up = () => {
    if (!b.classList.contains("on")) return;
    b.classList.remove("on");
    key("keyup", b.dataset.key);
  };
  b.addEventListener("pointerdown", (e) => {
    b.classList.add("on");
    key("keydown", b.dataset.key);
    capture(b, e);
    navigator.vibrate?.(8);
    e.preventDefault();
  });
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
}

// ---- 게임 파일 받기 ----

const mb = (n) => (n / 1e6).toFixed(1);

async function getFiles() {
  await registerWorker();
  const box = $("#loading");
  const bar = $("#load-bar");
  for (;;) {
    try {
      const r = await prepareFiles({
        onStart(total, count, first) {
          $("#load-title").textContent = first ? "게임 파일 받는 중" : "업데이트 받는 중";
          $("#load-note").textContent = first
            ? "처음 한 번만 받습니다. 다음부터는 바뀐 파일만 받고, 인터넷 없이도 열립니다."
            : `바뀐 파일 ${count}개를 받습니다.`;
          $("#load-retry").hidden = true;
          box.dataset.total = total;
          box.hidden = false;
        },
        onProgress(done, total) {
          const pct = Math.min(100, (done / total) * 100);
          bar.style.width = `${pct}%`;
          bar.parentElement.setAttribute("aria-valuenow", Math.round(pct));
          $("#load-size").textContent = `${mb(done)} / ${mb(total)}MB`;
        },
      });
      if (r !== "missing") break;
      throw new Error("인터넷에 연결해야 게임 파일을 받을 수 있습니다.");
    } catch (e) {
      console.warn("[launcher] files", e);
      $("#load-title").textContent = "게임 파일을 받지 못했습니다";
      $("#load-note").textContent = navigator.onLine ? "연결을 확인하고 다시 시도해 주세요. 받은 부분은 남아 있습니다." : "인터넷에 연결한 뒤 다시 시도해 주세요.";
      $("#load-retry").hidden = false;
      box.hidden = false;
      await new Promise((r) => { $("#load-retry").onclick = r; });
    }
  }
  box.hidden = true;
}

// ---- 시작 ----

await Promise.all([getFiles(), offline ? setStatus("offline", "오프라인") : sync.start()]);
// 홈을 보는 동안 그림 파일을 메모리에 올려 둔다 (게임을 시작할 때 기다린다).
const graphics = preloadGraphics().catch((e) => {
  console.warn("[launcher] preload", e);
  return new Map();
});
// Google 로그인에서 돌아오면 주소 뒤에 토큰이 붙어 있다. 읽은 뒤 지운다.
if (location.hash && !/^#(account|ranking)$/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
await renderHome();
route();
