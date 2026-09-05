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
  const SPEED_BONUS_MIN = 1000;   // これ未満の回答には早押しボーナスを出さない

  /** 自分が回答済みか。復帰直後はローカルの C.guess が空なので配信状態で判定する */
  const answeredByMe = st => !!st && (st.answered || []).indexOf(me()) >= 0;

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
        settings: { rounds:5, laps:1, timeLimit:120, region:"world", difficulty:"all",
                    speedBonus:[0, 0, 0] },   // 早押しボーナス（1着/2着/3着）
        phase: "lobby", round: 0, totalRounds: 0,
        quizmasterId: null, location: null, guesses: {}, answerOrder: [], skipVotes: [],
        used: [], deadline: null, timer: null
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
      Net.send({ t:"hello", name:C.name, token:rejoinToken(code) });
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
      if (H.phase === "lobby"){
        H.players = H.players.filter(x => x.id !== ev.id);   // ロビー中は席を残さない
        hSync();
        return;
      }
      const p = H.players.find(x => x.id === ev.id);
      if (p) p.connected = false;                // ゲーム中は復帰できるよう席を残す
      hSync();                                   // 切断をまず全員に伝える
      if (H.phase === "picking" && H.quizmasterId === ev.id) hNextRound();
      else if (H.phase === "playing") hMaybeEndRound();
    } else if (ev.type === "host-lost"){
      alert("ホストとの接続が切れました。メニューに戻ります。");
      leave();
    } else if (ev.type === "data"){
      if (isHost()){ hOnMessage(ev.from, ev.msg); }
      else if (ev.msg && ev.msg.t === "busy"){
        alert("この部屋は現在ゲーム進行中のため、新規の参加はできません。\n" +
              "途中で抜けた人が戻る場合は、抜けたときと同じ名前で参加してください。");
        leave();
      }
      else if (ev.msg && ev.msg.t === "full"){
        alert("この部屋は満員です（最大4人）。");
        leave();
      }
      else if (ev.msg && ev.msg.t === "rejoined"){ /* 復帰成功。直後に届く状態で描画される */ }
      else applyState(ev.msg);
    }
  }

  function leave(){
    stopTick();
    Fx.stopAll();                    // 鳴っている音も止める
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
      const name  = String(msg.name || "プレイヤー").slice(0, 12);
      const token = typeof msg.token === "string" ? msg.token.slice(0, 32) : "";
      if (H.players.find(p => p.id === from && p.connected)) return;   // 重複した hello

      // --- 席への復帰を試みる ---
      let slot = null;
      if (token) slot = H.players.find(p => !p.connected && p.token && p.token === token);
      if (!slot){
        // トークンが無い端末から戻ってきた場合は、同名で切断中の席が1つだけなら復帰を許す
        const sameName = H.players.filter(p => !p.connected && p.name === name);
        if (sameName.length === 1) slot = sameName[0];
      }
      if (slot){
        const oldId = slot.id;
        slot.id = from;
        slot.name = name;
        slot.connected = true;
        if (token) slot.token = token;
        // ID が変わるので、その席に紐づく情報を新しい ID へ移し替える
        if (H.guesses[oldId]){ H.guesses[from] = H.guesses[oldId]; delete H.guesses[oldId]; }
        const oi = (H.answerOrder || []).indexOf(oldId);
        if (oi >= 0) H.answerOrder[oi] = from;      // 復帰しても回答順は引き継ぐ
        if (H.quizmasterId === oldId) H.quizmasterId = from;
        Net.sendTo(from, { t:"rejoined" });
        hSync();
        if (H.phase === "playing") hMaybeEndRound();
        return;
      }

      // --- 新規参加 ---
      if (H.phase !== "lobby"){ Net.sendTo(from, { t:"busy" }); return; }
      if (H.players.length >= 4){ Net.sendTo(from, { t:"full" }); return; }
      H.players.push({ id:from, name, token, score:0, connected:true });
      hSync();
    }
    else if (msg.t === "guess"){
      if (!hRecordGuess(from, parseLatLng(msg.lat, msg.lng))) return;
      hSync();
      hMaybeEndRound();
    }
    else if (msg.t === "skip"){
      hOnSkip(from);
    }
    else if (msg.t === "picked"){
      hOnPicked(from, parseLatLng(msg.lat, msg.lng));
    }
  }

  /**
   * 回答を記録する。ホスト自身の回答もゲストの回答も必ずここを通す。
   * 別々に書いていたときは、ホストの回答を answerOrder に積み忘れていて、
   * ホストが1番に答えると2番の人が1着のボーナスを受け取っていた。
   */
  function hRecordGuess(id, g){
    if (!H || H.phase !== "playing") return false;
    if (id === H.quizmasterId) return false;     // 出題者は回答しない
    if (H.guesses[id]) return false;             // 二重回答を防ぐ
    if (!g) return false;                        // 壊れた座標は捨てる
    H.guesses[id] = g;
    H.answerOrder.push(id);                      // 到着順はホストが記録する
    return true;
  }

  /** 出題を受け付ける。ホストが自分で選んだ場合もゲストからの場合もここを通す */
  function hOnPicked(from, loc){
    if (!H || H.phase !== "picking") return false;
    if (from !== H.quizmasterId) return false;
    if (!loc) return false;
    hStartPlaying(loc);
    return true;
  }

  function hStartGame(){
    const alive = H.players.filter(p => p.connected);
    if (alive.length < 2){ alert("対戦には2人以上必要です"); return; }
    H.players.forEach(p => p.score = 0);
    H.round = 0;
    H.totalRounds = totalRounds(H.mode, alive, H.settings);
    H.used = [];                 // 出題済み（スキップした地点も含む）
    hNextRound();
  }

  /** まだ出していない地点を1つ引く。スキップ時の引き直しにも使う */
  function hDrawLocation(){
    // pickLocations は件数が足りないと難易度を緩めてしまうため、ここでは使わない
    const pool = shuffledPool(H.settings.region, H.settings.difficulty);
    const loc = pool.find(l => H.used.indexOf(l.name) < 0) || pool[0];
    H.used.push(loc.name);
    return loc;
  }

  function hNextRound(){
    if (H.timer){ clearTimeout(H.timer); H.timer = null; }
    H.round++;
    H.guesses = {};
    H.answerOrder = [];              // 早押しボーナス用に回答の到着順を持つ
    H.skipVotes = [];
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
      hStartPlaying(hDrawLocation());
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

  /**
   * 早押しボーナスを結果に反映する。
   * 当てずっぽうの早押しで得をしないよう、一定点以上取った人だけを対象にする。
   * 出題者は回答しないので最初から対象外。
   */
  function applySpeedBonus(results, order, table){
    results.forEach(r => { r.bonus = 0; });
    if (!table || !table.some(v => v > 0)) return;
    let rank = 0;
    order.forEach(id => {
      const r = results.find(x => x.id === id);
      if (!r || r.quizmaster || !r.guess) return;
      if (r.score < SPEED_BONUS_MIN) return;        // 雑な早押しには出さない
      const b = Number(table[rank]) || 0;
      rank++;
      if (b > 0){ r.bonus = b; r.score += b; }
    });
  }

  /** スキップに必要な票数（回答者の過半数。2人なら2人、3〜4人なら2人） */
  function hSkipNeeded(){
    const n = H.players.filter(p => p.connected && p.id !== H.quizmasterId).length;
    return Math.max(1, Math.floor(n / 2) + 1);
  }

  /** スキップ希望の受付。出題者は自分の判断で出題し直せる */
  function hOnSkip(from){
    if (H.phase !== "playing") return;
    if (H.mode === "quiz" && from === H.quizmasterId){
      hRedoRound();                                  // 出題者は単独で引き直せる
      return;
    }
    const p = H.players.find(x => x.id === from);
    if (!p || !p.connected) return;
    const i = H.skipVotes.indexOf(from);
    if (i >= 0) H.skipVotes.splice(i, 1);            // もう一度押したら取り消し
    else H.skipVotes.push(from);
    if (H.skipVotes.length >= hSkipNeeded()) hRedoRound();
    else hSync();
  }

  /** 同じラウンド番号のまま出題をやり直す */
  function hRedoRound(){
    if (H.timer){ clearTimeout(H.timer); H.timer = null; }
    H.guesses = {};
    H.answerOrder = [];
    H.skipVotes = [];
    H.deadline = null;
    if (H.mode === "quiz"){
      H.location = null;
      H.phase = "picking";                           // 出題者が選び直す
      hSync();
    } else {
      hStartPlaying(hDrawLocation());                // 別の地点を引き直す
    }
  }

  /** 回答者全員が回答済みならラウンドを締める */
  function hMaybeEndRound(){
    if (H.phase !== "playing") return;
    // バックグラウンドのタブでは setTimeout が遅延するため、ここでも締め切りを見る
    if (H.deadline && Date.now() >= H.deadline){ hEndRound(); return; }
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
    applySpeedBonus(H.results, H.answerOrder || [], H.settings.speedBonus);
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
      skipVotes: H.skipVotes || [],
      skipNeeded: hSkipNeeded(),
      results: showAnswer ? H.results : null,
      // 端末ごとに時計がずれているため、締め切りを絶対時刻で配ると
      // そのズレがそのまま残り時間の差になる。「あと何ミリ秒か」を配る。
      remainMs: H.deadline ? Math.max(0, H.deadline - Date.now()) : null
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
    // 受け取った残り時間を、自分の時計での締め切りに変換する。
    // 状態は頻繁に配信されるので、その都度ズレなく再同期される。
    C.deadline = (st.remainMs == null) ? null : Date.now() + st.remainMs;

    const changedRound = !prev || prev.round !== st.round || prev.phase !== st.phase;
    // スキップはラウンド番号もフェーズも変えずに場所だけ差し替える。
    // 座標の変化も見ないと、古いストリートビューが表示されたままになる。
    const movedLoc = !!st.location && (!prev || !prev.location ||
                       prev.location.lat !== st.location.lat ||
                       prev.location.lng !== st.location.lng);
    const needReload = changedRound || movedLoc;

    // 相手が回答した瞬間を全画面で知らせる（自分の回答では出さない）
    if (st.phase === "playing" && prev && prev.phase === "playing" && prev.round === st.round){
      const before = prev.answered || [];
      (st.answered || []).forEach(id => {
        if (before.indexOf(id) >= 0 || id === me()) return;
        const p = st.players.find(x => x.id === id);
        if (p) Fx.announce(p.name);
      });
    }

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
      $("btn-mreset").hidden = true;
      $("btn-mskip").hidden = true;
      return;
    }

    // ---- playing ----
    $("pick-overlay").hidden = true;
    const amQm = st.mode === "quiz" && st.quizmasterId === me();
    $("qm-banner").hidden = !amQm;
    $("map-panel-m").hidden = amQm;

    if (needReload){
      C.guess = null;
      C.pending = null;                        // 前の場所のピンを持ち越さない
      const b = $("btn-mguess");
      b.disabled = true;
      b.textContent = "地図にピンを置いてください";
      ensureMaps();
      C.maps.guess.reset();
      C.maps.guess.refresh(60);
      $("m-pano-loading").hidden = false;
      $("btn-mreset").hidden = true;
      Pano.load(st.location, { move:true, pan:true, zoom:true }, { el:$("m-pano") })
          .then(() => {
            $("m-pano-loading").hidden = true;
            $("btn-mreset").hidden = !Pano.canReset();
          });
    }
    if (C.guess || answeredByMe(st)){
      const b = $("btn-mguess");
      b.disabled = true;
      b.textContent = "回答しました（他の人を待っています）";
    }
    renderSkip();
  }

  /** スキップボタンの表示。出題者は単独で出題し直せる */
  function renderSkip(){
    const st = C.st, b = $("btn-mskip");
    if (!st || st.phase !== "playing"){ b.hidden = true; return; }
    b.hidden = false;
    if (st.mode === "quiz" && st.quizmasterId === me()){
      b.textContent = "出題し直す";
      b.dataset.tip = "出題し直す";
      b.classList.remove("voted");
      return;
    }
    const votes = (st.skipVotes || []).length;
    const need  = st.skipNeeded || 1;
    const mine  = (st.skipVotes || []).indexOf(me()) >= 0;
    b.textContent = "スキップ" + (votes ? ` ${votes}/${need}` : "");
    b.dataset.tip = mine ? "スキップ希望を取り消す" : `スキップする（回答者${need}人で成立）`;
    b.classList.toggle("voted", mine);
  }

  function ensureMaps(){
    if (!C.maps.guess){
      C.maps.guess = createPickerMap("m-guess-map", p => {
        if (!C.st || C.st.phase !== "playing") return;
        if (C.guess || answeredByMe(C.st)) return;
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
    if (isHost()) hOnPicked(me(), { lat:loc.lat, lng:loc.lng });
    else Net.send({ t:"picked", lat:loc.lat, lng:loc.lng });
  }

  /* ---------- 回答を送る ---------- */
  function submitGuess(){
    if (!C.pending || C.guess || !C.st || C.st.phase !== "playing") return;
    C.guess = C.pending;
    $("btn-mguess").disabled = true;
    $("btn-mguess").textContent = "回答しました（他の人を待っています）";
    if (isHost()){
      hRecordGuess(me(), C.guess);
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
      const sb = st.settings.speedBonus || [0,0,0];
      const bonus = sb.some(v => v > 0) ? `／ 早押しボーナス：${sb.join(" / ")}` : "";
      $("lobby-guest-info").textContent =
        `モード：${modeName} ／ 制限時間：${tl ? tl / 60 + "分" : "無制限"} ${bonus}`;
    } else {
      const sb = st.settings.speedBonus || [0,0,0];
      ["bonus1","bonus2","bonus3"].forEach((id, i) => {
        if (document.activeElement !== $(id)) $(id).value = String(sb[i] || 0);
      });
    }
    syncQuizRoundLabel();
  }

  function renderPlayers(){
    const st = C.st;
    const box = $("m-players");
    const done = (st.answered || []).length;
    const answerers = st.players.filter(p => p.connected && p.id !== st.quizmasterId).length;
    box.innerHTML = "";

    // 誰を待っているのかがひと目で分かるよう、回答状況を見出しに出す
    if (st.phase === "playing" && answerers > 0){
      const head = document.createElement("div");
      const all = done >= answerers;
      head.className = "mp-head" + (all ? " done" : "");
      head.textContent = all ? "全員回答しました" : `回答 ${done} / ${answerers}`;
      box.appendChild(head);
    }

    st.players.forEach((p, i) => {
      const answered = (st.answered || []).indexOf(p.id) >= 0;
      const isQm = st.quizmasterId === p.id;
      const playing = st.phase === "playing";
      const div = document.createElement("div");
      div.className = "mp-row" + (p.connected ? "" : " off")
                    + (playing && !isQm ? (answered ? " answered" : " waiting") : "");
      div.innerHTML =
        `<span class="dot" style="background:${PLAYER_COLORS[i]}"></span>` +
        `<span class="mp-name">${escapeHtml(p.name)}${p.id === me() ? " (あなた)" : ""}</span>` +
        `<span class="mp-mark">${isQm ? "出題" : (playing ? (answered ? "✓" : "···") : "")}</span>` +
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
    // ここでアナウンスを消してはいけない。
    // 最後に答えた人の場合、回答した瞬間にラウンドが終わるため、
    // 消すと一度も表示されないまま終わってしまう（2人対戦だと毎回起きる）。
    // 1秒で自然に消えるので、結果画面に重なったまま流し切る。
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
        `<span class="mr-bonus">${r.bonus ? "早押し+" + r.bonus : ""}</span>` +
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
    const tick = () => {
      const box = $("m-timer-box");
      if (C.deadline == null){ box.hidden = true; return; }
      box.hidden = false;
      const left = Math.ceil((C.deadline - Date.now()) / 1000);
      $("m-timer").textContent = fmtTime(left);
      $("m-timer").classList.toggle("warn", left <= 10);
    };
    tick();                       // 待たずにすぐ表示する
    C.tickId = setInterval(tick, 250);
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

  /** 早押しボーナスの入力欄（ホストのみ操作できる） */
  function initBonusInputs(){
    ["bonus1","bonus2","bonus3"].forEach((id, i) => {
      const el = $(id);
      const commit = () => {
        if (!isHost() || !H) return;
        let v = Math.round(Number(el.value));
        if (!Number.isFinite(v) || v < 0) v = 0;
        if (v > 2000) v = 2000;
        el.value = String(v);
        H.settings.speedBonus[i] = v;
        hSync();
      };
      el.addEventListener("change", commit);
      el.addEventListener("blur", commit);
    });
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
    $("btn-mreset").addEventListener("click", () => Pano.resetView());
    $("btn-mskip").addEventListener("click", () => {
      if (!C.st || C.st.phase !== "playing") return;
      if (isHost()) hOnSkip(me());
      else Net.send({ t:"skip" });
    });
    $("btn-pick-ok").addEventListener("click", confirmPick);
    $("btn-pick-redo").addEventListener("click", () => {
      C.pick = null; C.pickResolved = null;
      $("pick-card").hidden = true;
      Pano.clear($("pick-pano"));
      C.maps.pick.reset();
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
    $("btn-mmap-open").addEventListener("click", e => {  // スマホ用：たたんだ地図を開く
      e.stopPropagation();
      panel.classList.add("pinned");
      if (C.maps.guess) C.maps.guess.refresh();
    });
    $("btn-mpin").addEventListener("click", e => {
      e.stopPropagation();
      panel.classList.toggle("pinned");
      if (C.maps.guess) C.maps.guess.refresh();
    });
    panel.addEventListener("mouseenter", () => C.maps.guess && C.maps.guess.refresh());
    panel.addEventListener("mouseleave", () => C.maps.guess && C.maps.guess.refresh());

    initLobbyControls();
    initBonusInputs();
  }

  return {
    init, leave,
    /** 地図パネルのサイズ変更後に呼ぶ */
    refreshMap(){ if (C.maps.guess) C.maps.guess.refresh(230); }
  };
})();
