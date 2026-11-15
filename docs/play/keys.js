// 키 설정 (운영 지시 #100). 기본 키(방향키·Z·X 등)는 그대로 두고, 동작마다 키 하나를 더 정할 수 있다.
// 정한 키는 엔진에 가지 않고, 런처가 그 동작의 기본 키로 바꿔 보낸다 (방향은 방향키, 결정은 Enter …).
// 2배속은 엔진 키가 아니라 런처의 2배속 버튼을 켜고 끈다.
// 값은 이 기기(localStorage)에 저장한다. 읽기·쓰기가 안 되면 기본값(2배속 F)으로 쓴다.

const STORE = "lostsaga-keys";

export const ACTIONS = [
  { id: "up", label: "위", send: "ArrowUp", base: "↑" },
  { id: "down", label: "아래", send: "ArrowDown", base: "↓" },
  { id: "left", label: "왼쪽", send: "ArrowLeft", base: "←" },
  { id: "right", label: "오른쪽", send: "ArrowRight", base: "→" },
  { id: "ok", label: "결정", send: "Enter", base: "Z · Enter · Space" },
  { id: "cancel", label: "취소 · 메뉴", send: "Escape", base: "X · Esc" },
  { id: "shift", label: "능력치 분배", send: "ShiftLeft", base: "Shift" },
  { id: "speed", label: "2배속", send: null, base: "" },
];
const DEFAULT = { speed: "KeyF" };

// 정할 수 없는 키: 기본 키(겹치면 원래 동작이 사라진다), 타이틀로(F12), 조합 키.
const RESERVED = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "NumpadEnter", "Space", "Escape", "KeyZ", "KeyX",
  "ShiftLeft", "ShiftRight", "F12", "Tab", "MetaLeft", "MetaRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight",
  "CapsLock", "Backspace", "Delete",
]);

const NAMES = {
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  Minus: "-", Equal: "=", Backquote: "`", IntlBackslash: "§", Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
  Insert: "Ins", ContextMenu: "Menu", NumpadAdd: "숫자패드 +", NumpadSubtract: "숫자패드 -", NumpadMultiply: "숫자패드 *",
  NumpadDivide: "숫자패드 /", NumpadDecimal: "숫자패드 .",
};
export function keyName(code) {
  if (!code) return "";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return "숫자패드 " + code.slice(6);
  return NAMES[code] ?? code;
}

function load() {
  const v = { ...DEFAULT };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved && typeof saved === "object") {
      for (const a of ACTIONS) {
        const c = saved[a.id];
        if (c === null) delete v[a.id];
        else if (typeof c === "string" && !RESERVED.has(c)) v[a.id] = c;
      }
    }
  } catch {}
  return v;
}

export function createKeys({ onOpen, onClose, onChange }) {
  let bind = load();
  const $ = (s) => document.querySelector(s);
  const dlg = $("#keys-dlg");
  const list = dlg.querySelector(".key-list");
  const help = dlg.querySelector(".key-help");
  let waiting = null;  // 키를 기다리는 동작 id

  function save() {
    try {
      const out = {};
      for (const a of ACTIONS) out[a.id] = bind[a.id] ?? null;
      localStorage.setItem(STORE, JSON.stringify(out));
    } catch {}
  }
  const HELP = "바꿀 칸을 누르고 키를 누르세요.";
  function render() {
    list.replaceChildren();
    for (const a of ACTIONS) {
      const dt = document.createElement("span");
      dt.className = "key-label";
      dt.textContent = a.label;
      const base = document.createElement("span");
      base.className = "key-base";
      base.textContent = a.base;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "key-set";
      b.dataset.id = a.id;
      b.setAttribute("aria-label", `${a.label} 키`);
      b.textContent = waiting === a.id ? "키 입력…" : (keyName(bind[a.id]) || "없음");
      b.classList.toggle("wait", waiting === a.id);
      b.classList.toggle("none", !bind[a.id] && waiting !== a.id);
      b.onclick = () => {
        waiting = waiting === a.id ? null : a.id;
        help.textContent = waiting ? "Esc 취소 · Backspace 지우기" : HELP;
        render();
        list.querySelector(`[data-id="${a.id}"]`).focus();
      };
      list.append(dt, base, b);
    }
    onChange?.();
  }

  // 키를 기다리는 동안에는 이 창이 키를 받는다 (app.js 의 키 처리는 capturing() 이면 비켜 준다).
  window.addEventListener("keydown", (e) => {
    if (!waiting || !dlg.open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const id = waiting;
    if (e.code === "Escape") {
      waiting = null;
    } else if (e.code === "Backspace" || e.code === "Delete") {
      delete bind[id];
      waiting = null;
    } else if (RESERVED.has(e.code) || !e.code) {
      help.textContent = `${keyName(e.code) || "그 키"}는 쓸 수 없습니다.`;
      return;
    } else {
      for (const a of ACTIONS) if (bind[a.id] === e.code) delete bind[a.id];  // 다른 동작에 있던 키는 옮긴다
      bind[id] = e.code;
      waiting = null;
    }
    help.textContent = HELP;
    save();
    render();
    list.querySelector(`[data-id="${id}"]`)?.focus();
  }, true);

  function open() {
    if (dlg.open) return;
    onOpen?.();
    waiting = null;
    help.textContent = HELP;
    render();
    dlg.showModal();
    list.querySelector(".key-set").focus();
  }
  $("#keys-reset").onclick = () => {
    bind = { ...DEFAULT };
    waiting = null;
    help.textContent = HELP;
    save();
    render();
  };
  $("#keys-close").onclick = () => dlg.close();
  dlg.addEventListener("cancel", (e) => { if (waiting) e.preventDefault(); });  // Esc 는 키 입력 취소에만
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { waiting = null; onClose?.(); });

  return {
    open,
    isOpen: () => dlg.open,
    capturing: () => !!waiting && dlg.open,
    // 실제 키 code → 동작 (정하지 않은 키면 undefined)
    actionOf(code) {
      for (const a of ACTIONS) if (bind[a.id] === code) return a;
    },
    keyOf: (id) => bind[id],
  };
}
