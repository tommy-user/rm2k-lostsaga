// 화면 버튼 배치 바꾸기 (터치 기기). 버튼마다 끌어서 옮기고 크기·불투명도를 바꾼다.
// 게임 화면 위에도 놓을 수 있다 (머리줄·홈·배치 바꾸기 버튼만 피한다). 편집 칸은 고른 버튼을 가리지 않는 높이로 옮긴다.
// 기본 배치는 CSS 가 정한 자리 그대로이고, 바꾼 값은 그 자리에서 옮긴 거리·크기(transform)와 불투명도로만 얹는다.
// 세로·가로 배치를 따로 이 기기(localStorage)에 저장한다. 읽기·쓰기가 안 되면 기본 배치로 쓴다.

const STORE = "lostsaga-pad-layout";
const NAMES = {
  speed: "2배속 버튼", title: "타이틀로 버튼", shift: "Shift 버튼", ok: "결정 버튼", cancel: "취소 버튼", dpad: "방향키 (한 덩어리)",
};
const OPTIONAL = ["speed", "title", "shift"];  // 숨길 수 있는 버튼
const SIZE = [70, 150];
const ALPHA = [30, 100];
const MARGIN = 4;  // 화면 가장자리에서 띄우는 거리

const num = (v, lo, hi, d) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE));
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}

