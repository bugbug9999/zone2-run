// 데드엔드 스윕 테스트 — zone2-run index.html
// 불변식: 모든 화면 × 도달가능 상태에서 "뒤로/닫기 외의 액션 요소(버튼·링크·입력)"가 1개 이상 존재해야 한다.
// 위반 = 유저가 갇히는 데드엔드 (Sayble 빈 상태 데드엔드 사고 재발방지용 기계 검사).
// 실행: node test/deadend-sweep.mjs   (exit 0 = 전 상태 PASS, exit 1 = 위반)

import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "index.html"), "utf8");

// ---- jsdom 환경 + 브라우저 API 스텁 ------------------------------------
let gpsOk = null, gpsErr = null;               // watchPosition 콜백 캡처
let tickFn = null;                              // 러닝 1초 루프 캡처(수동 구동)
let clockOffset = 0;                            // Date.now 가상 시간
const realNow = Date.now.bind(Date);

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  beforeParse(w) {
    // 가상 시계(페이스 계산에 fix 간 dt 필요)
    w.Date.now = () => realNow() + clockOffset;
    // GPS 스텁: 콜백만 캡처, 테스트가 수동 발사
    Object.defineProperty(w.navigator, "geolocation", {
      value: {
        watchPosition(ok, err) { gpsOk = ok; gpsErr = err; return 99; },
        clearWatch() { gpsOk = null; gpsErr = null; },
      },
      configurable: true,
    });
    // setInterval 캡처(실제 대기 없이 loopRun 수동 호출)
    w.setInterval = (fn) => { tickFn = fn; return 777; };
    w.clearInterval = (id) => { if (id === 777) tickFn = null; };
  },
});
// runScripts:outside-only에서는 인라인 스크립트가 자동 실행되지 않으므로 직접 평가
const w = dom.window, d = w.document;
try { w.localStorage.clear(); } catch (e) {}
for (const s of d.querySelectorAll("script")) w.eval(s.textContent);

const $ = (id) => d.getElementById(id);
const advance = (ms) => { clockOffset += ms; };
const tick = (n = 1) => { for (let i = 0; i < n; i++) tickFn && tickFn(); };
function fix(lat, lng) { gpsOk && gpsOk({ coords: { latitude: lat, longitude: lng } }); }

// ---- 검사기 --------------------------------------------------------------
// 뒤로/닫기 류로 간주해 "액션"에서 제외하는 이름
const CLOSE_RE = /(닫기|뒤로|나가기|취소|back|close|dismiss|[×✕✖])/i;
const ACTION_SEL = "button, a[href], input, select, textarea, [onclick], [role=button]";

function hiddenWithin(el, root) {
  for (let n = el; n && n !== root.parentElement; n = n.parentElement)
    if (n.style && n.style.display === "none") return true;
  return false;
}
function accessibleName(el) {
  return (el.getAttribute("aria-label") || el.textContent || el.value || "").trim();
}
const results = [];
function check(screenLabel, stateLabel, root, extraExpect) {
  const actions = [...root.querySelectorAll(ACTION_SEL)]
    .filter((el) => !hiddenWithin(el, root))
    .filter((el) => !CLOSE_RE.test(accessibleName(el)));
  const text = root.textContent.replace(/\s+/g, " ").trim();
  const hasContent = text.length >= 10;
  const problems = [];
  if (actions.length === 0 && !hasContent) problems.push("액션 요소 0개 + 의미 있는 콘텐츠 없음 (데드엔드)");
  else if (actions.length === 0) problems.push("뒤로/닫기 외 액션 요소 0개 (콘텐츠만 있음 → 데드엔드)");
  if (extraExpect) { const err = extraExpect(root); if (err) problems.push(err); }
  results.push({
    screen: screenLabel, state: stateLabel,
    pass: problems.length === 0,
    actions: actions.length,
    sample: actions.slice(0, 3).map((a) => accessibleName(a).slice(0, 14) || a.tagName.toLowerCase()).join(" | "),
    problems,
  });
}
function activeScreen() { return d.querySelector(".screen.active"); }
function expectActive(id) {
  const a = activeScreen();
  if (!a || a.id !== id) throw new Error(`화면 전환 실패: 기대 ${id}, 실제 ${a && a.id}`);
  return a;
}

// ---- 상태 주행 -----------------------------------------------------------
// [1] 온보딩(초기 진입, 프로필 없음)
check("s-onboard", "초기 진입(프로필 없음)", expectActive("s-onboard"));

// [2] 대시보드 · 빈 데이터(러닝 0회 — 스파크라인 빈 분기 h.length<2)
w.calcProfile();
check("s-dash", "빈 데이터(러닝 0회)", expectActive("s-dash"), (r) =>
  /러닝을 쌓으면/.test($("dSpark").textContent) ? null : "빈 스파크 분기 미진입(상태 강제 실패)");

// [3] 러닝 · GPS 연결 중(fix 수신 전)
w.startRun();
check("s-run", "GPS 연결 중(페이스 없음)", expectActive("s-run"));

