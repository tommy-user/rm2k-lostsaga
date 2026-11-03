// 앱 설치 안내 배너. 설치했거나 닫았으면 다시 띄우지 않는다 (이 브라우저 기준).
// - Chrome/Edge: 브라우저가 주는 설치창을 [설치] 로 띄운다.
// - iOS: 설치창이 없어 안내 페이지(install.html)로 보낸다. 홈 화면 앱은 Safari 와 저장 공간이 따로라,
//   게스트면 먼저 Google 연결을 권한다.
const KEY = "lostsaga-install";  // localStorage: "done" 설치함 | "closed" 닫음 | "hint-closed" 앱에서 연 안내를 닫음

const read = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* 저장 못 해도 이번에만 */ } };

const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// 모듈을 읽을 때 바로 걸어 둔다 (앱이 시작을 기다리는 동안 이벤트가 먼저 올 수 있다).
let prompt = null;
let render = () => {};
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); prompt = e; render(); });
addEventListener("appinstalled", () => { write("done"); prompt = null; render(); });
if (standalone && read() !== "done") write("done");

export function initInstall({ anonymous, saveCount }) {
  const box = document.querySelector("#install");
  if (!box) return;
  const text = box.querySelector(".text");
  const act = box.querySelector(".act");
  const how = box.querySelector(".how");
  const link = box.querySelector(".link");
  const close = box.querySelector(".close");

  const finish = (v) => { write(v); render(); };
  close.onclick = () => finish(standalone ? "hint-closed" : "closed");
  act.onclick = async () => {
    if (!prompt) return;
    const p = prompt;
    prompt = null;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome !== "accepted") render();  // 설치하면 appinstalled 가 정리한다
  };

  render = () => {
    const state = read();
    let show = false;
    act.hidden = how.hidden = link.hidden = true;
    if (standalone) {
      // 앱으로 처음 열었는데 게스트 세이브가 없으면 Safari 에서 하던 진행을 찾도록 알린다.
      if (ios && anonymous && !saveCount && state !== "hint-closed") {
        show = true;
        text.textContent = "Safari에서 하던 진행이 있으면 Google 계정으로 로그인하세요.";
        link.hidden = false;
        link.textContent = "Google로 로그인";
      }
    } else if (state !== "done" && state !== "closed") {
      if (prompt) {
        show = true;
        text.textContent = "앱으로 설치하면 바로 열 수 있습니다.";
        act.hidden = false;
      } else if (ios) {
        show = true;
        how.hidden = false;
        if (anonymous) {
          text.textContent = "홈 화면 앱은 Safari와 저장 공간이 따로입니다. 설치 전에 Google 계정을 연결하세요.";
          link.hidden = false;
          link.textContent = "Google 연결";
        } else {
          text.textContent = "홈 화면에 추가하면 아이콘으로 바로 열 수 있습니다.";
        }
      }
    }
    box.hidden = !show;
  };
  render();
}