export function createPad({ play, onEdit }) {
  const all = load();
  const $ = (s) => document.querySelector(s);
  const panel = $("#pad-edit"), tag = $("#pe-tag"), nameEl = $("#pe-name");
  const size = $("#pe-size"), alpha = $("#pe-alpha");
  const checks = [...panel.querySelectorAll("[data-show]")];
  let editing = false, sel = null, drag = null;

  const orient = () => (matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape");
  function layout() {
    const k = orient();
    if (!isObj(all[k])) all[k] = {};
    if (!isObj(all[k].parts)) all[k].parts = {};
    if (!isObj(all[k].hidden)) all[k].hidden = {};
    return all[k];
  }
  function part(id) {
    const p = layout().parts[id] ?? {};
    return { x: num(p.x, -5000, 5000, 0), y: num(p.y, -5000, 5000, 0), s: num(p.s, ...SIZE, 100), o: num(p.o, ...ALPHA, 100) };
  }
  const shown = (id) => !OPTIONAL.includes(id) || layout().hidden[id] !== true;
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(all));
    } catch {}
  }

  const els = (id) => [...play.querySelectorAll(`[data-pad="${id}"]`)];
  const visible = (el) => el.getClientRects().length > 0;  // 이 방향에서 쓰지 않는 버튼(display: none)은 건너뛴다
  const shownEl = (id) => els(id).find(visible);

  // transform 을 빼고 잰 원래 자리
  function home(el) {
    const t = el.style.transform;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    el.style.transform = t;
    return r;
  }

  // 편집 패널을 펼칠 곳: 게임 화면 (세로에서는 그 위 머리줄까지)
  function area() {
    const rs = [play.querySelector(".screen"), play.querySelector(".play-head")]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rs.length) return null;
    return {
      l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)),
      r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)),
    };
  }

  // 버튼이 덮으면 안 되는 곳: 세로의 머리줄, 홈·배치 바꾸기 버튼 (가리면 배치를 되돌릴 수 없다).
  // 게임 화면은 덮어도 된다 (불투명도를 낮춰 겹쳐 쓰는 사람이 있다).
  function blocked() {
    return [play.querySelector(".play-head"), ...play.querySelectorAll('[data-act="home"], [data-act="layout"]')]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      .map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
  }

  // 화면 밖으로 나가거나 막힌 곳을 덮으면 가장 가까운 빈 곳으로 밀어낸다.
  function fit(base, p) {
    const box = play.getBoundingClientRect(), no = blocked();
    const k = p.s / 100, w = base.width * k, h = base.height * k;
    const cx = base.left + base.width / 2, cy = base.top + base.height / 2;
    const lo = [box.left + MARGIN, box.top + MARGIN], hi = [box.right - MARGIN - w, box.bottom - MARGIN - h];
    const inside = (l, t) => l >= lo[0] - 0.5 && l <= hi[0] + 0.5 && t >= lo[1] - 0.5 && t <= hi[1] + 0.5;
    const hit = (l, t) => no.filter((n) => l < n.r && l + w > n.l && t < n.b && t + h > n.t);
    let l = Math.max(lo[0], Math.min(hi[0], cx + p.x - w / 2));
    let t = Math.max(lo[1], Math.min(hi[1], cy + p.y - h / 2));
    const hits = hit(l, t);
    if (hits.length) {
      const out = hits.flatMap((n) => [[n.l - w, t], [n.r, t], [l, n.t - h], [l, n.b]])
        .filter(([a, b]) => inside(a, b) && !hit(a, b).length)
        .sort((m, n) => Math.hypot(m[0] - l, m[1] - t) - Math.hypot(n[0] - l, n[1] - t));
      if (out.length) [l, t] = out[0];
    }
    return { ...p, x: Math.round(l + w / 2 - cx), y: Math.round(t + h / 2 - cy) };
  }

  function apply() {
    for (const id of Object.keys(NAMES)) {
      const p = part(id);
      for (const el of els(id)) {
        el.classList.toggle("pad-off", !shown(id));
        el.style.opacity = p.o < 100 ? String(p.o / 100) : "";
        if ((!p.x && !p.y && p.s === 100) || !visible(el)) {
          el.style.transform = el.style.zIndex = "";
          continue;
        }
        const q = fit(home(el), p);
        el.style.transform = `translate(${q.x}px, ${q.y}px) scale(${q.s / 100})`;
        // 옮긴 버튼은 원래 칸(.pad, .quick) 밖으로 나가 뒤에 그려지는 칸·버튼에 덮이면 눌리지 않으므로 맨 위로 올린다.
        el.style.zIndex = "1";
      }
    }
    showTag();
  }

  function set(id, patch) {
    const el = shownEl(id);
    let p = { ...part(id), ...patch };
    if (el) p = fit(home(el), p);
    layout().parts[id] = p;
    apply();
  }

  // ---- 편집 화면 ----

  // 편집 칸(머리줄 + 설정)은 게임 화면 너비로 펼치고, 높이는 버튼을 가장 덜 가리는 자리로 정한다.
  // 버튼이 게임 화면 위에도 올 수 있어서다. 고른 버튼은 절대 가리지 않고, 비기면 원래 자리(화면 맨 위)에 가까운 쪽.
  function place() {
    const a = area();
    if (!a) return;
    const box = play.getBoundingClientRect();
    Object.assign(panel.style, { left: `${a.l}px`, width: `${a.r - a.l}px`, top: `${a.t}px`, height: "", maxHeight: `${box.height}px` });
    const h = panel.offsetHeight;
    const rects = Object.keys(NAMES).filter(shown).map((id) => [id, shownEl(id)]).filter(([, el]) => el)
      .map(([id, el]) => [id, el.getBoundingClientRect()]);
    const cover = (t, r) => Math.max(0, Math.min(a.r, r.right) - Math.max(a.l, r.left)) * Math.max(0, Math.min(t + h, r.bottom) - Math.max(t, r.top));
    let best = a.t, score = Infinity;
    for (let t = box.top; t <= box.bottom - h + 0.5; t += 4) {
      const v = rects.reduce((sum, [id, r]) => sum + cover(t, r) * (id === sel ? 1e6 : 1), 0) + Math.abs(t - a.t) / 1e3;
      if (v < score) [best, score] = [t, v];
    }
    panel.style.top = `${best}px`;
  }

  function showTag() {
    const el = editing && sel && shownEl(sel);
    tag.hidden = !el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    tag.textContent = `선택됨 · ${part(sel).s}%`;
    tag.style.left = `${Math.max(tag.offsetWidth + MARGIN, r.right)}px`;
    tag.style.top = `${r.top - 6 > 30 ? r.top - 6 : r.bottom + 6 + tag.offsetHeight}px`;
  }

  function select(id) {
    sel = id;
    for (const el of play.querySelectorAll("[data-pad]")) el.classList.toggle("sel", el.dataset.pad === id);
    const p = id ? part(id) : null;
    // 편집 칸에 덮인 버튼도 고를 수 있게 목록으로도 고른다
    nameEl.replaceChildren(new Option("옮길 버튼 고르기", ""),
      ...Object.keys(NAMES).filter((k) => shown(k) && shownEl(k)).map((k) => new Option(NAMES[k], k)));
    nameEl.value = id ?? "";
    size.disabled = alpha.disabled = !id;
    size.value = p?.s ?? 100;
    alpha.value = p?.o ?? 100;
    size.nextElementSibling.textContent = p ? `${p.s}%` : "";
    alpha.nextElementSibling.textContent = p ? `${p.o}%` : "";
    for (const c of checks) c.checked = shown(c.dataset.show);
    showTag();
    if (editing) place();
  }

  function edit() {
    if (editing) return;
    onEdit?.();
    editing = true;
    play.classList.add("editing");
    panel.hidden = false;
    place();
    select(null);
    $("#pe-done").focus();
  }

  function done() {
    editing = false;
    drag = null;
    play.classList.remove("editing");
    panel.hidden = true;
    select(null);
    save();
  }

  $("#pe-done").onclick = done;
  nameEl.onchange = () => select(nameEl.value || null);
  $("#pe-reset").onclick = () => {
    all[orient()] = {};
    save();
    apply();
    select(null);
  };
  size.oninput = () => {
    if (!sel) return;
    set(sel, { s: Number(size.value) });
    size.nextElementSibling.textContent = `${size.value}%`;
  };
  alpha.oninput = () => {
    if (!sel) return;
    set(sel, { o: Number(alpha.value) });
    alpha.nextElementSibling.textContent = `${alpha.value}%`;
  };
  size.onchange = alpha.onchange = save;
  for (const c of checks) {
    c.onchange = () => {
      layout().hidden[c.dataset.show] = !c.checked;
      save();
      apply();
      select(!c.checked && sel === c.dataset.show ? null : sel);
    };
  }

  // 편집 중에는 버튼이 게임에 입력을 보내지 않고 끌려 다닌다. 캡처 단계에서 먼저 받아 막는다.
  play.addEventListener("pointerdown", (e) => {
    if (!editing) return;
    const el = e.target.closest?.("[data-pad]");
    if (!el) return;
    e.stopPropagation();
    e.preventDefault();
    select(el.dataset.pad);
    const p = part(el.dataset.pad);
    drag = { id: el.dataset.pad, pointer: e.pointerId, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y };
    try { el.setPointerCapture(e.pointerId); } catch {}
  }, true);
  play.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    e.stopPropagation();
    set(drag.id, { x: drag.x + e.clientX - drag.sx, y: drag.y + e.clientY - drag.sy });
  }, true);
  for (const type of ["pointerup", "pointercancel"]) {
    play.addEventListener(type, (e) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      e.stopPropagation();
      drag = null;
      save();
      place();
    }, true);
  }
  play.addEventListener("click", (e) => {
    if (editing && e.target.closest?.("[data-pad]")) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  let frame = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      apply();
      if (editing) {
        place();
        select(sel);
      }
    });
  });

  return {
    apply,
    edit,
    get editing() { return editing; },
  };
}
