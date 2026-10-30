// 웹판 Service Worker.
// - 게임·플레이어 파일(games/ player/ bases/)은 런처(files.js)가 미리 받아 둔 저장소에서 꺼내 준다.
//   그래서 맵을 옮길 때 기다리지 않고, 비행기 모드에서도 열린다.
// - 런처 화면과 그것이 쓰는 스크립트·글꼴·그림은 네트워크를 먼저 쓰고, 안 되면 저장해 둔 것을 쓴다.
const FILES = "lostsaga-files";
const SHELL = "lostsaga-shell";
const base = new URL("./", self.location).href;  // …/play/
const site = new URL("../", base).href;          // 소개 사이트 (그림·글꼴)
const SHELL_HOSTS = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];

// 저장할 때와 꺼낼 때 같은 키를 쓰도록 경로를 NFC 로 맞춘다 (한글 파일 이름).
function fileKey(url) {
  const u = new URL(url);
  return u.origin + decodeURIComponent(u.pathname).normalize("NFC");
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = req.url.split(/[?#]/)[0];
  if (url.startsWith(base + "packs/")) return;  // 묶음은 런처가 풀어서 저장하므로 따로 두지 않는다
  if (url.startsWith(base) && /^(games|player|bases)\//.test(url.slice(base.length))) {
    e.respondWith(caches.open(FILES).then(async (c) => (await c.match(fileKey(url))) ?? fetch(req)));
  } else if (url.startsWith(site) || SHELL_HOSTS.some((h) => url.startsWith(h))) {
    e.respondWith(networkFirst(req));
  }
});

async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
