// 소리 크기. 엔진 설정 메뉴(F1)를 막았으므로 런처에서 정한다.
// - 배경음악·효과음: 엔진이 켜질 때 config.ini 의 [Audio] 로 넘긴다. 엔진에는 켜진 뒤 바꾸는 통로가 없다.
// - 전체: 엔진이 내는 소리가 스피커로 가기 직전에 GainNode 를 끼워 바로 바꾼다.
// 값은 이 기기(localStorage)에 저장한다. 읽기·쓰기가 안 되면 100 으로 쓴다.

const STORE = "lostsaga-sound";
const KEYS = ["master", "music", "sound"];

function load() {
  const v = { master: 100, music: 100, sound: 100 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    for (const k of KEYS) {
      const n = saved?.[k];
      if (typeof n === "number" && Number.isFinite(n)) v[k] = Math.min(100, Math.max(0, Math.round(n)));
    }
  } catch {}
  return v;
}

export function createSound({ onOpen, onClose }) {
  const vol = load();
  const gains = new Map();  // AudioContext → GainNode
  const level = () => (vol.master / 100) ** 2;  // 귀에 고르게 들리도록 제곱

  // 엔진(SDL2)이 AudioContext 를 만들고 스피커(destination)에 잇는 순간을 가로채 GainNode 를 거치게 한다.
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      let g = gains.get(dest.context);
      if (!g) {
        g = dest.context.createGain();
        g.gain.value = level();
        connect.call(g, dest);
        gains.set(dest.context, g);
      }
      if (this !== g) return connect.call(this, g, ...rest);
    }
    return connect.call(this, dest, ...rest);
  };

  const $ = (s) => document.querySelector(s);
  const dlg = $("#sound-dlg");

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(vol));
    } catch {}
  }
  function show(k) {
    const input = dlg.querySelector(`[data-vol="${k}"]`);
    input.value = vol[k];
    input.nextElementSibling.textContent = vol[k] === 0 ? "끔" : String(vol[k]);
  }
  for (const k of KEYS) {
    dlg.querySelector(`[data-vol="${k}"]`).addEventListener("input", (e) => {
      vol[k] = Number(e.target.value);
      show(k);
      save();
      if (k === "master") for (const g of gains.values()) g.gain.value = level();
    });
  }

  function open() {
    if (dlg.open) return;
    onOpen?.();
    for (const k of KEYS) show(k);
    dlg.showModal();
    dlg.querySelector('[data-vol="master"]').focus();
  }
  $("#sound-close").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => onClose?.());

  return {
    open,
    isOpen: () => dlg.open,
    // 엔진을 켤 때 config.ini 에 덧붙일 내용
    config() {
      return `[Audio]\nMusicVolume=${vol.music}\nSoundVolume=${vol.sound}\n`;
    },
  };
}
