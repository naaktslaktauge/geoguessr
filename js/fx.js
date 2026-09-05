/* ============================================================
 * 演出（誰かが回答したときの全画面アナウンスと効果音）
 *
 * 音は音声ファイルを持たず Web Audio API で合成する。
 * 読み込み待ちが無く、オフラインでも鳴り、リポジトリも軽いままにできる。
 * ============================================================ */
const Fx = (() => {
  const KEY_SOUND = "gg_sound";
  const SHOW_MS = 1000;           // 表示時間
  let queue = [], showing = false, ctx = null;

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
  function unlock(){
    const c = initAudio();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  }

  /** パチスロ風の上昇音。矩形波のアルペジオに打撃音を重ねる */
  function chime(){
    if (!soundOn()) return;
    const c = initAudio();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    const t0 = c.currentTime;

    // 打撃音（短いノイズ）
    try {
      const len = Math.floor(c.sampleRate * 0.06);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1) * (1 - i/len);
      const src = c.createBufferSource(); src.buffer = buf;
      const g = c.createGain(); g.gain.value = 0.12;
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
      g.gain.exponentialRampToValueAtTime(0.16, at + 0.012);
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
    setTimeout(() => {
      box.classList.remove("play");
      box.hidden = true;
      next();                      // 続けて溜まっていれば順に出す
    }, SHOW_MS);
  }

  function clear(){ queue = []; showing = false; const b = $("fx-announce"); if (b) b.hidden = true; }

  function init(){
    // 最初の操作で音を使えるようにしておく
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    const cb = $("opt-sound");
    if (cb){
      cb.checked = soundOn();
      cb.addEventListener("change", () => setSound(cb.checked));
    }
  }

  return { init, announce, chime, clear, soundOn, setSound };
})();
