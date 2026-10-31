// RPG Maker 2000 세이브(.lsd) 에서 요약에 필요한 값만 읽는다.
// 서버(Edge Function)의 lsd.ts 와 같은 내용이다. 한쪽을 고치면 다른 쪽도 고친다.

function ber(b, i) {
  let v = 0;
  for (;;) {
    if (i >= b.length) throw new Error("truncated");
    const c = b[i++];
    v = v * 128 + (c & 0x7f);
    if (!(c & 0x80)) return [v, i];
  }
}

function chunks(b) {
  const out = new Map();
  let i = 0;
  while (i < b.length) {
    let id, sz;
    [id, i] = ber(b, i);
    if (id === 0) break;
    [sz, i] = ber(b, i);
    out.set(id, b.subarray(i, i + sz));
    i += sz;
  }
  return out;
}

function array(b) {
  const out = new Map();
  let [n, i] = ber(b, 0);
  for (; n > 0; n--) {
    let idx;
    [idx, i] = ber(b, i);
    const st = i;
    for (;;) {  // 원소: id 0 이 나올 때까지 청크
      let id, sz;
      [id, i] = ber(b, i);
      if (id === 0) break;
      [sz, i] = ber(b, i);
      i += sz;
    }
    out.set(idx, chunks(b.subarray(st, i)));
  }
  return out;
}

const int = (d, k, dflt = 0) => (d?.has(k) ? ber(d.get(k), 0)[0] : dflt);

const cp949 = new TextDecoder("euc-kr");

// 액터의 이름·그림 칸이 "\x01" 이거나 없으면 DB 값 그대로다 (런처가 actors.json 으로 채운다).
const str = (d, k) => {
  const b = d?.get(k);
  return b && !(b.length === 1 && b[0] === 1) ? cp949.decode(b) : null;
};

// 랭킹에 쓰는 게임 안 값. 런처 lsd.js 와 app.js 의 STAGES 도 같은 번호를 쓴다.
// 직업 스위치: 승급할 때마다 앞 단계 스위치를 끄고 다음 단계 스위치를 켠다.
// [직업, 진X(기본), 2차X(1차 승급 뒤), 마스터X(2차 승급 뒤), X선택(마스터 승급 뒤)]
const CLASSES = [
  ["warrior", 33, 21, 121, 734], ["cleric", 34, 22, 122, 738], ["priest", 35, 23, 123, 737],
  ["necro", 36, 24, 124, 740], ["anti", 37, 25, 125, 741], ["tamer", 38, 26, 126, 739],
  ["fighter", 39, 27, 127, 745], ["thief", 40, 28, 128, 736], ["ninja", 59, 29, 129, 735],
  ["wizard", 60, 30, 130, 742], ["elf", 132, 133, 134, 744], ["lord", 135, 136, 137, 743],
];
const MONSTER = [959, 960];  // 진몬스터선택, 몬스터선택. 몬스터는 진화가 따로라 마스터(748)만 본다.
const MASTER = 748;
// 모험 단계: 이 스위치 가운데 가장 뒤의 것이 켜진 번째 (1부터). 이야기 순서다.
export const STAGES = [367, 672, 732, 748, 1811, 1543, 1815, 1930, 1938, 1943, 2050, 2058, 2060, 2063];
const VAR_BREAKTHROUGH = 44;  // 무한의 스크롤 돌파 횟수
const VAR_WAVE = 1056;        // 무한 웨이브 최고 기록
const VAR_WAVE_TIME = 1057;   // 그 기록에 걸린 시간(초)

export function parseLsd(b) {
  let [n, i] = ber(b, 0);
  if (new TextDecoder().decode(b.subarray(i, i + n)) !== "LcfSaveData") throw new Error("not a save");
  i += n;
  const top = new Map();
  while (i < b.length) {
    let id, sz;
    [id, i] = ber(b, i);
    [sz, i] = ber(b, i);
    top.set(id, b.subarray(i, i + sz));
    i += sz;
  }
  const title = chunks(top.get(0x64) ?? new Uint8Array());  // 세이브 목록에 보이는 이름·레벨
  const sys = chunks(top.get(0x65) ?? new Uint8Array());
  const loc = chunks(top.get(0x68) ?? new Uint8Array());
  const inv = chunks(top.get(0x6d) ?? new Uint8Array());
  const acts = array(top.get(0x6c) ?? new Uint8Array([0]));

  const party = [];
  const pb = inv.get(2);
  if (pb) for (let k = 0; k + 1 < pb.length && party.length < int(inv, 1); k += 2) party.push(pb[k] | (pb[k + 1] << 8));
  const leader = party[0] ?? 0;
  const a = acts.get(leader);
  const level = int(a, 0x1f, int(title, 0x0c, 1));

  const sw = sys.get(0x20) ?? new Uint8Array();
  const on = (n) => n <= sw.length && sw[n - 1] !== 0;
  const vars = sys.get(0x22) ?? new Uint8Array();
  const v = (n) => (n * 4 <= vars.length ? new DataView(vars.buffer, vars.byteOffset + (n - 1) * 4, 4).getInt32(0, true) : 0);
  const sprite = str(a, 0x0b), face = str(a, 0x15);
  const eq = a?.get(0x3d);
  let job = "", promotion = 0;
  for (const [key, ...steps] of CLASSES) {
    steps.forEach((n, i) => { if (on(n)) { job = key; promotion = Math.max(promotion, i); } });
  }
  if (!job && MONSTER.some(on)) {
    job = "monster";
    promotion = on(MASTER) ? 3 : 0;
  }
  let stage = 0;
  STAGES.forEach((s, i) => { if (on(s)) stage = i + 1; });

  return {
    leader_actor: leader,
    leader_name: title.has(0x0b) ? cp949.decode(title.get(0x0b)) : "",
    level,
    map_id: int(loc, 0x0b),
    save_count: int(sys, 0x83),
    frame_count: int(sys, 0x0b),
    gold: int(inv, 0x15),
    party,
    leader: {
      actor: leader, level, name: str(a, 0x01), title: str(a, 0x02),
      sprite, sprite_index: sprite === null ? null : int(a, 0x0c),
      face, face_index: face === null ? null : int(a, 0x16),
      equips: eq ? Array.from({ length: Math.floor(eq.length / 2) }, (_, k) => eq[2 * k] | (eq[2 * k + 1] << 8)) : [],
    },
    job, promotion,
    breakthrough: Math.max(0, v(VAR_BREAKTHROUGH)),
    stage,
    wave: Math.max(0, v(VAR_WAVE)),
    wave_time: Math.max(0, v(VAR_WAVE_TIME)),
  };
}

