// 게임 파일 미리 받기. 처음 한 번은 전부, 그다음부터는 files.json 의 해시가 바뀐 파일만 받는다.
// 받은 파일은 Cache Storage 에 넣고, Service Worker(sw.js)가 플레이어에게 꺼내 준다.
const FILES = "lostsaga-files";
const HAVE = "lostsaga-files-have";  // localStorage: 경로 → 받아 둔 파일의 해시
const PARALLEL = 24;  // 작은 파일이 많아 요청마다 기다리는 시간이 대부분이다 (HTTP/2 라 한 연결로 같이 받는다)

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

  let list;
  try {
    const res = await fetch("files.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`files.json ${res.status}`);
    list = (await res.json()).files;
  } catch (e) {
    console.warn("[files]", e);
    return Object.keys(have).length ? "offline" : "missing";
  }

  const todo = list.filter(([p, , h]) => have[p] !== h);
  const first = Object.keys(have).length === 0;
  const total = todo.reduce((a, f) => a + f[1], 0);
  if (todo.length) {
    onStart?.(total, todo.length, first);
    let done = 0;
    let lastSave = Date.now();
    const queue = [...todo];
    const worker = async () => {
      try {
        await work();
      } catch (e) {
        queue.length = 0;  // 하나라도 실패하면 나머지도 멈춘다
        throw e;
      }
    };
    const work = async () => {
      for (let f; (f = queue.shift()); ) {
        const [p, , h] = f;
        const res = await fetch(fileUrl(p), { cache: "no-cache" });
        if (!res.ok) throw new Error(`${p} ${res.status}`);
        // 진행 막대가 큰 파일(플레이어 9MB)에서도 움직이도록 읽은 만큼 센다.
        const reader = res.body.getReader();
        const parts = [];
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          parts.push(value);
          done += value.length;
          onProgress?.(done, total);
        }
        await cache.put(fileKey(fileUrl(p)), new Response(new Blob(parts), {
          headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream" },
        }));
        have[p] = h;
        if (Date.now() - lastSave > 2000) {
          saveHave(have);
          lastSave = Date.now();
        }
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
