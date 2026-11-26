// 테스트 링크: PR(또는 main)의 게임을 설치 없이 브라우저에서 켠다.
//   test/?pr=566            PR #566 의 게임
//   test/?id=main           main (아직 릴리즈하지 않은 것)
//   &map=445&at=7,8&party=1 바로 가기 칸을 채워 둔다 (&go=1 이면 바로 시작)
//   휴대폰(터치)이면 화면 버튼이 나온다. PC 에서 보려면 &pad=1
// 게임 파일은 빌드(tools/build-preview.mjs)가 웹판 게임과 달라진 것만 test/<id>/ 에 넣고,
// 나머지는 웹판(play/games/lostsaga/)에서 받는다. 세이브는 /easyrpg/t-<id>/Save 에 따로 둔다.
// 런처(play/)와 달리 클라우드 동기화·Service Worker 를 쓰지 않는다.
import { parseLsd } from "../play/lsd.js";

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const id = q.get("pr") ? `pr${q.get("pr").replace(/\D/g, "")}` : (q.get("id") ?? "").replace(/[^a-z0-9-]/g, "");
const GAME = `t-${id}`;
const SAVE_DIR = `/easyrpg/${GAME}/Save`;
const REAL_SAVE_DIR = "/easyrpg/lostsaga/Save";  // 웹판 런처의 세이브 (읽기만 한다)
const CONFIG_DIR = "/tmp/lostsaga-test-config";
const PLAYER_CONFIG = "[Input]\nSpeedModifierA=3\nSpeedModifierB=10\n";

// ---- 목록 (id 가 없을 때) ----

async function showList() {
  $("#sub").textContent = "열려 있는 PR 과 main 의 게임을 설치 없이 켭니다.";
  let list = [];
  try {
    list = await (await fetch("list.json", { cache: "no-cache" })).json();
  } catch {}
  const box = $("#list");
  box.hidden = false;
  if (!list.length) box.innerHTML = '<p class="muted">아직 만든 테스트가 없습니다.</p>';
  for (const t of list) {
    const a = document.createElement("a");
    a.href = t.id === "main" ? "?id=main" : `?pr=${t.id.slice(2)}`;
    a.textContent = t.id === "main" ? "main (릴리즈 전)" : `#${t.id.slice(2)} ${t.title}`;
    const s = document.createElement("span");
    s.textContent = `${t.branch} · 바뀐 파일 ${t.changed} · ${when(t.built)}`;
    a.append(s);
    box.append(a);
  }
}

const when = (iso) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// ---- 세이브 (Emscripten IDBFS 와 같은 형식: 키는 전체 경로, 값은 {timestamp, mode, contents}) ----