// ---- 이름 바꾸기 (런처 전용) ----
// 파티 첫 액터의 이름과 불러오기 목록에 보이는 이름을 바꾸고, 저장 횟수를 1 올린다.
// 저장 횟수를 올려 "한 번 더 저장한 세이브" 로 만들어야 서버의 계보(직전 세이브 → 다음 세이브)가 이어진다.

// 게임에서 쓸 수 있는 이름: 한글 완성형·영문·숫자·띄어쓰기와 게임 글자표에 있는 기호. 게임 창에 맞게 6자까지.
export const NAME_MAX = 6;
export const NAME_CHARS = /^[가-힣A-Za-z0-9 ·☆~]$/u;
export const nameNormal = (s) => s.normalize("NFC").trim().replace(/\s+/g, " ");

let cp949Table;
function cp949Encode(s) {
  if (!cp949Table) {
    cp949Table = new Map();
    const dec = new TextDecoder("euc-kr");
    for (let a = 0x81; a <= 0xfe; a++) {
      for (let b = 0x41; b <= 0xfe; b++) {
        const c = dec.decode(new Uint8Array([a, b]));
        if (c.length === 1 && c !== "�" && !cp949Table.has(c)) cp949Table.set(c, [a, b]);
      }
    }
  }
  const out = [];
  for (const c of s) {
    if (c.charCodeAt(0) < 0x80) out.push(c.charCodeAt(0));
    else if (cp949Table.has(c)) out.push(...cp949Table.get(c));
    else throw new Error(`cp949: ${c}`);
  }
  return new Uint8Array(out);
}

function berBytes(v) {
  const out = [v & 0x7f];
  for (v = Math.floor(v / 128); v > 0; v = Math.floor(v / 128)) out.unshift((v & 0x7f) | 0x80);
  return out;
}

// 구조체: [id, 내용] 목록과 끝의 0 (있으면)
function readStruct(b) {
  const list = [];
  let i = 0, end = false;
  while (i < b.length) {
    let id, sz;
    [id, i] = ber(b, i);
    if (id === 0) { end = true; break; }
    [sz, i] = ber(b, i);
    list.push([id, b.subarray(i, i + sz)]);
    i += sz;
  }
  return { list, end };
}

function writeStruct({ list, end }) {
  const parts = [];
  for (const [id, data] of [...list].sort((x, y) => x[0] - y[0])) parts.push(berBytes(id), berBytes(data.length), data);
  if (end) parts.push([0]);
  return concat(parts);
}

function concat(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function setField(st, id, data) {
  const f = st.list.find(([k]) => k === id);
  if (f) f[1] = data;
  else st.list.push([id, data]);
}

export function renameLeader(b, name) {
  let [n, i] = ber(b, 0);
  const head = b.subarray(0, i + n);
  i += n;
  const top = [];
  while (i < b.length) {
    let id, sz;
    [id, i] = ber(b, i);
    [sz, i] = ber(b, i);
    top.push([id, b.subarray(i, i + sz)]);
    i += sz;
  }
  const get = (id) => top.find(([k]) => k === id);
  const raw = cp949Encode(name);

  const inv = chunks(get(0x6d)?.[1] ?? new Uint8Array());
  const pb = inv.get(2);
  const leader = pb && pb.length >= 2 ? pb[0] | (pb[1] << 8) : 0;
  if (!leader) throw new Error("no party");

  // 액터 목록: 개수, 그다음 (번호, 구조체) 반복
  const acts = get(0x6c);
  let [count, j] = ber(acts[1], 0);
  const elems = [];
  for (let k = 0; k < count; k++) {
    let idx;
    [idx, j] = ber(acts[1], j);
    const st = j;
    for (;;) {
      let id, sz;
      [id, j] = ber(acts[1], j);
      if (id === 0) break;
      [sz, j] = ber(acts[1], j);
      j += sz;
    }
    elems.push([idx, readStruct(acts[1].subarray(st, j))]);
  }
  const me = elems.find(([idx]) => idx === leader);
  if (!me) throw new Error("no leader");
  setField(me[1], 0x01, raw);
  acts[1] = concat([berBytes(count), ...elems.flatMap(([idx, s]) => [berBytes(idx), writeStruct(s)])]);

  const title = get(0x64);
  if (title) {
    const st = readStruct(title[1]);
    setField(st, 0x0b, raw);
    title[1] = writeStruct(st);
  }
  const sys = get(0x65);
  const st = readStruct(sys[1]);
  const sc = st.list.find(([k]) => k === 0x83);
  setField(st, 0x83, new Uint8Array(berBytes((sc ? ber(sc[1], 0)[0] : 0) + 1)));
  sys[1] = writeStruct(st);

  return concat([head, ...top.flatMap(([id, data]) => [berBytes(id), berBytes(data.length), data])]);
}
