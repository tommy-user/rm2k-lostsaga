// 웹판 사이트 조립: docs/ 를 그대로 복사하고, 게임 폴더를 play/games/lostsaga/ 에 넣은 뒤
// EasyRPG 웹 플레이어가 읽는 index.json(gencache 형식 v2)을 만든다.
//   node tools/build-play.mjs [출력 폴더=_site]
// 게임 폴더는 GAME_DIR 로 바꿀 수 있다 (배포 때는 최신 정식 릴리즈 태그의 게임을 넣는다).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.resolve(process.argv[2] ?? path.join(root, "_site"));
const gameSrc = path.resolve(process.env.GAME_DIR ?? path.join(root, "rm2k-lostsaga"));
const game = path.join(out, "play/games/lostsaga");
const SKIP = /\.(exe|lsd|dll)$|^easyrpg_log\.txt$|^\.DS_Store$/i;

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, "docs"), out, { recursive: true });
fs.cpSync(gameSrc, game, {
  recursive: true,
  filter: (src) => !SKIP.test(path.basename(src)),
});

// gencache 와 같은 규칙: 키는 NFKC 소문자, 루트와 .ini/.po 외에는 확장자를 뗀다.
const norm = (s) => s.normalize("NFC").toLowerCase().normalize("NFKC");
const stripExt = (s) => (s.includes(".") ? s.slice(0, s.lastIndexOf(".")) : s);

function walk(dir, depth, first = false) {
  const r = {};
  if (depth === 0) return r;
  if (!first) r._dirname = path.basename(dir).normalize("NFC");
  for (const name of fs.readdirSync(dir)) {
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

// 세이브 목록에 맵 이름을 보이려고 RPG_RT.lmt 에서 맵 id → 이름을 뽑는다.
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
  i += head;  // "LcfMapTree"
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
// 랭킹·대표 캐릭터에 캐릭터를 그리려고 RPG_RT.ldb 에서 액터 id → [이름, 직함, 걷기 그림, 번호, 얼굴, 번호] 를 뽑는다.
// 세이브에는 게임 중에 바뀐 값만 들어 있어서 나머지는 이 값을 쓴다.
function actorLooks(file) {
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
  i += head;  // "LcfDataBase"
  const cp949 = new TextDecoder("euc-kr");
  const looks = {};
  while (i < b.length) {
    const id = ber();
    const size = ber();
    if (id !== 0x0b) {  // 액터 목록만 본다
      i += size;
      continue;
    }
    for (let n = ber(); n > 0; n--) {
      const actor = ber();
      const a = ["", "", "", 0, "", 0];
      for (let c = ber(); c !== 0; c = ber()) {
        const sz = ber();
        const at = i;
        const s = () => cp949.decode(b.subarray(at, at + sz));
        if (c === 0x01) a[0] = s();
        else if (c === 0x02) a[1] = s();
        else if (c === 0x03) a[2] = s();
        else if (c === 0x04) a[3] = ber();
        else if (c === 0x0f) a[4] = s();
        else if (c === 0x10) a[5] = ber();
        i = at + sz;
      }
      looks[actor] = a;
    }
    break;
  }
  return looks;
}
// 런처가 보여 줄 게임 버전 (배포 때 GAME_TAG 로 릴리즈 태그를 준다)
fs.writeFileSync(path.join(out, "play/version.json"), JSON.stringify({ game: process.env.GAME_TAG ?? "dev", built: new Date().toISOString() }));
fs.writeFileSync(path.join(out, "play/maps.json"), JSON.stringify(mapNames(path.join(gameSrc, "RPG_RT.lmt"))));
fs.writeFileSync(path.join(out, "play/actors.json"), JSON.stringify(actorLooks(path.join(gameSrc, "RPG_RT.ldb"))));

const index = { metadata: { version: 2, date: new Date().toISOString().slice(0, 10) }, cache: walk(game, 4, true) };
fs.writeFileSync(path.join(game, "index.json"), JSON.stringify(index));

// 런처가 처음 한 번 미리 받아 둘 파일. 파일이 2천 개라 하나씩 받으면 요청이 너무 많아
// GitHub Pages 가 막는다(429). 폴더별로 약 4MB 씩 묶음(packs/*.bin)으로 합쳐 둔다.
// 묶음 이름에 내용 해시가 들어가 있어, 파일이 바뀌면 그 파일이 든 묶음만 다시 받는다.
const play = path.join(out, "play");
const PACK = 4e6;
const groups = new Map();  // 묶음 이름 → [play/ 기준 경로]
for (const dir of ["player", "bases", "games/lostsaga"]) {
  for (const rel of fs.readdirSync(path.join(play, dir), { recursive: true }).sort()) {
    const p = `${dir}/${rel}`;
    if (!fs.statSync(path.join(play, p)).isFile() || /\.md$/.test(p)) continue;
    const top = rel.includes(path.sep) ? rel.split(path.sep)[0] : "root";
    const g = dir === "games/lostsaga" ? `game-${top}` : dir;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
}
const packs = [];
fs.mkdirSync(path.join(play, "packs"));
let gi = 0;
for (const [g, paths] of groups) {
  let chunk = [];
  let size = 0;
  const flush = () => {
    if (!chunk.length) return;
    const bufs = chunk.map((p) => fs.readFileSync(path.join(play, p)));
    const all = Buffer.concat(bufs);
    const hash = crypto.createHash("sha1").update(all).digest("hex").slice(0, 16);
    const url = `packs/${gi++}-${hash}.bin`;  // 폴더 이름(한글)은 주소에 넣지 않는다
    fs.writeFileSync(path.join(play, url), all);
    let off = 0;
    const files = chunk.map((p, i) => {
      const f = [p.normalize("NFC"), bufs[i].length, crypto.createHash("sha1").update(bufs[i]).digest("hex").slice(0, 16), off];
      off += bufs[i].length;
      return f;
    });
    packs.push({ name: g, url, size: all.length, files });
    chunk = [];
    size = 0;
  };
  for (const p of paths) {
    const n = fs.statSync(path.join(play, p)).size;
    if (size && size + n > PACK) flush();
    chunk.push(p);
    size += n;
  }
  flush();
}
fs.writeFileSync(path.join(play, "files.json"), JSON.stringify({ version: process.env.GAME_TAG ?? "dev", packs }));
console.log(`built ${out}`);
