/* ============================================================
 * ソロプレイの進行
 * ============================================================ */
const KEY_API  = "gg_api_key";
const KEY_BEST = "gg_best_scores";

const S = {
  settings:{ rounds:5, region:"world", difficulty:"all", timeLimit:300 },
  rules:{ move:true, pan:true, zoom:true },
  locs:[], idx:0, total:0, results:[], guess:null,
  timerId:null, remain:0, locked:false, mapReady:false
};

/* ---------- 設定 UI ---------- */
function initSettingsUI(){
  document.querySelectorAll("#screen-home .seg").forEach(seg => {
    seg.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      seg.querySelectorAll("button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      const k = seg.dataset.setting;
      S.settings[k] = (k === "rounds" || k === "timeLimit") ? Number(b.dataset.value) : b.dataset.value;
      if (k === "rounds") renderBest();
    });
  });
  ["move","pan","zoom"].forEach(k => {
    $("opt-" + k).addEventListener("change", e => { S.rules[k] = e.target.checked; });
  });
}

/* ---------- API キー（ソロ・対戦の共通設定） ---------- */
function refreshKeyUI(){
  const k = localStorage.getItem(KEY_API) || "";
  $("api-key").value = k;
  Pano.setApiKey(k);
  const st = $("key-status");
  if (k){
    st.textContent = "設定済み：Google Maps API モード（全ルール利用可）";
    st.classList.add("ok");
  } else {
    st.textContent = "未設定：埋め込みモードで動作します（ルール設定は無効）";
    st.classList.remove("ok");
  }
  ["move","pan","zoom"].forEach(id => { $("opt-" + id).disabled = !k; });
  $("field-rules").style.opacity = k ? "1" : ".45";
}
function initApiKeyUI(){
  $("btn-key-save").addEventListener("click", () => {
    const v = $("api-key").value.trim();
    if (v) localStorage.setItem(KEY_API, v); else localStorage.removeItem(KEY_API);
    refreshKeyUI();
  });
  $("btn-key-clear").addEventListener("click", () => {
    localStorage.removeItem(KEY_API);
    refreshKeyUI();
  });
  refreshKeyUI();
}

/* ---------- ハイスコア ---------- */
function loadBest(){
  try { return JSON.parse(localStorage.getItem(KEY_BEST) || "{}"); }
  catch { return {}; }
}
function renderBest(){
  const best = loadBest();
  const key = S.settings.rounds + "r";
  $("best-score").innerHTML = best[key]
    ? `${S.settings.rounds} ラウンドのハイスコア：<b>${best[key].toLocaleString()}</b> 点`
    : "";
}

/* ---------- ゲーム開始 ---------- */
async function startGame(){
  S.locs    = pickLocations(S.settings.region, S.settings.difficulty, S.settings.rounds);
  S.used    = S.locs.map(l => l.name);      // 出題済み（スキップ分も加えていく）
  S.idx     = 0;
  S.total   = 0;
  S.results = [];
  showScreen("screen-game");
  if (!S.mapReady){
    GuessMap.init("guess-map", p => {
      S.guess = p;
      const b = $("btn-guess");
      b.disabled = false;
      b.textContent = "推測する";
    });
    S.mapReady = true;
  }
  await loadRound();
}

async function loadRound(){
  S.guess  = null;
  S.locked = false;
  const b = $("btn-guess");
  b.disabled = true;
  b.textContent = "地図にピンを置いてください";

  GuessMap.reset();
  GuessMap.refresh();

  $("hud-round").textContent = (S.idx + 1) + " / " + S.settings.rounds;
  $("hud-score").textContent = S.total.toLocaleString();
  $("pano-loading").hidden = false;

  await Pano.load(S.locs[S.idx], S.rules);
  $("pano-loading").hidden = true;
  $("btn-reset-view").hidden = !Pano.canReset();

  startTimer();
}

/** 屋内など遊べない場所だったとき、同じラウンドのまま別の場所に差し替える */
async function skipRound(){
  if (S.locked) return;
  const pool = pickLocations(S.settings.region, S.settings.difficulty, 60);
  const loc  = pool.find(l => S.used.indexOf(l.name) < 0) || pool[0];
  S.used.push(loc.name);
  S.locs[S.idx] = loc;
  await loadRound();                        // ラウンド番号はそのまま、時間も引き直す
}

/* ---------- タイマー ---------- */
function startTimer(){
  stopTimer();
  const box = $("hud-timer-box");
  if (!S.settings.timeLimit){ box.hidden = true; return; }
  box.hidden = false;
  S.remain = S.settings.timeLimit;
  const tick = () => {
    $("hud-timer").textContent = fmtTime(S.remain);
    $("hud-timer").classList.toggle("warn", S.remain <= 10);
    if (S.remain <= 0){ stopTimer(); submitGuess(true); return; }
    S.remain--;
  };
  tick();
  S.timerId = setInterval(tick, 1000);
}
function stopTimer(){ if (S.timerId){ clearInterval(S.timerId); S.timerId = null; } }

/* ---------- 推測を確定 ---------- */
function submitGuess(timeUp){
  if (S.locked) return;
  if (!S.guess && !timeUp) return;
  S.locked = true;
  stopTimer();

  const loc   = S.locs[S.idx];
  const km    = S.guess ? haversineKm(S.guess, loc) : null;
  const score = S.guess ? calcScore(km, S.settings.region) : 0;
  S.total += score;
  S.results.push({ loc, guess:S.guess, km, score });

  showRoundResult(loc, S.guess, km, score, timeUp && !S.guess);
}

