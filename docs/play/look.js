// 랭킹·대표 캐릭터 그림. 받아 둔 게임 파일(CharSet·FaceSet)에서 잘라 그린다.
// 세이브에는 게임 중에 바뀐 이름·그림만 들어 있어서, 나머지는 빌드 때 RPG_RT.ldb 에서 뽑은 actors.json 으로 채운다.

export const JOBS = {
  warrior: "워리어", cleric: "클레릭", priest: "프리스트", necro: "네크로맨서", anti: "안티프리스트", tamer: "테이머",
  fighter: "격투가", thief: "도적", ninja: "닌자", wizard: "위저드", elf: "요정", lord: "군주", monster: "몬스터",
};
export const PROMOTIONS = ["기본", "1차", "2차", "마스터"];

// gencache(index.json) 와 같은 규칙: 키는 NFKC 소문자, 확장자를 뗀다.
const norm = (s) => s.normalize("NFC").toLowerCase().normalize("NFKC");

let index, actors;
const gameIndex = () => (index ??= fetch("games/lostsaga/index.json").then((r) => r.json()).then((j) => j.cache).catch(() => ({})));
const actorTable = () => (actors ??= fetch("actors.json").then((r) => r.json()).catch(() => ({})));

// 승급 외형 (게임의 CE 936 과 같은 규칙, 스튜디오 scripts/content/class-looks/gen_events.py):
// 액터 → [G1_ 시트, 첫 칸]. 시트 칸은 기본·1차·2차·마스터 순이라 첫 칸 + 승급 단계를 그린다.
// 세이브의 그림을 그대로 쓰지 않는 이유: 외형 개편 전 세이브는 옛 2차 그림이 남아 있고, 변신(투명망토 등) 중에 저장하면 변신 그림이 남는다.
const CLASS_LOOKS = {
  1: ["워리어", 0], 2: ["워리어", 4], 3: ["클레릭", 0], 4: ["클레릭", 4], 6: ["프리스트", 0], 5: ["프리스트", 4],
  8: ["네크로", 0], 7: ["네크로", 4], 9: ["안티", 0], 10: ["안티", 4], 11: ["테이머", 0], 12: ["테이머", 4],
  13: ["격투가", 0], 14: ["격투가", 4], 15: ["도적", 0], 16: ["도적", 4], 17: ["닌자", 0], 18: ["닌자", 4],
  19: ["위저드_불", 0], 20: ["위저드_불", 4], 24: ["위저드_물", 0], 30: ["위저드_물", 4],
  25: ["위저드_전기", 0], 31: ["위저드_전기", 4], 26: ["위저드_얼음", 0], 32: ["위저드_얼음", 4],
  27: ["위저드_대지", 0], 33: ["위저드_대지", 4], 28: ["위저드_바람", 0], 34: ["위저드_바람", 4],
  36: ["요정_에리나", 0], 37: ["요정_에리나", 4], 38: ["요정_린도르", 0], 39: ["요정_린도르", 4],
  74: ["군주_카르온", 0], 75: ["군주_제시나", 0],
};

// 서버가 돌려준 캐릭터(look_of)를 그릴 수 있게 채운다.
// 직업 캐릭터는 승급 외형, 그 밖(몬스터 등)은 세이브의 그림, 세이브에 없으면 DB 기본값.
export async function resolveLook(l) {
  const a = (await actorTable())[l.actor] ?? [];
  const look = {
    ...l,
    name: l.name ?? a[0] ?? "",
    title: l.title ?? a[1] ?? "",
    sprite: l.sprite ?? a[2] ?? "",
    spriteIndex: l.sprite != null ? (l.sprite_index ?? 0) : (a[3] ?? 0),
    face: l.face ?? a[4] ?? "",
    faceIndex: l.face != null ? (l.face_index ?? 0) : (a[5] ?? 0),
  };
  const c = CLASS_LOOKS[l.actor];
  if (c) {
    const cell = c[1] + Math.min(3, Math.max(0, Number(l.promotion) || 0));
    look.sprite = look.face = `G1_${c[0]}`;
    look.spriteIndex = look.faceIndex = cell;
  }
  return look;
}

