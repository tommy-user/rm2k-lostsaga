// 테스트 링크(test/) 한 벌 만들기: PR(또는 main)의 게임 폴더를 웹판에 올라간 게임(최신 정식 릴리즈)과 비교해
// 달라진 파일과 플레이어가 읽는 index.json 을 묶음(pack-N.bin, 약 16MB씩)으로 합치고 meta.json·maps.json 을 만든다.
// 런처(play/?test=<id>)가 묶음을 한 번에 받아 메모리에서 넘겨주고, 바뀌지 않은 파일은 웹판 게임(런처가 받아 둔 저장소)을 쓴다.
// 파일 하나씩 받으면 맵을 옮길 때마다 기다리고 GitHub Pages 가 막는다(429) — 운영 지시 #254.
//   GAME_DIR=<PR 게임 폴더> BASE_DIR=<릴리즈 게임 폴더> node tools/build-preview.mjs <출력 폴더> <id> [제목]
// meta.json 의 branch·sha·base 는 PREVIEW_BRANCH·PREVIEW_SHA·GAME_TAG 로 준다.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [outArg, id, title = ""] = process.argv.slice(2);
if (!outArg || !/^[a-z0-9-]+$/.test(id ?? "")) {
  console.error("사용: GAME_DIR=… BASE_DIR=… node tools/build-preview.mjs <출력 폴더> <id: 영문 소문자·숫자·->");
  process.exit(1);
}
const out = path.resolve(outArg);
const game = path.resolve(process.env.GAME_DIR);
const base = path.resolve(process.env.BASE_DIR);
const SKIP = /\.(exe|lsd|dll)$|^easyrpg_log\.txt$|^\.DS_Store$/i;

// build-play.mjs 의 index.json(gencache v2) 규칙과 같다.
const norm = (s) => s.normalize("NFC").toLowerCase().normalize("NFKC");
const stripExt = (s) => (s.includes(".") ? s.slice(0, s.lastIndexOf(".")) : s);
function walk(dir, depth, first = false) {
  const r = {};
  if (depth === 0) return r;
  if (!first) r._dirname = path.basename(dir).normalize("NFC");
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.test(name)) continue;
    const full = path.join(dir, name);
    const nfc = name.normalize("NFC");
    const low = norm(name);
    if (fs.statSync(full).isDirectory()) {
      const t = walk(full, depth - 1);
      if (Object.keys(t).length) r[low] = t;
    } else if (first || low.endsWith(".ini") || low.endsWith(".po")) {
      r[stripExt(low) === "exfont" ? "exfont" : low] = nfc;
    } else {
      r[stripExt(low)] = nfc;
    }
  }
  return r;
}

const sha = (f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");
// 릴리즈 쪽 파일을 NFC 경로로 찾는다 (macOS 에서 만든 폴더는 이름이 NFD 일 수 있다).
const baseFiles = new Map();
for (const rel of fs.readdirSync(base, { recursive: true })) {
  const full = path.join(base, rel);
  if (fs.statSync(full).isFile()) baseFiles.set(rel.normalize("NFC"), full);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const changed = [];
const blobs = [];  // [경로, 내용]
let bytes = 0;
for (const rel of fs.readdirSync(game, { recursive: true }).sort()) {
  const full = path.join(game, rel);
  if (!fs.statSync(full).isFile() || rel.split(path.sep).some((p) => SKIP.test(p))) continue;
  const nfc = rel.normalize("NFC");
  const b = baseFiles.get(nfc);
  if (b && fs.statSync(b).size === fs.statSync(full).size && sha(b) === sha(full)) continue;
  const rp = nfc.split(path.sep).join("/");
  changed.push(rp);
  blobs.push([rp, fs.readFileSync(full)]);
  bytes += fs.statSync(full).size;
}

// 세이브 목록·빠른 시작에 맵 이름을 보이려고 RPG_RT.lmt 에서 맵 id → 이름을 뽑는다 (build-play.mjs 와 같다).
function mapNames(file) {
  const b = fs.readFileSync(file);
  let i = 0;
  const ber = () => {
    let v = 0;
    for (;;) {
      const c = b[i++];
      v = v * 128 + (c & 0x7f);
      if (!(c & 0x80)) return v;
    }
  };
  const head = ber();
  i += head;  // "LcfMapTree" (i += ber() 로 쓰면 ber 가 옮기기 전의 i 에 더해진다)
  const cp949 = new TextDecoder("euc-kr");
  const names = {};
  for (let n = ber(); n > 0; n--) {
    const id = ber();
    for (let c = ber(); c !== 0; c = ber()) {
      const sz = ber();
      if (c === 0x01 && id > 0) names[id] = cp949.decode(b.subarray(i, i + sz));
      i += sz;
    }
  }
  return names;
}

blobs.push(["index.json", Buffer.from(JSON.stringify({
  metadata: { version: 2, date: new Date().toISOString().slice(0, 10) },
  cache: walk(game, 4, true),
}))]);

// 묶음: 파일을 이어 붙인 것. meta.json 의 packs[].files = [경로, 크기, 시작 위치]
const PACK = 16e6;
const packs = [];
for (const [rp, buf] of blobs) {
  let k = packs.at(-1);
  if (!k || (k.size && k.size + buf.length > PACK)) packs.push((k = { url: `pack-${packs.length}.bin`, size: 0, files: [], parts: [] }));
  k.files.push([rp, buf.length, k.size]);
  k.parts.push(buf);
  k.size += buf.length;
}
for (const k of packs) {
  fs.writeFileSync(path.join(out, k.url), Buffer.concat(k.parts));
  delete k.parts;
}
fs.writeFileSync(path.join(out, "maps.json"), JSON.stringify(mapNames(path.join(game, "RPG_RT.lmt"))));
fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify({
  id,
  title,
  branch: process.env.PREVIEW_BRANCH ?? "",
  sha: process.env.PREVIEW_SHA ?? "",
  base: process.env.GAME_TAG ?? "",
  built: new Date().toISOString(),
  changed,
  packs,
}));
console.log(`preview ${id}: 바뀐 파일 ${changed.length}개, ${(bytes / 1e6).toFixed(1)}MB, 묶음 ${packs.length}개 → ${out}`);
