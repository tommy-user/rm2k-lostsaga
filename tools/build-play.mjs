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
// 런처가 보여 줄 게임 버전 (배포 때 GAME_TAG 로 릴리즈 태그를 준다)
fs.writeFileSync(path.join(out, "play/version.json"), JSON.stringify({ game: process.env.GAME_TAG ?? "dev", built: new Date().toISOString() }));
fs.writeFileSync(path.join(out, "play/maps.json"), JSON.stringify(mapNames(path.join(gameSrc, "RPG_RT.lmt"))));

const index = { metadata: { version: 2, date: new Date().toISOString().slice(0, 10) }, cache: walk(game, 4, true) };
fs.writeFileSync(path.join(game, "index.json"), JSON.stringify(index));

// 런처가 처음 한 번 미리 받아 둘 파일 목록: [play/ 기준 경로, 크기, 내용 해시].
// 다음 접속 때는 해시가 바뀐 파일만 다시 받는다.
const play = path.join(out, "play");
const files = [];
for (const dir of ["games/lostsaga", "player", "bases"]) {
  for (const rel of fs.readdirSync(path.join(play, dir), { recursive: true })) {
    const full = path.join(play, dir, rel);
    if (!fs.statSync(full).isFile() || /\.md$/.test(rel)) continue;
    const b = fs.readFileSync(full);
    files.push([`${dir}/${rel}`.normalize("NFC"), b.length, crypto.createHash("sha1").update(b).digest("hex").slice(0, 16)]);
  }
}
files.sort((a, b) => (a[0] < b[0] ? -1 : 1));
fs.writeFileSync(path.join(play, "files.json"), JSON.stringify({ version: process.env.GAME_TAG ?? "dev", files }));
console.log(`built ${out}`);