// RM2K 그림은 팔레트 0번 색이 투명이다 (EasyRPG 처럼 tRNS 와 상관없이).
function keyColor(b) {
  if (b[0] === 0x89 && b[1] === 0x50) {
    for (let i = 8; i + 8 <= b.length; ) {
      const n = (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0;
      const t = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      if (t === "PLTE") return [b[i + 8], b[i + 9], b[i + 10]];
      if (t === "IDAT") break;
      i += 12 + n;
    }
    return null;
  }
  if (b[0] === 0x42 && b[1] === 0x4d && b[28] === 8) {  // 8비트 BMP: 팔레트는 BGRA
    const p = 14 + (b[14] | b[15] << 8);
    return [b[p + 2], b[p + 1], b[p]];
  }
  return null;
}

const sheets = new Map();
function sheet(dir, name) {
  const k = `${dir}/${name}`;
  if (!sheets.has(k)) {
    sheets.set(k, (async () => {
      const d = (await gameIndex())[norm(dir)];
      const file = name && d?.[norm(name)];
      if (!file || /\.xyz$/i.test(file)) return null;
      const res = await fetch(`games/lostsaga/${encodeURIComponent(d._dirname)}/${encodeURIComponent(file)}`);
      if (!res.ok) return null;
      const b = new Uint8Array(await res.arrayBuffer());
      // 감마(gAMA) 보정을 하면 팔레트 색과 달라져 투명색을 못 찾으므로 끈다.
      const img = await createImageBitmap(new Blob([b]), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const key = keyColor(b);
      if (key) {
        const px = g.getImageData(0, 0, c.width, c.height);
        const a = px.data;
        for (let i = 0; i < a.length; i += 4) {
          // tRNS 로 이미 투명한 칸(색이 0 으로 풀릴 수 있다)과 0번 색은 투명, 나머지는 게임처럼 불투명하게.
          if (a[i + 3] === 0 || (a[i] === key[0] && a[i + 1] === key[1] && a[i + 2] === key[2])) a[i + 3] = 0;
          else a[i + 3] = 255;
        }
        g.putImageData(px, 0, 0);
      }
      return c;
    })().catch((e) => {
      console.warn("[look]", k, e);
      return null;
    }));
  }
  return sheets.get(k);
}

// 걷기 그림: 한 장에 캐릭터 4×2 (한 캐릭터 72×128 = 3칸 × 4방향). 아래를 보는 가운데 칸을 그린다.
export async function drawSprite(canvas, look) {
  canvas.width = 24;
  canvas.height = 32;
  const s = await sheet("CharSet", look.sprite);
  if (!s) return false;
  const per = Math.max(1, Math.floor(s.width / 72));
  const i = look.spriteIndex;
  canvas.getContext("2d").drawImage(s, (i % per) * 72 + 24, Math.floor(i / per) * 128 + 64, 24, 32, 0, 0, 24, 32);
  return true;
}

// 얼굴: 한 장에 48×48 이 4×4.
export async function drawFace(canvas, look) {
  canvas.width = 48;
  canvas.height = 48;
  const s = await sheet("FaceSet", look.face);
  if (!s) return false;
  const per = Math.max(1, Math.floor(s.width / 48));
  const i = look.faceIndex;
  canvas.getContext("2d").drawImage(s, (i % per) * 48, Math.floor(i / per) * 48, 48, 48, 0, 0, 48, 48);
  return true;
}

export function lookLine(l) {
  return [l.name, l.title].filter(Boolean).join(" · ");
}

export function growthText(l) {
  const bt = Number(l.breakthrough) || 0;
  return `${PROMOTIONS[l.promotion] ?? ""} Lv${l.level}${bt ? ` · 돌파 ${bt}` : ""}`;
}

// 플레이 시간 (60프레임 = 1초) → "38:12" (시간:분)
export function playTime(frames) {
  if (frames == null) return "";
  const m = Math.floor(frames / 3600);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
