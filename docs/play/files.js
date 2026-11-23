// 게임 파일 미리 받기. 처음 한 번은 전부, 그다음부터는 files.json 의 해시가 바뀐 파일이 든 묶음만 받는다.
// 시작에 필요한 묶음을 먼저 받고, 나머지는 홈·게임을 연 뒤에도 이어 받는다.
// 파일 2천 개를 하나씩 받으면 GitHub Pages 가 막으므로(429) 빌드 때 약 4MB 묶음(packs/)으로 합쳐 둔다.
// 받은 파일은 Cache Storage 에 넣고, Service Worker(sw.js)가 플레이어에게 꺼내 준다.
const FILES = "lostsaga-files";
const HAVE = "lostsaga-files-have";  // localStorage: 경로 → 받아 둔 파일의 해시
const PARALLEL = 4;  // 묶음(약 4MB) 단위라 몇 개만 같이 받아도 회선을 다 쓴다

const TYPES = { wasm: "application/wasm", js: "text/javascript", json: "application/json", png: "image/png", bmp: "image/bmp",
  jpg: "image/jpeg", wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", mid: "audio/midi", midi: "audio/midi" };
const typeOf = (p) => TYPES[p.slice(p.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";

// 일시적인 오류(GitHub Pages 의 429, 5xx)는 잠깐 기다렸다 다시 받는다.
async function fetchRetry(url, cache = "no-cache") {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { cache });
    if (res.ok) return res;
    if (i >= 3 || !(res.status === 429 || res.status >= 500)) throw new Error(`${url} ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
}

const fileKey = (url) => {
  const u = new URL(url);
  return u.origin + decodeURIComponent(u.pathname).normalize("NFC");
};
const fileUrl = (p) => new URL(p.split("/").map(encodeURIComponent).join("/"), location.href).href;

function loadHave() {
  try {
    return JSON.parse(localStorage.getItem(HAVE)) ?? {};
  } catch {
    return {};
  }
}
function saveHave(have) {
  try {
    localStorage.setItem(HAVE, JSON.stringify(have));
  } catch {}
}

// 런처 화면 파일. Service Worker 가 붙기 전에 받은 것이라 한 번 더 받아 저장소에 넣는다.
const SHELL = [
  "./", "app.js", "sync.js", "lsd.js", "look.js", "pad.js", "sound.js", "keys.js", "files.js", "config.js", "vendor/supabase-fossil.js",
  "maps.json", "actors.json", "version.json", "files.json", "../favicon.ico", "../assets/img/pic/title.png",
];

export async function registerWorker() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    // 처음 등록한 페이지는 clients.claim() 이 끝나야 Service Worker 를 거친다.
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => {
        navigator.serviceWorker.addEventListener("controllerchange", r, { once: true });
        setTimeout(r, 3000);
      });
    }
    if (!navigator.serviceWorker.controller) return false;
    // Service Worker 를 거쳐 받으면 sw.js 가 저장소에 넣는다.
    await Promise.all(SHELL.map((u) => fetch(u, { cache: "no-cache" }).catch(() => {})));
    return true;
  } catch (e) {
    console.warn("[files] service worker", e);
    return false;
  }
}

// 다 받아 둔 배포(version.json 의 built). 다음에 열 때 이것과 같으면 목록(files.json)을 받지 않고 바로 쓴다.
const READY = "lostsaga-files-ready";
// 시작하기 전에 받아야 하는 묶음: 엔진, DB·맵, 기준 세이브, 첫 화면·걷기·얼굴·지형 그림.
// 나머지(그림·소리·음악·전투 그림)는 게임을 켠 뒤에도 이어 받는다. 그 사이 필요한 파일은 Service Worker 가 하나씩 받아 온다.
const FIRST = new Set(["player", "bases", "game-root", "game-System", "game-Title", "game-CharSet", "game-ChipSet", "game-FaceSet", "game-GameOver"]);
// 저장소가 비워졌는지는 이 파일들만 본다. 전부 보는 cache.keys() 는 파일이 만 개가 넘어 휴대폰에서 몇 초 걸린다.
const PROBE = ["player/index.wasm", "games/lostsaga/RPG_RT.ldb", "games/lostsaga/RPG_RT.lmt"];

function readMark() {
  try {
    return localStorage.getItem(READY);
  } catch {
    return null;
  }
}
function writeMark(v) {
  try {
    if (v) localStorage.setItem(READY, v);
    else localStorage.removeItem(READY);
  } catch {}
}

async function probe(cache, have) {
  for (const p of PROBE) if (!have[p] || !(await cache.match(fileKey(fileUrl(p))))) return false;
  return true;
}

// 게임 파일을 준비한다. 돌려주는 것: { first, all }
//   first: 게임을 켤 수 있을 때 끝난다 (시작에 필요한 묶음까지 받음). all: 전부 받았을 때 끝난다.
//   값은 "ready"(다 있음) | "offline"(목록을 못 받았지만 받아 둔 것이 있음) | "missing"(받아 둔 것이 모자람)
// 받을 것이 있으면 onStart(받을 바이트, 파일 수, 처음인지, 시작 전에 받을 것이 있는지)를 부르고,
// onProgress(받은 바이트, 전체)로 알린다. 시작에 필요한 묶음을 먼저 받는다.
// version 은 version.json 내용 (없으면 매번 목록을 받아 비교한다).
export function prepareFiles(opts) {
  let firstDone;
  const first = new Promise((r) => { firstDone = r; });
  const all = run(opts, (v) => firstDone(v));
  all.then(firstDone, (e) => firstDone(Promise.reject(e)));
  return { first, all };
}

async function run({ onStart, onProgress, version }, firstReady) {
  if (!("caches" in window)) return "ready";
  navigator.storage?.persist?.().catch(() => {});
  const cache = await caches.open(FILES);
  let have = loadHave();
  const built = typeof version?.built === "string" ? version.built : null;

  const intact = Object.keys(have).length > 0 && await probe(cache, have);
  if (intact && built && readMark() === built) return "ready";
  if (!intact) {
    // 브라우저가 저장소를 비웠으면 기록도 버린다.
    writeMark(null);
    const keys = new Set((await cache.keys()).map((r) => fileKey(r.url)));
    for (const p of Object.keys(have)) if (!keys.has(fileKey(fileUrl(p)))) delete have[p];
  }

  let packs;
  try {
    const res = await fetchRetry("files.json");
    packs = (await res.json()).packs;
  } catch (e) {
    console.warn("[files]", e);
    return Object.keys(have).length ? "offline" : "missing";
  }
  const list = packs.flatMap((k) => k.files);

  // 받아 둔 것과 해시가 다른 파일이 하나라도 든 묶음만 받는다. 시작에 필요한 묶음이 앞.
  const stale = (k) => k.files.some(([p, , h]) => have[p] !== h);
  const head = packs.filter((k) => FIRST.has(k.name) && stale(k));
  const tail = packs.filter((k) => !FIRST.has(k.name) && stale(k));
  const todo = [...head, ...tail];
  const isFirst = Object.keys(have).length === 0;
  const total = todo.reduce((a, k) => a + k.size, 0);
  let done = 0;

  const fetchAll = async (group) => {
    const queue = [...group];
    const work = async () => {
      for (let k; (k = queue.shift()); ) {
        const res = await fetchRetry(k.url, "default");  // 묶음 주소에 해시가 있어 내용이 바뀌면 주소도 바뀐다
        // 진행 막대가 묶음 하나(약 4MB) 안에서도 움직이도록 읽은 만큼 센다.
        const reader = res.body.getReader();
        const buf = new Uint8Array(k.size);
        let at = 0;
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          buf.set(value, at);
          at += value.length;
          done += value.length;
          onProgress?.(done, total);
        }
        if (at !== k.size) throw new Error(`${k.url} ${at}/${k.size}`);
        for (const [p, size, h, off] of k.files) {
          if (have[p] === h) continue;
          await cache.put(fileKey(fileUrl(p)), new Response(buf.slice(off, off + size), {
            headers: { "Content-Type": typeOf(p) },
          }));
          have[p] = h;
        }
        saveHave(have);
      }
    };
    const worker = async () => {
      try {
        await work();
      } catch (e) {
        queue.length = 0;  // 하나라도 실패하면 나머지도 멈춘다
        throw e;
      }
    };
    try {
      await Promise.all(Array.from({ length: PARALLEL }, worker));
    } finally {
      saveHave(have);
    }
  };

  if (todo.length) {
    onStart?.(total, todo.reduce((a, k) => a + k.files.filter(([p, , h]) => have[p] !== h).length, 0), isFirst, head.length > 0);
    await fetchAll(head);
  }
  // 뒤에서 받을 묶음에 든 파일 중 바뀐 것은 옛 판을 먼저 지운다. 남겨 두면 다 받기 전까지
  // 미리 올리기(preloadGraphics)·Service Worker 가 옛 그림을 내줘서, 새 DB 와 그림이 어긋난다
  // (ESC 메뉴 판에 새 칸 글자가 없고, 가방 이름 그림이 다른 아이템 이름으로 나옴). 지운 파일은 받기 전까지 Pages 에서 하나씩 받는다.
  let dropped = false;
  for (const k of tail) {
    for (const [p, , h] of k.files) {
      if (have[p] === undefined || have[p] === h) continue;
      await cache.delete(fileKey(fileUrl(p)));
      delete have[p];
      dropped = true;
    }
  }
  if (dropped) saveHave(have);
  firstReady("ready");
  if (tail.length) await fetchAll(tail);

  // 목록에서 빠진 파일은 지운다.
  const keep = new Set(list.map(([p]) => p));
  for (const p of Object.keys(have)) {
    if (!keep.has(p)) {
      await cache.delete(fileKey(fileUrl(p)));
      delete have[p];
    }
  }
  saveHave(have);
  if (built) writeMark(built);
  return "ready";
}

// ---- 그림 바로 넘겨주기 ----
// 플레이어는 그림을 처음 쓸 때마다 XMLHttpRequest 로 비동기 요청을 하고, 응답이 올 때까지 그림이 빠져
// 화면이 깜빡인다 (한 번 쓴 그림은 메모리에 남아 이후엔 괜찮다). 그래서 그림 폴더를 미리 메모리에 올려 두고,
// 그 파일 요청은 send() 안에서 바로 응답한다. 플레이어 소스에도 즉시 완료하는 경로가 있다 (async_handler.cpp).
const GRAPHICS = /\/games\/[^/]+\/(Picture|System|System2|Title|CharSet|ChipSet|FaceSet|Panorama|Backdrop|Battle|Battle2|BattleCharSet|BattleWeapon|Frame|Monster|GameOver)\//i;

export async function preloadGraphics() {
  const out = new Map();
  if (!("caches" in window)) return out;
  const cache = await caches.open(FILES);
  const reqs = (await cache.keys()).filter((r) => GRAPHICS.test(fileKey(r.url)));
  await Promise.all(reqs.map(async (r) => {
    const res = await cache.match(r);
    if (res) out.set(fileKey(r.url), await res.arrayBuffer());
  }));
  return out;
}

export function installPreload(files) {
  if (!files.size) return;
  const Real = window.XMLHttpRequest;
  window.XMLHttpRequest = class extends Real {
    open(method, url, ...rest) {
      const key = method === "GET" ? fileKey(new URL(url, location.href).href) : null;
      this._pre = key && files.get(key);
      if (this._pre) {
        files.delete(key);  // 플레이어 안 파일 시스템에 들어가므로 여기서는 놓는다
        return;
      }
      super.open(method, url, ...rest);
    }
    send(body) {
      if (!this._pre) return super.send(body);
      Object.defineProperty(this, "status", { value: 200 });
      Object.defineProperty(this, "readyState", { value: 4 });
      Object.defineProperty(this, "response", { value: this._pre });
      this.onload?.(new ProgressEvent("load"));
    }
  };
}
