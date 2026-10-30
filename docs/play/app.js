// 런처 화면: 홈(세이브 고르기) → 플레이(플레이어 + 화면 버튼).
import { SaveSync, readLocalSaves } from "./sync.js";
import { parseLsd } from "./lsd.js";
import { registerWorker, prepareFiles } from "./files.js";

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

async function renderHome() {
  const names = await mapNames;
  const saves = [];
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

  $("#saves-meta").textContent = saves.length
    ? `${saves.length}개${sync.online ? "" : " · 오프라인"}`
    : "없음";
  const list = $("#slot-list");
  list.replaceChildren(...saves.map((s) => {
    const li = $("#slot-tpl").content.firstElementChild.cloneNode(true);
    li.classList.toggle("latest", s === latest);
    fillSum(li, s, names, `슬롯 ${s.slot}${s === latest ? " · 최근" : ""}`);
    const exp = li.querySelector('[data-act="export"]');
    exp.setAttribute("aria-label", `슬롯 ${s.slot} 내보내기 (PC판용 .lsd)`);
    exp.title = "PC판용 .lsd 로 내보내기";
    exp.onclick = () => download(s.slot, s.bytes);
    const load = li.querySelector('[data-act="load"]');
    load.setAttribute("aria-label", `슬롯 ${s.slot} 이어하기`);
    load.onclick = () => launch(`&load-game-id=${s.slot}`, `슬롯 ${s.slot} · ${who(s.sum)}`);
    return li;
  }));
}

// ---- 계정 ----

function renderAccount(saveCount) {
  const box = $("#account");
  box.hidden = offline || !sync.user;
  $("#who-chip").hidden = box.hidden;
  if (box.hidden) return;
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
  } else if (saveCount) {
    set("게스트", "이 브라우저에만 연결된 계정입니다. Google 계정을 연결하면 다른 기기에서 이어 할 수 있습니다.", "Google 계정 연결", link);
  } else {
    set("게스트", "Google 계정으로 로그인하면 다른 기기에서 저장한 세이브를 받습니다.", "Google로 로그인", login);
  }
}
let authErrorShown = false;

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
// Google 로그인에서 돌아오면 주소 뒤에 토큰이 붙어 있다. 읽은 뒤 지운다.
if (location.hash && !location.hash.startsWith("#account")) history.replaceState(null, "", location.pathname + location.search);
await renderHome();
