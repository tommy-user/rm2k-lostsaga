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
  return {
    leader_actor: leader,
    leader_name: title.has(0x0b) ? cp949.decode(title.get(0x0b)) : "",
    level: int(a, 0x1f, int(title, 0x0c, 1)),
    map_id: int(loc, 0x0b),
    save_count: int(sys, 0x83),
    frame_count: int(sys, 0x0b),
    gold: int(inv, 0x15),
    party,
  };
}