function showRoundResult(loc, guess, km, score, timeUp){
  showScreen("screen-round");
  ResultMap.show("result-map", loc, guess);

  $("res-place").textContent = loc.name + "（" + loc.country + "）";
  $("res-dist").textContent  = timeUp ? "時間切れ — 回答なし" : "正解との距離：" + fmtDist(km);
  $("res-score").textContent = score.toLocaleString();
  $("res-bar").style.width = "0%";
  setTimeout(() => { $("res-bar").style.width = (score / 5000 * 100) + "%"; }, 60);

  $("res-link").href = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" +
                       loc.lat + "," + loc.lng;
  $("btn-next").textContent = (S.idx + 1 >= S.settings.rounds) ? "結果を見る" : "次のラウンドへ";
}

async function nextRound(){
  S.idx++;
  if (S.idx >= S.settings.rounds){ showFinal(); return; }
  showScreen("screen-game");
  await loadRound();
}

function showFinal(){
  Pano.clear();
  showScreen("screen-final");
  const max = S.settings.rounds * 5000;
  const pct = S.total / max;

  $("fin-total").textContent = S.total.toLocaleString();
  $("fin-max").textContent   = "/ " + max.toLocaleString();
  $("fin-rank").textContent =
    pct >= .95 ? "パーフェクト級！ 地理の達人です 🌍" :
    pct >= .80 ? "素晴らしい！ かなりの実力者です" :
    pct >= .60 ? "good! なかなかの地理センスです" :
    pct >= .35 ? "まずまず。次はもっと狙えます" :
    pct >= .15 ? "惜しい！ 標識や植生をヒントにしてみましょう" :
                 "世界は広い…もう一度挑戦！";

  const list = $("fin-list");
  list.innerHTML = "";
  S.results.forEach((r, i) => {
    const li = document.createElement("li");
    li.innerHTML =
      `<span class="fl-place">${i+1}. ${escapeHtml(r.loc.name)}<br><span class="fl-dist">${escapeHtml(r.loc.country)}` +
      (r.km == null ? " / 回答なし" : " / " + fmtDist(r.km)) + `</span></span>` +
      `<span class="fl-score">${r.score.toLocaleString()}</span>`;
    list.appendChild(li);
  });

  const best = loadBest(), key = S.settings.rounds + "r";
  if (!best[key] || S.total > best[key]){
    best[key] = S.total;
    localStorage.setItem(KEY_BEST, JSON.stringify(best));
    $("fin-new").hidden = false;
  } else {
    $("fin-new").hidden = true;
  }
  renderBest();
}

/* ---------- イベント ---------- */
function initEvents(){
  // メニュー
  $("btn-menu-solo").addEventListener("click", () => { showScreen("screen-home"); renderBest(); });
  $("btn-menu-multi").addEventListener("click", () => {
    $("conn-msg").textContent = "";
    showScreen("screen-connect");
  });
  $("btn-home-back").addEventListener("click", () => showScreen("screen-menu"));

  // ソロ
  $("btn-start").addEventListener("click", startGame);
  $("btn-guess").addEventListener("click", () => submitGuess(false));
  $("btn-next").addEventListener("click", nextRound);
  $("btn-again").addEventListener("click", startGame);
  $("btn-home").addEventListener("click", () => { showScreen("screen-home"); renderBest(); });
  $("btn-reset-view").addEventListener("click", () => Pano.resetView());
  $("btn-skip").addEventListener("click", skipRound);

  // どの画面からでも押せる退出ボタン（状況に応じた確認を出す）
  $("btn-exit").addEventListener("click", () => {
    const inMulti = !!Net.myId;
    let text;
    if (!inMulti){
      text = "ゲームを中断してメニューに戻ります。ここまでのスコアは記録されません。";
    } else if (Net.isHost){
      text = "あなたはホストです。抜けると参加者全員のゲームが終了します。";
    } else {
      text = "抜けても、同じ部屋コードでもう一度参加すれば、得点を保ったまま元の席に戻れます。";
    }
    showConfirm("ゲームを抜けますか？", text, "抜ける", () => {
      if (inMulti){
        Multi.leave();
      } else {
        stopTimer(); Pano.clear(); showScreen("screen-menu");
      }
    });
  });

  const panel = $("map-panel");
  $("btn-pin").addEventListener("click", e => {
    e.stopPropagation();
    panel.classList.toggle("pinned");
    GuessMap.refresh();
  });
  panel.addEventListener("mouseenter", GuessMap.refresh);
  panel.addEventListener("mouseleave", GuessMap.refresh);

  document.addEventListener("keydown", e => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (modalOpen()) return;                     // 確認ダイアログ表示中は無効
    if (e.key === "Enter"){
      if ($("screen-game").classList.contains("active")) submitGuess(false);
      else if ($("screen-round").classList.contains("active")) nextRound();
      else if ($("screen-home").classList.contains("active")) startGame();
    }
    if (e.key === "Escape" && panel.classList.contains("pinned")){
      panel.classList.remove("pinned");
      GuessMap.refresh();
    }
  });
}

/* ---------- 起動 ---------- */
document.addEventListener("DOMContentLoaded", () => {
  Pano.init($("pano"));
  initSettingsUI();
  initApiKeyUI();
  initModal();
  initEvents();
  Multi.init();
  initMapSizeControls(() => { GuessMap.refresh(); Multi.refreshMap(); });
  renderBest();
});
