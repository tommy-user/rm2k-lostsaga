// 화면 버튼 배치 바꾸기 (터치 기기). 버튼마다 끌어서 옮기고 크기·불투명도를 바꾼다.
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

  // 버튼이 들어가면 안 되는 곳: 게임 화면 (세로에서는 그 위 머리줄까지)
  function blocked() {
    const rs = [play.querySelector(".screen"), play.querySelector(".play-head")]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rs.length) return null;
    return {
      l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)),
      r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)),
    };
  }

  // 화면 밖으로 나가거나 게임 화면을 가리면 가장 가까운 빈 곳으로 밀어낸다.
  function fit(base, p) {
    const box = play.getBoundingClientRect(), no = blocked();
    const k = p.s / 100, w = base.width * k, h = base.height * k;
    const cx = base.left + base.width / 2, cy = base.top + base.height / 2;
    const lo = [box.left + MARGIN, box.top + MARGIN], hi = [box.right - MARGIN - w, box.bottom - MARGIN - h];
    const inside = (l, t) => l >= lo[0] - 0.5 && l <= hi[0] + 0.5 && t >= lo[1] - 0.5 && t <= hi[1] + 0.5;
    let l = Math.max(lo[0], Math.min(hi[0], cx + p.x - w / 2));
    let t = Math.max(lo[1], Math.min(hi[1], cy + p.y - h / 2));
    if (no && l < no.r && l + w > no.l && t < no.b && t + h > no.t) {
      const out = [[no.l - w, t], [no.r, t], [l, no.t - h], [l, no.b]]
        .filter(([a, b]) => inside(a, b))
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

  function place() {
    const no = blocked();
    if (!no) return;
    Object.assign(panel.style, { left: `${no.l}px`, top: `${no.t}px`, width: `${no.r - no.l}px`, height: `${no.b - no.t}px` });
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
    nameEl.textContent = id ? NAMES[id] : "옮길 버튼을 누르세요";
    size.disabled = alpha.disabled = !id;
    size.value = p?.s ?? 100;
    alpha.value = p?.o ?? 100;
    size.nextElementSibling.textContent = p ? `${p.s}%` : "";
    alpha.nextElementSibling.textContent = p ? `${p.o}%` : "";
    for (const c of checks) c.checked = shown(c.dataset.show);
    showTag();
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
      if (!c.checked && sel === c.dataset.show) select(null);
      save();
      apply();
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
