/* ============================================================
 * オンライン対戦（2〜4人 / WebRTC P2P）
 *   モード "all"  : 全員が回答者。同じ地点を全員で当てる
 *   モード "quiz" : 1人が出題者。出題者は得点なし・毎ラウンド交代
 *   ホストが進行の正となる（authoritative host）
 * ============================================================ */
const Multi = (() => {

  /* ---------- クライアント共通の状態 ---------- */
  const C = {
    name: "", st: null, guess: null,
    pick: null, pickResolved: null,
    tickId: null, maps: {}, joined: false
  };

  /* ---------- ホスト専用の内部状態 ---------- */
  let H = null;

  const isHost = () => Net.isHost;
  const me     = () => Net.myId;

  /* ============================================================
   * 接続
   * ============================================================ */
  function createRoom(){
    C.name = ($("mp-name").value || "").trim() || "プレイヤー1";
    setConnMsg("部屋を作成しています…");
    Net.host(onNetEvent).then(code => {
      H = {
        players: [{ id:me(), name:C.name, score:0, connected:true }],
        mode: "all",
        settings: { rounds:5, laps:1, timeLimit:120, region:"world", difficulty:"all" },
        phase: "lobby", round: 0, totalRounds: 0,
        quizmasterId: null, location: null, guesses: {}, deadline: null, timer: null
      };
      C.joined = true;
      hSync();
      showScreen("screen-lobby");
      $("lobby-code").textContent = code;
    }).catch(err => setConnMsg("部屋を作れませんでした：" + (err.message || err.type || err)));
  }

  function joinRoom(){
    C.name = ($("mp-name").value || "").trim() || "プレイヤー";
    const code = ($("mp-code").value || "").trim().toUpperCase();
    if (code.length < 4){ setConnMsg("部屋コードを入力してください"); return; }
    setConnMsg("接続しています…");
    Net.join(code, onNetEvent).then(() => {
      C.joined = true;
      Net.send({ t:"hello", name:C.name });
      showScreen("screen-lobby");
      $("lobby-code").textContent = Net.roomCode;
    }).catch(err => setConnMsg("⚠️ " + (err.message || "接続に失敗しました")));
  }

  function setConnMsg(m){ $("conn-msg").textContent = m || ""; }

  function onNetEvent(ev){
    if (ev.type === "peer-join"){
      // hello を待って players に追加する
    } else if (ev.type === "peer-leave"){
      if (!isHost() || !H) return;
      const p = H.players.find(x => x.id === ev.id);
      if (p) p.connected = false;
      hSync();                                   // 切断をまず全員に伝える
      if (H.phase === "picking" && H.quizmasterId === ev.id) hNextRound();
      else if (H.phase === "playing") hMaybeEndRound();
    } else if (ev.type === "host-lost"){
      alert("ホストとの接続が切れました。メニューに戻ります。");
      leave();
    } else if (ev.type === "data"){
      if (isHost()){ hOnMessage(ev.from, ev.msg); }
      else if (ev.msg && ev.msg.t === "busy"){
        alert("この部屋は現在ゲーム進行中のため参加できません。");
        leave();
      }
      else applyState(ev.msg);
    }
  }

  function leave(){
    stopTick();
    if (H && H.timer) clearTimeout(H.timer);
    H = null; C.st = null; C.joined = false;
    Net.close();
    Pano.clear($("m-pano"));
    Pano.clear($("pick-pano"));
    showScreen("screen-menu");
  }

  /* ============================================================
   * ホスト側ロジック
   * ============================================================ */
  function hOnMessage(from, msg){
    if (!msg || !H) return;

    if (msg.t === "hello"){
      if (H.phase !== "lobby"){ Net.sendTo(from, { t:"busy" }); return; }
      if (H.players.length >= 4){ Net.sendTo(from, { t:"busy" }); return; }
      if (!H.players.find(p => p.id === from)){
        const name = String(msg.name || "プレイヤー").slice(0, 12);
        H.players.push({ id:from, name, score:0, connected:true });
      }
      hSync();
    }
    else if (msg.t === "guess" && H.phase === "playing"){
      if (from === H.quizmasterId) return;                   // 出題者は回答しない
      if (H.guesses[from]) return;                           // 二重回答を防ぐ
      const g = parseLatLng(msg.lat, msg.lng);
      if (!g) return;                                        // 壊れた座標は捨てる
      H.guesses[from] = g;
      hSync();
      hMaybeEndRound();
    }
    else if (msg.t === "picked" && H.phase === "picking" && from === H.quizmasterId){
      const loc = parseLatLng(msg.lat, msg.lng);
      if (!loc) return;
      hStartPlaying(loc);
    }
  }

  function hStartGame(){
    const alive = H.players.filter(p => p.connected);
    if (alive.length < 2){ alert("対戦には2人以上必要です"); return; }
    H.players.forEach(p => p.score = 0);
    H.round = 0;
    H.totalRounds = totalRounds(H.mode, alive, H.settings);
    H.queue = H.mode === "all"
      ? pickLocations(H.settings.region, H.settings.difficulty, H.totalRounds)
      : null;
    hNextRound();
  }

  function hNextRound(){
    if (H.timer){ clearTimeout(H.timer); H.timer = null; }
    H.round++;
    H.guesses = {};
    H.location = null;
    H.deadline = null;
    H.results = null;

    if (H.round > H.totalRounds){ H.phase = "final"; hSync(); return; }

    if (H.mode === "quiz"){
      const alive = H.players.filter(p => p.connected);
      if (alive.length < 2){ H.phase = "final"; hSync(); return; }
      H.quizmasterId = quizmasterFor(H.round, alive);
      H.phase = "picking";
      hSync();
    } else {
      H.quizmasterId = null;
      hStartPlaying(H.queue[H.round - 1]);
    }
  }

  function hStartPlaying(loc){
    H.location = loc;
    H.phase = "playing";
    H.deadline = H.settings.timeLimit ? Date.now() + H.settings.timeLimit * 1000 : null;
    hSync();
    if (H.deadline){
      H.timer = setTimeout(() => hEndRound(), H.settings.timeLimit * 1000 + 500);
    }
  }

  /** 回答者全員が回答済みならラウンドを締める */
  function hMaybeEndRound(){
    if (H.phase !== "playing") return;
    const answerers = H.players.filter(p => p.connected && p.id !== H.quizmasterId);
    if (!answerers.length){ hEndRound(); return; }          // 回答者が全員抜けた
    if (answerers.every(p => H.guesses[p.id])) hEndRound();
  }

  function hEndRound(){
    if (H.phase !== "playing") return;
    if (H.timer){ clearTimeout(H.timer); H.timer = null; }
    const region = H.mode === "quiz" ? "world" : H.settings.region;
    const alive  = H.players.filter(p => p.connected);
    H.results = scoreRound(H.location, H.guesses, alive, region, H.quizmasterId);
    H.results.forEach(r => {
      const p = H.players.find(x => x.id === r.id);
      if (p) p.score += r.score;
    });
    H.phase = "result";
    H.deadline = null;
    hSync();
  }

  /** ホストの内部状態から、全員に配る公開状態を作る */
  function publicState(){
    const showAnswer = (H.phase === "result" || H.phase === "final");
    return {
      phase: H.phase, mode: H.mode, hostId: me(),
      settings: H.settings,
      players: H.players.map(p => ({ id:p.id, name:p.name, score:p.score, connected:p.connected })),
      round: H.round, totalRounds: H.totalRounds,
      quizmasterId: H.quizmasterId,
      // 回答中は座標のみ（地名を送ると答えが割れるため）
      location: H.location
        ? (showAnswer ? H.location : { lat:H.location.lat, lng:H.location.lng })
        : null,
      answered: Object.keys(H.guesses),
      results: showAnswer ? H.results : null,
      deadline: H.deadline
    };
  }

  function hSync(){
    const st = publicState();
    Net.broadcast(st);
    applyState(st);
  }

  /* ============================================================
   * クライアント側の描画
   * ============================================================ */
  function applyState(st){
    if (!st || !st.phase) return;
    const prev = C.st;
    C.st = st;

    const changedRound = !prev || prev.round !== st.round || prev.phase !== st.phase;

    if (st.phase === "lobby"){ renderLobby(); return; }
    if (st.phase === "final"){ renderFinal(); return; }
    if (st.phase === "result"){ renderResult(); return; }

    // picking / playing
    showScreen("screen-mgame");
    renderPlayers();
    renderHud();
    startTick();

    if (st.phase === "picking"){
      $("pick-overlay").hidden = false;
      $("map-panel-m").hidden = true;
      const amQm = st.quizmasterId === me();
      $("pick-picker").hidden = !amQm;
      $("pick-wait").hidden = amQm;
      if (!amQm){
        const qm = st.players.find(p => p.id === st.quizmasterId);
        $("pick-wait-name").textContent = qm ? qm.name : "出題者";
      } else if (changedRound){
        C.pick = null;
        C.pickResolved = null;                 // 前ラウンドの選択を持ち越さない
        $("pick-card").hidden = true;
        ensureMaps();
        C.maps.pick.reset();
        C.maps.pick.refresh(60);
      }
      Pano.clear($("m-pano"));
      return;
    }

    // ---- playing ----
    $("pick-overlay").hidden = true;
    const amQm = st.mode === "quiz" && st.quizmasterId === me();
    $("qm-banner").hidden = !amQm;
    $("map-panel-m").hidden = amQm;

    if (changedRound){
      C.guess = null;
      C.pending = null;                        // 前ラウンドのピンを持ち越さない
      const b = $("btn-mguess");
      b.disabled = true;
      b.textContent = "地図にピンを置いてください";
      ensureMaps();
      C.maps.guess.reset();
      C.maps.guess.refresh(60);
      $("m-pano-loading").hidden = false;
      Pano.load(st.location, { move:true, pan:true, zoom:true }, { el:$("m-pano") })
          .then(() => { $("m-pano-loading").hidden = true; });
    }
    if (C.guess) $("btn-mguess").disabled = true;
  }

  function ensureMaps(){
    if (!C.maps.guess){
      C.maps.guess = createPickerMap("m-guess-map", p => {
        if (!C.st || C.st.phase !== "playing") return;
        if (C.guess) return;
        C.pending = p;
        const b = $("btn-mguess");
        b.disabled = false;
        b.textContent = "推測する";
      }, COLOR_GUESS);
      C.maps.guess.init();
    }
    if (!C.maps.pick){
      C.maps.pick = createPickerMap("pick-map", p => onPickPoint(p), "#f59e0b");
      C.maps.pick.init();
    }
    if (!C.maps.result) C.maps.result = createResultMap("m-result-map");
  }

  /* ---------- 出題者：地点を選ぶ ---------- */
  function onPickPoint(p){
    C.pick = p;
    $("pick-card").hidden = false;
    $("pick-coord").textContent = p.lat.toFixed(4) + ", " + p.lng.toFixed(4);
    $("pick-status").textContent = "ストリートビューを確認しています…";
    $("btn-pick-ok").disabled = true;
    Pano.clear($("pick-pano"));

    Pano.load(p, { move:true, pan:true, zoom:true },
              { el:$("pick-pano"), preview:true, radii:[80, 500, 3000] })
      .then(res => {
        if (C.pick !== p) return;                       // 選び直された
        if (res.api && res.notFound){
          $("pick-status").textContent = "⚠️ この付近にストリートビューがありません。別の場所を選んでください。";
          $("btn-pick-ok").disabled = true;
          Pano.clear($("pick-pano"));
          return;
        }
        if (res.location) C.pickResolved = res.location;
        $("pick-status").textContent = res.api
          ? "✅ この地点で出題できます"
          : "上のプレビューに景色が出ていれば出題できます（出ていなければ別の場所へ）";
        $("btn-pick-ok").disabled = false;
      });
  }

  function confirmPick(){
    const loc = C.pickResolved || C.pick;
    if (!loc) return;
    $("btn-pick-ok").disabled = true;
    Pano.clear($("pick-pano"));
    if (isHost()) hStartPlaying({ lat:loc.lat, lng:loc.lng });
    else Net.send({ t:"picked", lat:loc.lat, lng:loc.lng });
  }

  /* ---------- 回答を送る ---------- */
  function submitGuess(){
    if (!C.pending || C.guess || !C.st || C.st.phase !== "playing") return;
    C.guess = C.pending;
    $("btn-mguess").disabled = true;
    $("btn-mguess").textContent = "回答しました（他の人を待っています）";
    if (isHost()){
      H.guesses[me()] = C.guess;
      hSync();
      hMaybeEndRound();
    } else {
      Net.send({ t:"guess", lat:C.guess.lat, lng:C.guess.lng });
    }
  }

  /* ---------- 各画面の描画 ---------- */
  function renderLobby(){
    const st = C.st;
    stopTick();
    showScreen("screen-lobby");
    $("lobby-code").textContent = Net.roomCode;

    const list = $("lobby-players");
    list.innerHTML = "";
    st.players.forEach((p, i) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="dot" style="background:${PLAYER_COLORS[i]}"></span>` +
        `<span class="lp-name">${escapeHtml(p.name)}</span>` +
        `<span class="lp-tag">${p.id === st.hostId ? "ホスト" : ""}${p.id === me() ? " (あなた)" : ""}</span>`;
      list.appendChild(li);
    });

    $("lobby-host-ui").hidden = !isHost();
    $("lobby-guest-ui").hidden = isHost();
    $("lobby-count").textContent = st.players.length + " / 4 人";
    $("btn-lobby-start").disabled = st.players.length < 2;

    if (!isHost()){
      const modeName = st.mode === "quiz" ? "出題者あり" : "全員が回答者";
      const tl = st.settings.timeLimit;
      $("lobby-guest-info").textContent =
        `モード：${modeName} ／ 制限時間：${tl ? tl / 60 + "分" : "無制限"}`;
    }
    syncQuizRoundLabel();
  }

  function renderPlayers(){
    const st = C.st;
    const box = $("m-players");
    box.innerHTML = "";
    st.players.forEach((p, i) => {
      const answered = (st.answered || []).indexOf(p.id) >= 0;
      const isQm = st.quizmasterId === p.id;
      const div = document.createElement("div");
      div.className = "mp-row" + (p.connected ? "" : " off");
      div.innerHTML =
        `<span class="dot" style="background:${PLAYER_COLORS[i]}"></span>` +
        `<span class="mp-name">${escapeHtml(p.name)}${p.id === me() ? " (あなた)" : ""}</span>` +
        `<span class="mp-mark">${isQm ? "出題" : (answered ? "✓" : "")}</span>` +
        `<span class="mp-score">${p.score.toLocaleString()}</span>`;
      box.appendChild(div);
    });
  }

  function renderHud(){
    const st = C.st;
    $("m-round").textContent = st.round + " / " + st.totalRounds;
    $("m-mode").textContent  = st.mode === "quiz" ? "出題者あり" : "全員回答";
  }

  function renderResult(){
    const st = C.st;
    stopTick();
    showScreen("screen-mround");
    ensureMaps();

    const entries = (st.results || [])
      .filter(r => r.guess)
      .map(r => {
        const i = st.players.findIndex(p => p.id === r.id);
        return { name:r.name, lat:r.guess.lat, lng:r.guess.lng, color:PLAYER_COLORS[i] || COLOR_GUESS };
      });
    C.maps.result.show(st.location, entries, 260);

    $("mres-place").textContent = st.location.name
      ? st.location.name + "（" + st.location.country + "）"
      : "出題地点：" + st.location.lat.toFixed(4) + ", " + st.location.lng.toFixed(4);
    $("mres-link").href = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" +
                          st.location.lat + "," + st.location.lng;

    const tb = $("mres-rows");
    tb.innerHTML = "";
    const rows = (st.results || []).slice().sort((a, b) => {
      if (a.quizmaster !== b.quizmaster) return a.quizmaster ? 1 : -1;
      return b.score - a.score;
    });
    rows.forEach(r => {
      const i = st.players.findIndex(p => p.id === r.id);
      const tr = document.createElement("div");
      tr.className = "mres-row";
      tr.innerHTML =
        `<span class="dot" style="background:${PLAYER_COLORS[i]}"></span>` +
        `<span class="mr-name">${escapeHtml(r.name)}</span>` +
        `<span class="mr-dist">${r.quizmaster ? "出題者" : (r.guess ? fmtDist(r.km) : "回答なし")}</span>` +
        `<span class="mr-score">${r.quizmaster ? "—" : "+" + r.score.toLocaleString()}</span>`;
      tb.appendChild(tr);
    });

    const last = st.round >= st.totalRounds;
    $("btn-mnext").hidden = !isHost();
    $("btn-mnext").textContent = last ? "最終結果へ" : "次のラウンドへ";
    $("mres-wait").hidden = isHost();
  }

  function renderFinal(){
    stopTick();
    showScreen("screen-mfinal");
    const st = C.st;
    const ranked = rankPlayers(st.players);
    const list = $("mfin-list");
    list.innerHTML = "";
    ranked.forEach(p => {
      const i = st.players.findIndex(x => x.id === p.id);
      const li = document.createElement("li");
      li.className = p.rank === 1 ? "top" : "";
      li.innerHTML =
        `<span class="mf-rank">${p.rank === 1 ? "👑" : p.rank}</span>` +
        `<span class="dot" style="background:${PLAYER_COLORS[i]}"></span>` +
        `<span class="mf-name">${escapeHtml(p.name)}${p.id === me() ? " (あなた)" : ""}</span>` +
        `<span class="mf-score">${p.score.toLocaleString()}</span>`;
      list.appendChild(li);
    });
    const win = ranked.filter(p => p.rank === 1).map(p => p.name).join("・");
    $("mfin-winner").textContent = win + " の勝利！";
    $("btn-magain").hidden = !isHost();
  }

  /* ---------- 制限時間のカウントダウン ---------- */
  function startTick(){
    stopTick();
    C.tickId = setInterval(() => {
      const st = C.st;
      const box = $("m-timer-box");
      if (!st || !st.deadline){ box.hidden = true; return; }
      box.hidden = false;
      const left = Math.ceil((st.deadline - Date.now()) / 1000);
      $("m-timer").textContent = fmtTime(left);
      $("m-timer").classList.toggle("warn", left <= 10);
    }, 250);
  }
  function stopTick(){ if (C.tickId){ clearInterval(C.tickId); C.tickId = null; } }

  /* ---------- ロビーの設定 UI（ホストのみ） ---------- */
  function syncQuizRoundLabel(){
    const st = C.st;
    if (!st) return;
    const quiz = st.mode === "quiz";
    $("row-rounds").hidden = quiz;
    $("row-laps").hidden   = !quiz;
    $("row-area").hidden   = quiz;
    const n = st.players.filter(p => p.connected).length;
    $("laps-note").textContent = quiz ? `全 ${n * st.settings.laps} ラウンド（${n}人 × ${st.settings.laps}周）` : "";
  }

  function initLobbyControls(){
    document.querySelectorAll("#screen-lobby .seg").forEach(seg => {
      seg.addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b || !isHost() || !H) return;
        seg.querySelectorAll("button").forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        const k = seg.dataset.setting, v = b.dataset.value;
        if (k === "mode") H.mode = v;
        else if (k === "rounds" || k === "laps" || k === "timeLimit") H.settings[k] = Number(v);
        else H.settings[k] = v;
        hSync();
      });
    });
  }

  /* ============================================================
   * 初期化
   * ============================================================ */
  function init(){
    $("btn-create-room").addEventListener("click", createRoom);
    $("btn-join-room").addEventListener("click", joinRoom);
    $("mp-code").addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });
    $("btn-conn-back").addEventListener("click", () => { Net.close(); showScreen("screen-menu"); });

    $("btn-copy-code").addEventListener("click", () => {
      const code = Net.roomCode;
      navigator.clipboard?.writeText(code).then(
        () => { $("btn-copy-code").textContent = "コピーしました"; 
                setTimeout(() => $("btn-copy-code").textContent = "コードをコピー", 1500); },
        () => {}
      );
    });
    $("btn-lobby-leave").addEventListener("click", leave);
    $("btn-lobby-start").addEventListener("click", () => { if (isHost()) hStartGame(); });

    $("btn-mguess").addEventListener("click", submitGuess);
    $("btn-pick-ok").addEventListener("click", confirmPick);
    $("btn-pick-redo").addEventListener("click", () => {
      C.pick = null; C.pickResolved = null;
      $("pick-card").hidden = true;
      Pano.clear($("pick-pano"));
      C.maps.pick.reset();
    });
    $("btn-mquit").addEventListener("click", () => {
      if (confirm("対戦から退出しますか？")) leave();
    });
    $("btn-mnext").addEventListener("click", () => { if (isHost()) hNextRound(); });
    $("btn-magain").addEventListener("click", () => {
      if (!isHost()) return;
      H.players = H.players.filter(p => p.connected);   // 抜けた人を掃除
      H.phase = "lobby";
      hSync();
    });
    $("btn-mfin-leave").addEventListener("click", leave);

    const panel = $("map-panel-m");
    $("btn-mpin").addEventListener("click", e => {
      e.stopPropagation();
      panel.classList.toggle("pinned");
      if (C.maps.guess) C.maps.guess.refresh();
    });
    panel.addEventListener("mouseenter", () => C.maps.guess && C.maps.guess.refresh());
    panel.addEventListener("mouseleave", () => C.maps.guess && C.maps.guess.refresh());

    initLobbyControls();
  }

  return { init, leave };
})();