function openSaveDb(dir) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dir, 21);
    req.onupgradeneeded = () => req.result.createObjectStore("FILE_DATA").createIndex("timestamp", "timestamp", { unique: false });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readSaves(dir) {
  const db = await openSaveDb(dir);
  const out = new Map();
  await new Promise((resolve, reject) => {
    const req = db.transaction("FILE_DATA").objectStore("FILE_DATA").openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve();
      const m = String(c.key).match(/\/Save(\d+)\.lsd$/i);
      if (m && c.value?.contents) out.set(Number(m[1]), { bytes: new Uint8Array(c.value.contents), time: c.value.timestamp });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

async function writeSaves(entries) {
  const db = await openSaveDb(SAVE_DIR);
  await new Promise((resolve, reject) => {
    const t = db.transaction("FILE_DATA", "readwrite");
    const s = t.objectStore("FILE_DATA");
    for (const [slot, bytes] of entries) {
      s.put({ timestamp: new Date(), mode: 0o100666, contents: bytes }, `${SAVE_DIR}/Save${String(slot).padStart(2, "0")}.lsd`);
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  db.close();
}

async function clearSaves() {
  const db = await openSaveDb(SAVE_DIR);
  await new Promise((resolve, reject) => {
    const t = db.transaction("FILE_DATA", "readwrite");
    t.objectStore("FILE_DATA").clear();
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  db.close();
}

let maps = {};
function describe(bytes) {
  try {
    const s = parseLsd(bytes);
    const where = maps[s.map_id] ? `${maps[s.map_id]}(${s.map_id})` : `맵 ${s.map_id}`;
    return `${s.leader_name || "?"} Lv${s.level} · ${where}`;
  } catch {
    return "읽을 수 없는 세이브";
  }
}

async function renderSaves() {
  const box = $("#slots");
  box.textContent = "";
  const saves = [...(await readSaves(SAVE_DIR))].sort((a, b) => a[0] - b[0]);
  if (!saves.length) box.innerHTML = '<p class="muted">테스트 세이브가 없습니다.</p>';
  for (const [slot, v] of saves) {
    const row = document.createElement("div");
    row.className = "slot";
    const info = document.createElement("div");
    info.textContent = `슬롯 ${slot} · ${describe(v.bytes)} `;
    const t = document.createElement("span");
    t.textContent = when(v.time);
    info.append(t);
    const b = document.createElement("button");
    b.textContent = "불러오기";
    b.onclick = () => launch(`&load-game-id=${slot}`, `슬롯 ${slot}`);
    row.append(info, b);
    box.append(row);
  }
}

// 웹판에서 하던 세이브를 이 테스트 칸에 복사한다. 웹판 쪽은 읽기만 한다.
async function copyRealSaves() {
  const dbs = (await indexedDB.databases?.()) ?? [];
  if (dbs.length && !dbs.some((d) => d.name === REAL_SAVE_DIR)) return alertLine("이 브라우저에 웹판 세이브가 없습니다.");
  const real = await readSaves(REAL_SAVE_DIR);
  if (!real.size) return alertLine("이 브라우저에 웹판 세이브가 없습니다.");
  await writeSaves([...real].map(([slot, v]) => [slot, v.bytes]));
  alertLine(`웹판 세이브 ${real.size}개를 가져왔습니다.`);
  renderSaves();
}

async function uploadSaves(files) {
  const entries = [];
  let slot = Math.max(0, ...(await readSaves(SAVE_DIR)).keys()) + 1;
  for (const f of files) {
    const m = f.name.match(/Save(\d+)\.lsd$/i);
    entries.push([m ? Number(m[1]) : slot++, new Uint8Array(await f.arrayBuffer())]);
  }
  await writeSaves(entries);
  renderSaves();
}

function alertLine(text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  $("#slots").before(p);
  setTimeout(() => p.remove(), 5000);
}

// ---- 게임 파일: 바뀐 것은 test/<id>/, 나머지는 웹판 ----

function routeFiles(meta) {
  const own = new URL(`${id}/`, location.href).href;
  const play = new URL("../play/games/lostsaga/", location.href).href;
  const game = new URL(`games/${GAME}/`, location.href).href;
  const changed = new Set(meta.changed.map((p) => p.normalize("NFC").toLowerCase()));
  const v = encodeURIComponent(meta.sha || meta.built);
  const Real = window.XMLHttpRequest;
  window.XMLHttpRequest = class extends Real {
    open(method, url, ...rest) {
      const abs = new URL(url, location.href);
      const href = abs.origin + abs.pathname;
      if (href.startsWith(game)) {
        const rel = decodeURIComponent(href.slice(game.length)).normalize("NFC");
        const enc = rel.split("/").map(encodeURIComponent).join("/");
        url = rel === "index.json" || changed.has(rel.toLowerCase()) ? `${own}${enc}?v=${v}` : play + enc;
      }
      return super.open(method, url, ...rest);
    }
  };
}

// ---- 플레이 ----

let started = false;
async function launch(args, title) {
  if (started) return;
  started = true;
  $("#play-title").textContent = `${$("#title").textContent} · ${title}`;
  $("#home").hidden = true;
  $("#play").hidden = false;
  const debug = $("#debug").checked ? "&test-play" : "";
  $("#btn-f9").hidden = $("#btn-ctrl").hidden = !debug;
  const back = location.pathname + location.search;
  // 플레이어는 주소의 쿼리를 명령줄 인자로 읽는다 (play/app.js 와 같다).
  history.replaceState(null, "", `?game=${GAME}&engine=rpg2kv150&config-path=${CONFIG_DIR}${debug}${args}`);
  const player = await createEasyRpgPlayer({
    game: GAME,
    onRuntimeInitialized() {
      this.FS.mkdirTree(CONFIG_DIR);
      this.FS.writeFile(`${CONFIG_DIR}/config.ini`, PLAYER_CONFIG);
    },
  });
  history.replaceState(null, "", back);
  player.initApi();
  window.easyrpgPlayer = player;
  $("#canvas").focus();
}

const num = (s) => String(s ?? "").replace(/\D/g, "");
function warpArgs() {
  const map = num($("#map").value);
  if (!map) return null;
  let a = `&new-game&start-map-id=${map}`;
  const x = num($("#x").value), y = num($("#y").value);
  if (x && y) a += `&start-position=${x}%20${y}`;
  const party = $("#party").value.split(/[\s,]+/).map(num).filter(Boolean);
  if (party.length) a += `&start-party=${party.join("%20")}`;
  return a;
}

async function main() {
  if (!id) return showList();
  let meta;
  try {
    meta = await (await fetch(`${id}/meta.json`, { cache: "no-cache" })).json();
  } catch {
    $("#sub").innerHTML = '<span class="err">이 테스트가 없습니다. 닫힌 PR 이거나 아직 만드는 중입니다.</span> <a href="./">목록</a>';
    return;
  }
  maps = await (await fetch(`${id}/maps.json?v=${encodeURIComponent(meta.sha || meta.built)}`)).json().catch(() => ({}));
  const name = id === "main" ? "main" : `#${id.slice(2)}`;
  document.title = `${name} 테스트 · 로스트사가`;
  $("#title").textContent = id === "main" ? "main 테스트" : `#${id.slice(2)} ${meta.title}`;
  $("#sub").textContent = `${meta.branch}${meta.sha ? ` (${meta.sha.slice(0, 7)})` : ""} · ${when(meta.built)} 빌드 · 웹판 ${meta.base} 와 다른 파일 ${meta.changed.length}개`;
  $("#changes summary").textContent = `바뀐 파일 ${meta.changed.length}개`;
  for (const p of meta.changed) {
    const li = document.createElement("li");
    li.textContent = p;
    $("#changes ul").append(li);
  }
  $("#panel").hidden = false;

  const sel = $("#map");
  sel.append(new Option("맵 고르기", ""));
  for (const [mid, mname] of Object.entries(maps)) if (!mname.startsWith("※안씀")) sel.append(new Option(`${mid} ${mname}`, mid));
  if (q.get("map")) sel.value = num(q.get("map"));
  const [x, y] = (q.get("at") ?? "").split(",");
  $("#x").value = num(x);
  $("#y").value = num(y);
  $("#party").value = (q.get("party") ?? "").replace(/,/g, " ");
  if (q.get("troop")) $("#troop").value = num(q.get("troop"));

  routeFiles(meta);
  $("#btn-new").onclick = () => launch("&new-game", "새 게임");
  $("#btn-title").onclick = () => launch("", "타이틀");
  $("#btn-warp").onclick = () => {
    const a = warpArgs();
    if (a) launch(a, `맵 ${num(sel.value)}`);
    else sel.focus();
  };
  $("#btn-battle").onclick = () => {
    const t = num($("#troop").value);
    if (t) launch(`&battle-test=${t}`, `전투 ${t}`);
    else $("#troop").focus();
  };
  $("#btn-copy").onclick = copyRealSaves;
  $("#file").onchange = (e) => uploadSaves(e.target.files);
  $("#btn-clear").onclick = async () => {
    await clearSaves();
    renderSaves();
  };
  $("#btn-home").onclick = () => location.reload();
  await renderSaves();
  if (q.get("go") === "1" && warpArgs()) $("#btn-warp").click();
}

// ---- 화면 버튼 (터치 기기, play/app.js 와 같은 방식: code 만 담은 키 이벤트를 캔버스에 보낸다) ----

const touch = matchMedia("(pointer: coarse)").matches || q.get("pad") === "1";
document.documentElement.classList.toggle("touch", touch);

// 짧게 톡 치면 누름·뗌이 한 프레임 안에 들어가 엔진이 못 읽는다. 누른 뒤 80ms 는 지나서 뗀다.
const pressedAt = new Map();
function key(type, code) {
  const send = () => {
    const e = new Event(type, { bubbles: true });
    e.code = code;
    $("#canvas").dispatchEvent(e);
  };
  if (type === "keydown") {
    pressedAt.set(code, performance.now());
    return send();
  }
  const at = pressedAt.get(code) ?? 0;
  const wait = 80 - (performance.now() - at);
  // 기다리는 사이 다시 눌렀으면 이 뗌은 버린다 (새 누름의 뗌이 따로 온다)
  if (wait > 0) setTimeout(() => pressedAt.get(code) === at && send(), wait);
  else send();
}
function capture(el, e) {
  try { el.setPointerCapture(e.pointerId); } catch {}
}

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
  const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(x, y) < r.width * 0.12) return dir;
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? "ArrowLeft" : "ArrowRight") : (y < 0 ? "ArrowUp" : "ArrowDown");
}
dpad.addEventListener("pointerdown", (e) => {
  setDir(dirAt(e));
  capture(dpad, e);
  e.preventDefault();
});
dpad.addEventListener("pointermove", (e) => { if (dir) setDir(dirAt(e)); });
for (const t of ["pointerup", "pointercancel"]) dpad.addEventListener(t, () => setDir(null));

for (const b of document.querySelectorAll(".keys button[data-key]")) {
  const up = () => {
    if (b.hasAttribute("data-toggle") || !b.classList.contains("on")) return;
    b.classList.remove("on");
    key("keyup", b.dataset.key);
  };
  b.addEventListener("pointerdown", (e) => {
    // 빨리·벽 통과는 한 번 누르면 켜지고 다시 누르면 꺼진다 (방향키를 누르는 동안 손가락이 모자라서)
    if (b.hasAttribute("data-toggle")) {
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      key(on ? "keydown" : "keyup", b.dataset.key);
      e.preventDefault();
      return;
    }
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
$("#play").addEventListener("contextmenu", (e) => e.preventDefault());

$("#canvas").addEventListener("click", () => $("#canvas").focus());
main();
