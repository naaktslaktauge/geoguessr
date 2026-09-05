/* ============================================================
 * 演出（誰かが回答したときの全画面アナウンスと効果音）
 *
 * 音は音声ファイルを持たず Web Audio API で合成する。
 * 読み込み待ちが無く、オフラインでも鳴り、リポジトリも軽いままにできる。
 * ============================================================ */
const Fx = (() => {
  const KEY_SOUND = "gg_sound";
  const SHOW_MS = 1000;           // 表示時間
  let queue = [], showing = false, ctx = null, hideTimer = null;

  /* ---------- 音のオン/オフ（端末ごとに保存） ---------- */
  function soundOn(){
    try { return localStorage.getItem(KEY_SOUND) !== "off"; } catch(e){ return true; }
  }
  function setSound(on){
    try { localStorage.setItem(KEY_SOUND, on ? "on" : "off"); } catch(e){}
  }

  /* ---------- 音声の初期化 ----------
     ブラウザは操作なしに音を鳴らせないため、最初のクリックで用意しておく */
  function initAudio(){
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch(e){ return null; }
    return ctx;
  }
  /**
   * 音を鳴らせる状態にする。
   * スマホは「操作の中で実際に音を出す」まで解放されないことがあるため、
   * 無音を1回鳴らして確実に開けておく。解放できるまで毎回の操作で試す。
   */
  function unlock(){
    const c = initAudio();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    try {
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch(e){}
    if (c.state === "running") removeUnlockListeners();
  }

  const UNLOCK_EVENTS = ["pointerdown", "touchend", "click", "keydown"];
  function addUnlockListeners(){
    UNLOCK_EVENTS.forEach(e => document.addEventListener(e, unlock, true));
  }
  function removeUnlockListeners(){
    UNLOCK_EVENTS.forEach(e => document.removeEventListener(e, unlock, true));
  }

  /**
   * パチスロ風の上昇音。矩形波のアルペジオに打撃音を重ねる。
   * target を渡すと、そこに書き出す（波形を検証するときに使う）。
   */
  function chime(target){
    if (!target && !soundOn()) return;
    const c = target || initAudio();
    if (!c) return;
    if (!target && c.state === "suspended") c.resume().catch(() => {});
    const t0 = c.currentTime;

    // 打撃音（短いノイズ）
    try {
      const len = Math.floor(c.sampleRate * 0.06);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1) * (1 - i/len);
      const src = c.createBufferSource(); src.buffer = buf;
      const g = c.createGain(); g.gain.value = 0.28;   // スマホのスピーカーは小さいので大きめに
      src.connect(g).connect(c.destination);
      src.start(t0);
    } catch(e){}

    // 上昇するアルペジオ（ド・ミ・ソ・ド）
    [1046.5, 1318.5, 1568.0, 2093.0].forEach((f, i) => {
      const at = t0 + i * 0.055;
      const o = c.createOscillator(), g = c.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(f, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.34, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + (i === 3 ? 0.42 : 0.16));
      o.connect(g).connect(c.destination);
      o.start(at); o.stop(at + (i === 3 ? 0.45 : 0.2));
    });
  }

  /* ---------- 全画面アナウンス ---------- */
  function announce(name){
    queue.push(String(name || ""));
    if (!showing) next();
  }

  function next(){
    if (hideTimer){ clearTimeout(hideTimer); hideTimer = null; }
    if (!queue.length){ showing = false; return; }
    showing = true;
    const name = queue.shift();
    const box = $("fx-announce");
    if (!box){ showing = false; return; }
    $("fx-name").textContent = name;
    box.hidden = false;
    box.classList.remove("play");
    void box.offsetWidth;          // アニメーションを頭から流し直す
    box.classList.add("play");
    chime();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      box.classList.remove("play");
      box.hidden = true;
      next();                      // 続けて溜まっていれば順に出す
    }, SHOW_MS);
  }

  /** 途中で打ち切る。古いタイマーが次の表示を消してしまわないよう必ず止める */
  function clear(){
    if (hideTimer){ clearTimeout(hideTimer); hideTimer = null; }
    queue = []; showing = false;
    const b = $("fx-announce");
    if (b){ b.classList.remove("play"); b.hidden = true; }
  }

  function init(){
    // 操作のたびに解放を試み、鳴らせるようになったら監視をやめる
    addUnlockListeners();
    const cb = $("opt-sound");
    if (cb){
      cb.checked = soundOn();
      cb.addEventListener("change", () => setSound(cb.checked));
    }
    // 1人でも演出と音を確かめられるようにしておく
    const test = $("btn-fx-test");
    if (test) test.addEventListener("click", () => { unlock(); announce("テスト"); });
  }

  return { init, announce, chime, clear, soundOn, setSound };
})();
