// 게임 파일 미리 받기. 처음 한 번은 전부, 그다음부터는 files.json 의 해시가 바뀐 파일이 든 묶음만 받는다.
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
  "./", "app.js", "sync.js", "lsd.js", "files.js", "config.js", "vendor/supabase-fossil.js",
  "maps.json", "version.json", "files.json", "../favicon.ico", "../assets/img/pic/title.png",
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

// 받을 것이 있으면 onStart(받을 바이트, 파일 수, 처음인지)를 부르고 onProgress(받은 바이트)로 알린다.
// 결과: "ready"(다 있음) | "offline"(목록을 못 받았지만 받아 둔 것이 있음) | "missing"(받아 둔 것이 모자람)
export async function prepareFiles({ onStart, onProgress }) {
  if (!("caches" in window)) return "ready";
  navigator.storage?.persist?.().catch(() => {});
  const cache = await caches.open(FILES);
  let have = loadHave();

  // 브라우저가 저장소를 비웠으면 기록도 버린다.
  const keys = new Set((await cache.keys()).map((r) => fileKey(r.url)));
  for (const p of Object.keys(have)) if (!keys.has(fileKey(fileUrl(p)))) delete have[p];

  let packs;
  try {
    const res = await fetchRetry("files.json");
    packs = (await res.json()).packs;
  } catch (e) {
    console.warn("[files]", e);
    return Object.keys(have).length ? "offline" : "missing";
  }
  const list = packs.flatMap((k) => k.files);

  // 받아 둔 것과 해시가 다른 파일이 하나라도 든 묶음만 받는다.
  const todo = packs.filter((k) => k.files.some(([p, , h]) => have[p] !== h));
  const first = Object.keys(have).length === 0;
  const total = todo.reduce((a, k) => a + k.size, 0);
  if (todo.length) {
    onStart?.(total, todo.reduce((a, k) => a + k.files.filter(([p, , h]) => have[p] !== h).length, 0), first);
    let done = 0;
    const queue = [...todo];
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
  }

  // 목록에서 빠진 파일은 지운다.
  const keep = new Set(list.map(([p]) => p));
  for (const p of Object.keys(have)) {
    if (!keep.has(p)) {
      await cache.delete(fileKey(fileUrl(p)));
      delete have[p];
    }
  }
  saveHave(have);
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