// [4] 러닝 · GPS 정상 추적(페이스 산출)
fix(37.5000, 127.0000); advance(5000); fix(37.5003, 127.0000); tick(5);
advance(5000); fix(37.5006, 127.0000); tick(5);
check("s-run", "GPS 정상 추적", expectActive("s-run"));

// [5] 말 체크 오버레이(러닝 중 프롬프트)
w.askTalk(true);
if (!$("overlay").classList.contains("on")) throw new Error("오버레이 미표시");
check("overlay", "말 체크 프롬프트", $("overlay"));
w.answerTalk("easy");

// [6] 러닝 · 일시정지
w.pauseRun();
check("s-run", "일시정지", expectActive("s-run"));
w.pauseRun(); // 재개

// [7] 요약 · 첫 실제 러닝(runs<=1 분기)
advance(5000); fix(37.5009, 127.0000); tick(5);
w.stopRun();
check("s-sum", "첫 러닝 완료(runs=1 분기)", expectActive("s-sum"));

// [8] 대시보드 · 기록 있음(스파크라인 렌더 분기)
w.show("dash"); w.renderDash();
check("s-dash", "기록 있음(runs≥1, 스파크 렌더)", expectActive("s-dash"), (r) =>
  $("dSpark").querySelector("svg") ? null : "스파크 SVG 미렌더(상태 강제 실패)");

// [9] 요약 · 반복 러닝(runs>1 분기, 유지율 히어로)
w.startRun(); fix(37.5, 127.0); advance(5000); fix(37.5004, 127.0); tick(5); w.stopRun();
check("s-sum", "반복 러닝(runs>1 분기)", expectActive("s-sum"));

// [10] 러닝 · 데모 모드(GPS 실패/실내)
w.show("dash"); w.startRun(); gpsErr && gpsErr({ code: 2 }); tick(3);
check("s-run", "데모(GPS 없음/실내)", expectActive("s-run"));

// [11] 데모 중 말 체크 답변(교정 미반영 토스트 경로)
w.askTalk(true); check("overlay", "말 체크(데모 중)", $("overlay")); w.answerTalk("hard");

// [12] 요약 · 미리보기(데모, 데이터 미저장 분기)
w.stopRun();
check("s-sum", "미리보기 요약(데모, 미저장)", expectActive("s-sum"));

// [13] 요약 · 즉시 종료(0m·0초 빈 데이터 — Sayble류 빈 상태 후보)
w.show("dash"); w.startRun(); w.stopRun();
check("s-sum", "즉시 종료(거리0·시간0 빈 데이터)", expectActive("s-sum"));

// [14] 회수 오버레이("마지막 한 가지" — 프롬프트 전부 놓치고 종료)
w.show("dash"); w.startRun();
fix(37.5, 127.0); advance(5000); fix(37.5004, 127.0); tick(3);
w.askTalk(false);                    // 프롬프트 발사(promptsFired>0)
w.pauseRun();                        // 프롬프트 열린 채 일시정지 → 놓침 기록
w.pauseRun();                        // 재개
w.stopRun();                         // checks=0 & 놓침 → showRecovery
if (!$("overlay").classList.contains("on")) throw new Error("회수 오버레이 미표시");
check("overlay", "회수 프롬프트(놓친 체크)", $("overlay"));
w.answerTalk("mid");                 // → finalizeSummary
check("s-sum", "회수 후 요약", expectActive("s-sum"));

// [15] 초저체력 프로필(존2<걷기 속도 — 걷기 힌트 상태)
w.show("onboard");
$("age").value = 80; $("par").value = 0; $("height").value = 140; $("weight").value = 120;
w.calcProfile();
check("s-dash", "초저체력(걷기 안내 분기)", expectActive("s-dash"));
w.startRun(); tick(1);
check("s-run", "초저체력 러닝(rHint 표시)", expectActive("s-run"), (r) =>
  $("rHint").style.display === "block" ? null : "걷기 힌트 분기 미진입(상태 강제 실패)");
w.stopRun();

// ---- 보고 ---------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
const pad = (s, n) => String(s).padEnd(n);
console.log("\n데드엔드 스윕 — 화면 × 상태 (" + results.length + "개 상태)\n");
console.log(pad("결과", 6) + pad("화면", 12) + pad("상태", 34) + pad("액션수", 7) + "액션 예시");
console.log("-".repeat(96));
for (const r of results)
  console.log(pad(r.pass ? "PASS" : "FAIL", 6) + pad(r.screen, 12) + pad(r.state, 34) + pad(r.actions, 7) + r.sample);
if (failed.length) {
  console.log("\nFAIL 상세:");
  for (const f of failed) console.log(`- [${f.screen} / ${f.state}] ${f.problems.join("; ")}`);
}
console.log(failed.length ? `\n위반 ${failed.length}건 — 데드엔드 존재` : "\n전 상태 통과 — 데드엔드 없음");
process.exit(failed.length ? 1 : 0);
