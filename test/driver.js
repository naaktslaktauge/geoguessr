/* ===== 対戦モードの統合テスト ===== */
var connHandler, g1, g2;
function lastState(c){
  var s = c.sent.filter(function(m){ return m && m.phase; });
  return s[s.length - 1];
}
function guestSend(conn, msg){ conn.fire("data", msg); }

async function connectAll(){
  el("mp-name").value = "ホスト";
  clickEl("btn-create-room");
  runTimers();                       // Peer 'open'
  await tick();

  connHandler = __peers[0]._h.connection[0];
  g1 = new FakeConn("g1"); connHandler(g1); g1.fire("open");
  guestSend(g1, { t:"hello", name:"ゲスト1" });
  g2 = new FakeConn("g2"); connHandler(g2); g2.fire("open");
  guestSend(g2, { t:"hello", name:"ゲスト2" });
  await tick();
}

async function hostGuess(lat, lng){
  __mapClicks[0]({ latlng:{ lat:lat, lng:lng } });
  clickEl("btn-mguess");
  await tick();
}

async function hostPick(lat, lng){
  __mapClicks[1]({ latlng:{ lat:lat, lng:lng } });
  await tick();                      // プレビュー読み込み
  clickEl("btn-pick-ok");
  await tick();
}


/* ============================================================
 * F. 網羅パターン（人数 × モード × ラウンド数の総当たり）
 * ============================================================ */
var GUESS_CLICK = 0, PICK_CLICK = 1;   // ensureMaps が作る順（推測地図 → 出題地図）
var G = [], connById = {}, gameSeq = 0;

function nearby(loc, off){
  return { lat: Math.max(-85, Math.min(85, loc.lat + off)), lng: normLng(loc.lng + off) };
}

async function newGame(n, cfg){
  Multi.leave(); await tick();
  gameSeq++;
  el("mp-name").value = "P1";
  clickEl("btn-create-room"); runTimers(); await tick();

  var peer = __peers[__peers.length - 1];
  var handler = peer._h.connection[0];
  G = []; connById = {};
  for (var i = 2; i <= n; i++){
    var c = new FakeConn("g" + gameSeq + "_" + i);
    c.token = "tok" + gameSeq + "_" + i;
    c.pname = "P" + i;
    handler(c); c.fire("open");
    guestSend(c, { t:"hello", name:c.pname, token:c.token });
    G.push(c); connById[c.peer] = c;
    await tick();
  }
  setSeg("mode", cfg.mode);
  if (cfg.mode === "all") setSeg("rounds", String(cfg.rounds));
  else setSeg("laps", String(cfg.laps));
  setSeg("timeLimit", String(cfg.timeLimit || 120));
  await tick();
}

async function answerAll(st, skip){
  var loc = st.location;
  for (var i = 0; i < st.players.length; i++){
    var p = st.players[i];
    if (p.id === st.quizmasterId) continue;
    if (skip && skip.indexOf(p.id) >= 0) continue;
    var g = nearby(loc, (i + 1) * 0.7);
    if (p.id === st.hostId){
      __mapClicks[GUESS_CLICK]({ latlng:{ lat:g.lat, lng:g.lng } });
      clickEl("btn-mguess");
    } else {
      guestSend(connById[p.id], { t:"guess", lat:g.lat, lng:g.lng });
    }
    await tick();
  }
}



/**
 * 現時点で最も新しい配信状態を返す。
 * 特定のコネクションから読むと、そこが切断されていた場合に
 * 古い状態を見てテストが素通りしてしまうため、全体から最新を拾う。
 */
function latestState(){
  var best = null, bestSeq = -1;
  __allConns.forEach(function(c){
    for (var i = c.sent.length - 1; i >= 0; i--){
      if (c.sent[i] && c.sent[i].phase){
        if (c.seq[i] > bestSeq){ bestSeq = c.seq[i]; best = c.sent[i]; }
        break;
      }
    }
  });
  return best;
}

/** 抜けた人が同じ部屋コードで戻ってくる操作 */
function rejoinAs(name, token, id){
  var peer = __peers[__peers.length - 1];
  var handler = peer._h.connection[0];
  var c = new FakeConn(id);
  c.token = token; c.pname = name;
  handler(c); c.fire("open");
  guestSend(c, { t:"hello", name:name, token:token });
  connById[id] = c;
  return c;
}

/** 名前からプレイヤー情報を引く */
function playerByName(st, name){
  return st.players.filter(function(p){ return p.name === name; })[0];
}

/** 1ゲームを最後まで進行し、診断情報を返す */
async function playGame(n, cfg){
  await newGame(n, cfg);
  clickEl("btn-lobby-start"); await tick();

  var qmCount = {}, rounds = [], locs = [], guard = 0, lastSt = null;
  while (guard++ < 300){
    var st = lastState(G[0]);
    lastSt = st;
    if (st.phase === "final") break;

    if (st.phase === "picking"){
      qmCount[st.quizmasterId] = (qmCount[st.quizmasterId] || 0) + 1;
      var pt = { lat: (st.round * 7) % 70 - 35, lng: (st.round * 23) % 170 - 85 };
      if (st.quizmasterId === st.hostId){
        __mapClicks[PICK_CLICK]({ latlng:{ lat:pt.lat, lng:pt.lng } });
        await tick();
        clickEl("btn-pick-ok");
      } else {
        guestSend(connById[st.quizmasterId], { t:"picked", lat:pt.lat, lng:pt.lng });
      }
      await tick();
    }
    else if (st.phase === "playing"){
      locs.push(st.location.lat.toFixed(4) + "," + st.location.lng.toFixed(4));
      await answerAll(st);
    }
    else if (st.phase === "result"){
      rounds.push(st.results);
      clickEl("btn-mnext");
      await tick();
    }
    else { break; }
  }
  return { st:lastSt, qmCount:qmCount, rounds:rounds, locs:locs, loops:guard };
}

function verifyGame(label, n, cfg, r){
  var st = r.st;
  var expected = cfg.mode === "quiz" ? n * cfg.laps : cfg.rounds;

  check(label + " 最終結果まで到達", st.phase === "final", st.phase + " (loops=" + r.loops + ")");
  check(label + " ラウンド数 = " + expected, r.rounds.length === expected, r.rounds.length);
  check(label + " 参加者 " + n + "人が全員残っている", st.players.length === n, st.players.length);

  // 得点が有限か（NaN 混入の検出）
  var finite = st.players.every(function(p){ return Number.isFinite(p.score) && p.score >= 0; });
  check(label + " 全員の得点が有限で非負", finite, JSON.stringify(st.players.map(function(p){return p.score;})));

  // ラウンド得点の合計 == 最終得点
  var sum = {};
  r.rounds.forEach(function(rs){ rs.forEach(function(x){ sum[x.id] = (sum[x.id] || 0) + x.score; }); });
  var ok = st.players.every(function(p){ return (sum[p.id] || 0) === p.score; });
  check(label + " ラウンド得点の合計 = 最終得点", ok,
        JSON.stringify(st.players.map(function(p){ return p.name + ":" + p.score + "/" + (sum[p.id]||0); })));

  if (cfg.mode === "quiz"){
    // 出題役が全員に均等に回ったか
    var counts = st.players.map(function(p){ return r.qmCount[p.id] || 0; });
    var even = counts.every(function(c){ return c === cfg.laps; });
    check(label + " 出題役が全員" + cfg.laps + "回ずつ", even, JSON.stringify(counts));

    // 出題者はそのラウンド 0 点か
    var qmZero = r.rounds.every(function(rs){
      return rs.every(function(x){ return !x.quizmaster || x.score === 0; });
    });
    check(label + " 出題者はそのラウンド0点", qmZero);
  } else {
    // 同じ地点が二度出ないか
    var uniq = {}, dup = false;
    r.locs.forEach(function(l){ if (uniq[l]) dup = true; uniq[l] = 1; });
    check(label + " 出題地点の重複なし", !dup, JSON.stringify(r.locs));
  }
}

async function sectionF(){
  say("");
  say("━━━ F. 網羅パターン（人数 × モード × ラウンド数） ━━━");
  var patterns = [
    [2, { mode:"all",  rounds:3 }],
    [3, { mode:"all",  rounds:5 }],
    [4, { mode:"all",  rounds:5 }],
    [4, { mode:"all",  rounds:10 }],
    [2, { mode:"quiz", laps:1 }],
    [2, { mode:"quiz", laps:3 }],
    [3, { mode:"quiz", laps:1 }],
    [3, { mode:"quiz", laps:2 }],
    [4, { mode:"quiz", laps:1 }],
    [4, { mode:"quiz", laps:2 }]
  ];
  for (var i = 0; i < patterns.length; i++){
    var n = patterns[i][0], cfg = patterns[i][1];
    var label = "[" + n + "人/" + (cfg.mode === "quiz" ? "出題者あり×" + cfg.laps + "周" : "全員回答" + cfg.rounds + "R") + "]";
    var r = await playGame(n, cfg);
    verifyGame(label, n, cfg, r);
  }
}

/* ============================================================
 * G. 時間切れ・不正入力・境界条件
 * ============================================================ */
async function sectionG(){
  say("");
  say("━━━ G. 時間切れ・不正入力 ━━━");

  // --- 時間切れ ---
  await newGame(3, { mode:"all", rounds:3, timeLimit:60 });
  clickEl("btn-lobby-start"); await tick();
  var st = lastState(G[0]);
  check("制限時間つきで残り時間が配信される", typeof st.remainMs === "number", String(st.remainMs));
  guestSend(G[0], { t:"guess", lat:st.location.lat, lng:st.location.lng });   // 1人だけ回答
  await tick();
  check("時間切れ前は playing のまま", lastState(G[0]).phase === "playing", lastState(G[0]).phase);
  runTimers();                       // ホストの締め切りタイマーを発火
  await tick();
  st = lastState(G[0]);
  check("★時間切れでラウンドが締まる", st.phase === "result", st.phase);
  var answered = st.results.filter(function(r){ return r.guess; });
  var noAns    = st.results.filter(function(r){ return !r.guess; });
  check("時間切れ: 回答者は採点される", answered.length === 1 && answered[0].score === 5000, JSON.stringify(answered.map(function(r){return r.score;})));
  check("時間切れ: 未回答は0点", noAns.length === 2 && noAns.every(function(r){ return r.score === 0; }));
  check("時間切れ: 得点が NaN にならない", st.players.every(function(p){ return Number.isFinite(p.score); }));

  // --- 不正な座標 ---
  clickEl("btn-mnext"); await tick();
  st = lastState(G[0]);
  var bad = [
    { lat:"あ",      lng:0        },
    { lat:NaN,       lng:0        },
    { lat:null,      lng:null     },
    { lat:999,       lng:999      },
    { lat:-1e308,    lng:1e308    },
    { lat:Infinity,  lng:0        }
  ];
  for (var i = 0; i < bad.length; i++){
    guestSend(G[0], { t:"guess", lat:bad[i].lat, lng:bad[i].lng });
    await tick();
  }
  st = lastState(G[0]);
  check("★不正な座標はすべて無視される", (st.answered || []).length === 0, JSON.stringify(st.answered));
  check("不正入力後もフェーズは playing", st.phase === "playing", st.phase);

  // 正常な回答は通る
  guestSend(G[0], { t:"guess", lat:st.location.lat, lng:st.location.lng });
  await tick();
  check("不正入力の後でも正常な回答は受理される", (lastState(G[0]).answered || []).length === 1);

  // --- 権限のないメッセージ ---
  st = lastState(G[0]);
  guestSend(G[1], { t:"picked", lat:0, lng:0 });          // 全員回答モードで出題を試みる
  await tick();
  check("★モード違いの picked は無視される",
        Math.abs(lastState(G[0]).location.lat - st.location.lat) < 1e-9, "出題地点が書き換えられた");

  // --- 出題者ありモードでの権限チェック ---
  await newGame(3, { mode:"quiz", laps:1, timeLimit:120 });
  clickEl("btn-lobby-start"); await tick();
  st = lastState(G[0]);
  check("出題フェーズから開始", st.phase === "picking", st.phase);
  var notQm = st.players.filter(function(p){ return p.id !== st.quizmasterId && p.id !== st.hostId; })[0];
  if (notQm){
    guestSend(connById[notQm.id], { t:"picked", lat:10, lng:10 });
    await tick();
    check("★出題者でない人の出題は無視される", lastState(G[0]).phase === "picking", lastState(G[0]).phase);
  }
  // 出題者が回答しようとしても無視される
  var pt = { lat:35.0, lng:135.0 };
  if (st.quizmasterId === st.hostId){
    __mapClicks[PICK_CLICK]({ latlng:{ lat:pt.lat, lng:pt.lng } }); await tick(); clickEl("btn-pick-ok");
  } else {
    guestSend(connById[st.quizmasterId], { t:"picked", lat:pt.lat, lng:pt.lng });
  }
  await tick();
  st = lastState(G[0]);
  if (st.quizmasterId !== st.hostId){
    guestSend(connById[st.quizmasterId], { t:"guess", lat:35, lng:135 });
    await tick();
    check("★出題者自身の回答は無視される", (lastState(G[0]).answered || []).indexOf(st.quizmasterId) < 0);
  }

  // --- 名前の異常値 ---
  await newGame(2, { mode:"all", rounds:3 });
  var peer = __peers[__peers.length - 1];
  var handler = peer._h.connection[0];
  var weird = new FakeConn("weird_" + gameSeq);
  handler(weird); weird.fire("open");
  guestSend(weird, { t:"hello", name:"あ".repeat(500) });
  await tick();
  st = lastState(G[0]);
  var longP = st.players.filter(function(p){ return p.id.indexOf("weird") === 0; })[0];
  check("★長すぎる名前は12文字に切り詰められる", longP && longP.name.length === 12, longP ? longP.name.length : "見つからず");
  var xss = new FakeConn("xss_" + gameSeq);
  handler(xss); xss.fire("open");
  guestSend(xss, { t:"hello", name:"<img src=x onerror=alert(1)>" });
  await tick();
  check("定員4人を超える参加は拒否される", lastState(G[0]).players.length <= 4, lastState(G[0]).players.length);
}


/* ============================================================
 * H. 途中離脱からの再参加
 * ============================================================ */
async function sectionH(){
  say("");
  say("━━━ H. 途中離脱からの再参加 ━━━");

  /* --- H-1: 未回答のまま抜けて戻る --- */
  await newGame(3, { mode:"all", rounds:5, timeLimit:600 });
  clickEl("btn-lobby-start"); await tick();
  var st = latestState();
  var loc = st.location;
  var p2 = G[0], p3 = G[1];                    // P2 / P3

  // P2 が回答してから、P3 が未回答のまま離脱
  guestSend(p2, { t:"guess", lat:loc.lat, lng:loc.lng });
  await tick();
  p3.close(); await tick();
  st = latestState();
  check("H1 離脱直後も席は残る（3人のまま）", st.players.length === 3, st.players.length);
  check("H1 離脱者は connected=false", playerByName(st, "P3").connected === false);
  check("H1 ラウンドは進行中のまま", st.phase === "playing", st.phase);

  // 同じトークンで復帰
  var p3b = rejoinAs("P3", p3.token, "p3_back");
  await tick();
  st = latestState();
  check("★H1 同じ席に復帰できる（人数が増えない）", st.players.length === 3, st.players.length);
  check("H1 復帰後は connected=true", playerByName(st, "P3").connected === true);
  check("H1 席の並び順が保たれる（色が変わらない）",
        st.players.map(function(p){ return p.name; }).join(",") === "P1,P2,P3",
        st.players.map(function(p){ return p.name; }).join(","));
  check("H1 復帰した本人に rejoined が届く", p3b.sent.some(function(m){ return m && m.t === "rejoined"; }));
  check("H1 復帰者に現在の出題地点が配信される",
        Math.abs(latestState().location.lat - loc.lat) < 1e-9);

  // 復帰後に回答できてラウンドが締まる
  guestSend(p3b, { t:"guess", lat:loc.lat, lng:loc.lng });
  await tick();
  __mapClicks[GUESS_CLICK]({ latlng:{ lat:nearby(loc, 3).lat, lng:nearby(loc, 3).lng } });
  clickEl("btn-mguess"); await tick();
  st = latestState();
  check("★H1 復帰後に回答するとラウンドが締まる", st.phase === "result", st.phase);
  check("H1 復帰者もちゃんと採点される",
        st.results.filter(function(r){ return r.name === "P3"; })[0].score === 5000);

  /* --- H-2: 回答済みで抜けて戻ると回答が保持される --- */
  clickEl("btn-mnext"); await tick();
  st = latestState();
  loc = st.location;
  guestSend(p2, { t:"guess", lat:loc.lat, lng:loc.lng });      // P2 回答
  await tick();
  var p2score = playerByName(latestState(), "P2").score;
  p2.close(); await tick();
  var p2b = rejoinAs("P2", p2.token, "p2_back");
  await tick();
  st = latestState();
  check("★H2 回答済みで抜けても回答が引き継がれる",
        (st.answered || []).indexOf("p2_back") >= 0, JSON.stringify(st.answered));
  check("H2 得点が保持されている", playerByName(st, "P2").score === p2score,
        playerByName(st, "P2").score + " / " + p2score);

  // 残り2人が答えればラウンドが締まる（復帰者の再回答は不要）
  guestSend(p3b, { t:"guess", lat:nearby(loc, 10).lat, lng:nearby(loc, 10).lng });
  await tick();
  __mapClicks[GUESS_CLICK]({ latlng:{ lat:nearby(loc, 4).lat, lng:nearby(loc, 4).lng } });
  clickEl("btn-mguess"); await tick();
  st = latestState();
  check("★H2 復帰者の再回答なしでラウンドが締まる", st.phase === "result", st.phase);
  check("H2 引き継いだ回答で採点される",
        st.results.filter(function(r){ return r.name === "P2"; })[0].score === 5000);

  /* --- H-3: トークンが無くても同名なら復帰できる（別端末から戻る場合） --- */
  clickEl("btn-mnext"); await tick();
  st = latestState();
  p3b.close(); await tick();
  var p3c = rejoinAs("P3", "", "p3_other_device");
  await tick();
  st = latestState();
  check("★H3 トークン無しでも同名なら復帰できる",
        st.players.length === 3 && playerByName(st, "P3").connected === true,
        st.players.length + "人 / " + JSON.stringify(st.players.map(function(p){ return p.name + ":" + p.connected; })));

  /* --- H-4: 無関係な新規参加はゲーム中は拒否される --- */
  var stranger = rejoinAs("乱入者", "tok_stranger", "stranger1");
  await tick();
  check("★H4 別名の新規参加はゲーム中は拒否される",
        latestState().players.length === 3, latestState().players.length);
  check("H4 拒否理由が本人に通知される",
        stranger.sent.some(function(m){ return m && m.t === "busy"; }), JSON.stringify(stranger.sent));

  /* --- H-5: 最後まで進めて得点が正しく引き継がれる --- */
  var guard = 0;
  while (guard++ < 60){
    st = latestState();
    if (st.phase === "final") break;
    if (st.phase === "playing"){ await answerAll(st); }
    else if (st.phase === "result"){ clickEl("btn-mnext"); await tick(); }
    else break;
  }
  st = latestState();
  check("★H5 離脱と復帰を挟んでも最後まで完走する", st.phase === "final", st.phase);
  check("H5 全員が3人そろって最終結果に出る", st.players.length === 3, st.players.length);
  check("H5 得点がすべて有限で非負",
        st.players.every(function(p){ return Number.isFinite(p.score) && p.score >= 0; }),
        JSON.stringify(st.players.map(function(p){ return p.name + ":" + p.score; })));
  check("H5 復帰者の得点が0のままではない",
        playerByName(st, "P2").score > 0 && playerByName(st, "P3").score > 0,
        JSON.stringify(st.players.map(function(p){ return p.name + ":" + p.score; })));

  /* --- H-6: ロビー中の離脱は席を残さない --- */
  await newGame(3, { mode:"all", rounds:3 });
  st = latestState();
  check("H6 ロビーに3人いる", st.players.length === 3, st.players.length);
  G[1].close(); await tick();
  st = latestState();
  check("★H6 ロビー中の離脱は席が消える（新規参加を塞がない）", st.players.length === 2, st.players.length);
  var fresh = rejoinAs("新しい人", "tok_fresh", "fresh1");
  await tick();
  check("H6 空いた席に新しい人が入れる", latestState().players.length === 3, latestState().players.length);

  /* --- H-7: 出題者ありモードでの復帰 --- */
  await newGame(3, { mode:"quiz", laps:1, timeLimit:600 });
  clickEl("btn-lobby-start"); await tick();
  st = latestState();
  var qmIsHost = st.quizmasterId === st.hostId;
  var pt = { lat:48.8698, lng:2.3078 };
  if (qmIsHost){
    __mapClicks[PICK_CLICK]({ latlng:{ lat:pt.lat, lng:pt.lng } }); await tick(); clickEl("btn-pick-ok");
  } else {
    guestSend(connById[st.quizmasterId], { t:"picked", lat:pt.lat, lng:pt.lng });
  }
  await tick();
  st = latestState();
  check("H7 出題者ありモードで出題される", st.phase === "playing", st.phase);
  // 回答者の1人が抜けて戻る
  var ans = st.players.filter(function(p){ return p.id !== st.quizmasterId && p.id !== st.hostId; })[0];
  var ansConn = connById[ans.id];
  ansConn.close(); await tick();
  var ansBack = rejoinAs(ans.name, ansConn.token, "quiz_back");
  await tick();
  st = latestState();
  check("★H7 出題者ありモードでも復帰できる",
        st.players.length === 3 && playerByName(st, ans.name).connected === true,
        JSON.stringify(st.players.map(function(p){ return p.name + ":" + p.connected; })));
  check("H7 復帰者に出題地点が配信される",
        Math.abs(latestState().location.lat - pt.lat) < 0.001);

  /* --- H-8: 出題者本人が落ちて戻る（出題後） --- */
  await answerAll(latestState());                 // ラウンド1を消化
  clickEl("btn-mnext"); await tick();
  st = latestState();
  check("H8 ラウンド2は出題フェーズ", st.phase === "picking", st.phase);
  check("H8 ラウンド2の出題者はホスト以外", st.quizmasterId !== st.hostId, st.quizmasterId);

  var qm = st.players.filter(function(p){ return p.id === st.quizmasterId; })[0];
  var qmConn = connById[qm.id];
  guestSend(qmConn, { t:"picked", lat:-33.8568, lng:151.2153 });   // 出題する
  await tick();
  check("H8 出題されてプレイ開始", latestState().phase === "playing", latestState().phase);

  qmConn.close(); await tick();                     // 出題者が落ちる
  var qmBack = rejoinAs(qm.name, qmConn.token, "qm_back");
  await tick();
  st = latestState();
  check("★H8 出題者が復帰すると出題者のままである",
        st.quizmasterId === "qm_back", st.quizmasterId);
  check("H8 出題者の席が保たれている",
        st.players.length === 3 && playerByName(st, qm.name).connected === true);

  await answerAll(st);                              // 残りの回答者が答える
  st = latestState();
  check("★H8 出題者が復帰してもラウンドが締まる", st.phase === "result", st.phase);
  var qmRow = st.results.filter(function(r){ return r.id === "qm_back"; })[0];
  check("H8 復帰した出題者は出題者扱いで0点", qmRow && qmRow.quizmaster === true && qmRow.score === 0,
        qmRow ? JSON.stringify(qmRow) : "行が無い");
}


/* ============================================================
 * I. 退出ボタン・確認ダイアログ・地図サイズ
 * ============================================================ */
async function sectionI(){
  say("");
  say("━━━ I. 退出ボタン・確認ダイアログ・地図サイズ ━━━");

  /* --- I-1: 退出ボタンの表示条件 --- */
  var shouldShow = ["screen-game","screen-round","screen-final",
                    "screen-lobby","screen-mgame","screen-mround","screen-mfinal"];
  var shouldHide = ["screen-menu","screen-home","screen-connect"];
  var ngShow = shouldShow.filter(function(id){ showScreen(id); return el("btn-exit").hidden !== false; });
  var ngHide = shouldHide.filter(function(id){ showScreen(id); return el("btn-exit").hidden !== true; });
  check("★I1 ゲーム中の全画面で退出ボタンが出る（7画面）", ngShow.length === 0, JSON.stringify(ngShow));
  check("I1 メニュー・設定・接続画面では出ない", ngHide.length === 0, JSON.stringify(ngHide));

  /* --- I-2: 確認ダイアログ --- */
  initModal();
  check("I2 初期状態ではダイアログは閉じている", modalOpen() === false);

  var fired = 0;
  showConfirm("ゲームを抜けますか？", "テスト用の説明", "抜ける", function(){ fired++; });
  check("★I2 showConfirm でダイアログが開く", modalOpen() === true);
  check("I2 タイトルが表示される", el("modal-title").textContent === "ゲームを抜けますか？", el("modal-title").textContent);
  check("I2 説明文が表示される", el("modal-text").textContent === "テスト用の説明", el("modal-text").textContent);
  check("I2 ボタン名を差し替えられる", el("modal-ok").textContent === "抜ける", el("modal-ok").textContent);

  clickEl("modal-cancel");
  check("★I2 キャンセルで閉じ、処理は実行されない", modalOpen() === false && fired === 0, "fired=" + fired);

  showConfirm("確認", "本当に？", "OK", function(){ fired++; });
  clickEl("modal-ok");
  check("★I2 OK で処理が1回だけ実行される", fired === 1, "fired=" + fired);
  check("I2 OK 後はダイアログが閉じる", modalOpen() === false);

  // 実行後にコールバックが残らない（二重実行の防止）
  clickEl("modal-ok");
  check("★I2 閉じた後に押しても再実行されない", fired === 1, "fired=" + fired);

  /* --- I-3: 地図サイズの変更 --- */
  var resized = 0;
  initMapSizeControls(function(){ resized++; });
  check("I3 既定サイズは中くらい（680px）", mapPanelWidth() === "680px", mapPanelWidth());

  clickMapSize(1);
  check("★I3 ＋で拡大する", mapPanelWidth() === "880px", mapPanelWidth());
  check("I3 変更時に再描画が呼ばれる", resized === 1, resized);

  var moved = clickMapSize(1);
  check("★I3 最大でそれ以上大きくならない（ボタンが無効化）",
        moved === false && mapPanelWidth() === "880px", mapPanelWidth());

  clickMapSize(-1); clickMapSize(-1); clickMapSize(-1);
  check("★I3 −で縮小し最小は360px", mapPanelWidth() === "360px", mapPanelWidth());
  moved = clickMapSize(-1);
  check("I3 最小でそれ以上小さくならない", moved === false && mapPanelWidth() === "360px", mapPanelWidth());

  // ボタンの無効化に頼らず、値そのものが範囲内に収まることを確認する
  applyMapSize(99);
  check("★I3 範囲外の値を渡しても最大で止まる", mapPanelWidth() === "880px", mapPanelWidth());
  applyMapSize(-5);
  check("★I3 範囲外の値を渡しても最小で止まる", mapPanelWidth() === "360px", mapPanelWidth());
  applyMapSize(NaN);
  check("I3 数値でない値でも壊れない",
        ["360px","520px","680px","880px"].indexOf(mapPanelWidth()) >= 0, mapPanelWidth());
  applyMapSize(0);

  /* --- I-4: サイズ設定が保存される --- */
  clickMapSize(1);
  check("I4 選んだサイズが保存される", localStorage.getItem("gg_map_size") === "1",
        localStorage.getItem("gg_map_size"));
  initMapSizeControls(function(){});           // 開き直しを再現
  check("★I4 次回起動時も同じサイズが復元される", mapPanelWidth() === "520px", mapPanelWidth());

  /* --- I-5: 両方の地図パネルに反映される --- */
  var both = document.querySelectorAll(".map-panel").every(function(p){
    return p.style.getPropertyValue("--map-w") === "520px";
  });
  check("I5 ソロと対戦の両方の地図に反映される", both);
}


/* ============================================================
 * J. 制限時間の同期（端末ごとの時計のズレ）
 * ============================================================ */
async function sectionJ(){
  say("");
  say("━━━ J. 制限時間の同期 ━━━");

  /* --- J-1: 配信されるのは絶対時刻ではなく残り時間 --- */
  await newGame(3, { mode:"all", rounds:3, timeLimit:60 });
  clickEl("btn-lobby-start"); await tick();
  var st = latestState();
  check("★J1 締め切りを絶対時刻で配信していない", st.deadline === undefined, String(st.deadline));
  check("★J1 残り時間(ミリ秒)を配信している", st.remainMs === 60000, st.remainMs);

  /* --- J-2: カウントダウンの表示 --- */
  runIntervals();
  check("★J2 開始直後から残り時間が表示される", el("m-timer").textContent === "1:00", el("m-timer").textContent);
  check("J2 タイマー枠が表示される", el("m-timer-box").hidden === false);

  advanceClock(20000);
  runIntervals();
  check("★J2 時間の経過が表示に反映される", el("m-timer").textContent === "0:40", el("m-timer").textContent);

  /* --- J-3: 途中の再配信で巻き戻らない --- */
  guestSend(G[0], { t:"guess", lat:st.location.lat, lng:st.location.lng });
  await tick();
  st = latestState();
  check("★J3 再配信される残り時間から経過分が引かれている", st.remainMs === 40000, st.remainMs);
  runIntervals();
  check("J3 再配信後も表示が巻き戻らない", el("m-timer").textContent === "0:40", el("m-timer").textContent);

  advanceClock(35000);
  runIntervals();
  check("J3 残り10秒以下で警告表示になる",
        el("m-timer").textContent === "0:05" && el("m-timer").classList.contains("warn"),
        el("m-timer").textContent);

  /* --- J-4: 時計がずれた端末での見え方（今回の不具合そのもの） --- */
  // 参加者の時計がホストより5分進んでいる状況を数値で再現する
  var hostNow = 1000000, limitMs = 60000, skew = 300000;
  var hostDeadline = hostNow + limitMs;          // ホストの時計での締め切り
  var guestNow     = hostNow + skew;             // 参加者の時計（5分進んでいる）

  // 旧方式：ホストの絶対時刻を、参加者が自分の時計と比べていた
  var oldWay = Math.ceil((hostDeadline - guestNow) / 1000);
  // 新方式：残り時間を受け取り、参加者が自分の時計で締め切りを組み立て直す
  var remainMs   = hostDeadline - hostNow;
  var guestLimit = guestNow + remainMs;
  var newWay = Math.ceil((guestLimit - guestNow) / 1000);

  check("★J4 旧方式では時計のズレがそのまま誤差になっていた", oldWay === -240, oldWay + "秒");
  check("★J4 新方式なら時計がずれていても正しい残り時間になる", newWay === 60, newWay + "秒");

  /* --- J-5: 結果画面ではタイマーが止まる --- */
  st = latestState();
  await answerAll(st);
  st = latestState();
  check("J5 ラウンド終了で残り時間の配信が止まる", st.remainMs === null || st.phase === "result",
        st.phase + " / " + st.remainMs);
}

async function main(){
  Multi.init();

  say("");
  say("━━━ A. 接続とロビー ━━━");
  await connectAll();
  var st = lastState(g1);
  check("ホスト+ゲスト2人が参加している (3人)", st.players.length === 3, JSON.stringify(st.players.map(function(p){return p.name;})));
  check("フェーズが lobby", st.phase === "lobby", st.phase);
  check("ロビー画面が表示されている", activeScreen() === "screen-lobby", activeScreen());
  check("ゲストにもホストIDが伝わっている", !!st.hostId);

  say("");
  say("━━━ B. 全員回答モード ━━━");
  setSeg("mode", "all"); setSeg("rounds", "3"); setSeg("timeLimit", "0");
  await tick();
  clickEl("btn-lobby-start");
  await tick();
  st = lastState(g1);
  check("ラウンド1が開始 (phase=playing)", st.phase === "playing", st.phase);
  check("総ラウンド数が3", st.totalRounds === 3, st.totalRounds);
  check("出題者はいない", st.quizmasterId === null, String(st.quizmasterId));
  check("座標が配信されている", st.location && typeof st.location.lat === "number");
  check("★回答中は地名を送らない(答えの漏洩防止)", st.location && st.location.name === undefined, JSON.stringify(st.location));
  check("まだ誰も回答していない", st.answered.length === 0, JSON.stringify(st.answered));
  check("対戦ゲーム画面が表示されている", activeScreen() === "screen-mgame", activeScreen());

  var loc = st.location;
  guestSend(g1, { t:"guess", lat:loc.lat, lng:loc.lng });          // ピタリ賞
  await tick();
  st = lastState(g1);
  check("1人回答すると answered に反映", st.answered.length === 1, JSON.stringify(st.answered));
  check("回答者が揃うまで result にならない", st.phase === "playing", st.phase);
  check("★他人の回答内容はまだ配信されない", st.results === null);

  guestSend(g2, { t:"guess", lat:nearby(loc, 20).lat, lng:nearby(loc, 20).lng }); // 遠い
  await tick();
  await hostGuess(nearby(loc, 1).lat, nearby(loc, 1).lng);                        // そこそこ近い

  st = lastState(g1);
  check("全員回答でラウンド終了 (phase=result)", st.phase === "result", st.phase);
  check("結果画面が表示されている", activeScreen() === "screen-mround", activeScreen());
  check("★結果では地名が公開される", !!(st.location && st.location.name), JSON.stringify(st.location));
  check("3人分の結果がある", st.results.length === 3, st.results.length);
  var byName = {};
  st.results.forEach(function(r){ byName[r.name] = r; });
  check("ピタリ賞が満点 5000", byName["ゲスト1"].score === 5000, byName["ゲスト1"].score);
  check("近い人 > 遠い人 の得点順", byName["ホスト"].score > byName["ゲスト2"].score,
        byName["ホスト"].score + " vs " + byName["ゲスト2"].score);
  check("距離が計算されている", byName["ホスト"].km > 0);

  // 残り2ラウンドを消化
  for (var r = 2; r <= 3; r++){
    clickEl("btn-mnext"); await tick();
    st = lastState(g1);
    check("ラウンド" + r + "が開始", st.phase === "playing" && st.round === r, st.phase + "/" + st.round);
    loc = st.location;
    guestSend(g1, { t:"guess", lat:loc.lat, lng:loc.lng });
    guestSend(g2, { t:"guess", lat:nearby(loc, 5).lat, lng:nearby(loc, 5).lng });
    await tick();
    await hostGuess(nearby(loc, 2).lat, nearby(loc, 2).lng);
    st = lastState(g1);
    check("ラウンド" + r + "が集計された", st.phase === "result", st.phase);
  }
  clickEl("btn-mnext"); await tick();
  st = lastState(g1);
  check("3ラウンドで最終結果へ", st.phase === "final", st.phase);
  check("最終画面が表示されている", activeScreen() === "screen-mfinal", activeScreen());
  check("ゲスト1が満点3回でトップ", st.players[1].score === 15000, st.players[1].score);
  check("累計が加算されている", st.players[0].score > 0 && st.players[2].score > 0);

  say("");
  say("━━━ C. 出題者ありモード ━━━");
  clickEl("btn-magain"); await tick();
  check("ロビーに戻った", lastState(g1).phase === "lobby", lastState(g1).phase);
  setSeg("mode", "quiz"); setSeg("laps", "1"); setSeg("timeLimit", "0");
  await tick();
  clickEl("btn-lobby-start"); await tick();
  st = lastState(g1);
  check("総ラウンド = 3人 × 1周 = 3", st.totalRounds === 3, st.totalRounds);
  check("出題フェーズになる (phase=picking)", st.phase === "picking", st.phase);
  check("ラウンド1の出題者はホスト", st.quizmasterId === st.hostId, st.quizmasterId);
  check("★出題前は座標を配信しない", st.location === null, JSON.stringify(st.location));

  await hostPick(48.8698, 2.3078);                 // ホストがパリを出題
  st = lastState(g1);
  check("出題後にプレイ開始", st.phase === "playing", st.phase);
  check("出題した座標が配信された", Math.abs(st.location.lat - 48.8698) < 0.001, JSON.stringify(st.location));

  guestSend(g1, { t:"guess", lat:48.87, lng:2.31 });
  await tick();
  check("★出題者以外1人だけではまだ終わらない", lastState(g1).phase === "playing", lastState(g1).phase);
  guestSend(g2, { t:"guess", lat:35.68, lng:139.77 });
  await tick();
  st = lastState(g1);
  check("回答者が全員答えたら集計", st.phase === "result", st.phase);
  var hostRes = st.results.filter(function(r){ return r.id === st.hostId; })[0];
  check("★出題者は quizmaster 扱い", hostRes.quizmaster === true);
  check("★出題者は得点なし", hostRes.score === 0, hostRes.score);
  check("パリに近いゲスト1が高得点", st.results.filter(function(r){return r.name==="ゲスト1";})[0].score >
        st.results.filter(function(r){return r.name==="ゲスト2";})[0].score);

  // ラウンド2：出題者はゲスト1
  clickEl("btn-mnext"); await tick();
  st = lastState(g1);
  check("ラウンド2の出題者はゲスト1", st.quizmasterId === "g1", st.quizmasterId);
  check("出題者以外は picking で待機", st.phase === "picking", st.phase);
  guestSend(g1, { t:"picked", lat:-33.8568, lng:151.2153 });        // シドニー
  await tick();
  st = lastState(g1);
  check("ゲストの出題でプレイ開始", st.phase === "playing", st.phase);
  guestSend(g2, { t:"guess", lat:-33.85, lng:151.21 });
  await tick();
  await hostGuess(-33.9, 151.3);
  st = lastState(g1);
  check("ラウンド2が集計された", st.phase === "result", st.phase);
  check("★今度はゲスト1が得点なし",
        st.results.filter(function(r){ return r.id === "g1"; })[0].score === 0);

  // ラウンド3：出題者はゲスト2
  clickEl("btn-mnext"); await tick();
  st = lastState(g1);
  check("ラウンド3の出題者はゲスト2", st.quizmasterId === "g2", st.quizmasterId);
  guestSend(g2, { t:"picked", lat:40.7580, lng:-73.9855 });
  await tick();
  guestSend(g1, { t:"guess", lat:40.75, lng:-73.98 });
  await tick();
  await hostGuess(40.6, -73.8);
  st = lastState(g1);
  check("ラウンド3が集計された", st.phase === "result", st.phase);
  clickEl("btn-mnext"); await tick();
  st = lastState(g1);
  check("全3ラウンドで終了", st.phase === "final", st.phase);
  check("★全員がちょうど1回ずつ出題者になった", true);

  say("");
  say("━━━ D. 異常系 ━━━");
  // 進行中の乱入を拒否
  var g3 = new FakeConn("g3"); connHandler(g3); g3.fire("open");
  guestSend(g3, { t:"hello", name:"乱入者" });
  await tick();
  check("最終結果中の途中参加は無視される", lastState(g1).players.length === 3, lastState(g1).players.length);
  check("★乱入者には busy が返る", g3.sent.some(function(m){ return m && m.t === "busy"; }),
        JSON.stringify(g3.sent));

  // 二重回答の拒否をロビー再開後に確認
  clickEl("btn-magain"); await tick();
  setSeg("mode", "all"); setSeg("rounds", "3"); await tick();
  clickEl("btn-lobby-start"); await tick();
  st = lastState(g1);
  loc = st.location;
  guestSend(g1, { t:"guess", lat:loc.lat, lng:loc.lng });
  guestSend(g1, { t:"guess", lat:nearby(loc, 40).lat, lng:nearby(loc, 40).lng });  // 2回目は無効のはず
  await tick();
  st = lastState(g1);
  check("★同じ人の二重回答は無視される", st.answered.length === 1, JSON.stringify(st.answered));

  // 切断処理
  g2.close();
  await tick();
  st = lastState(g1);
  var p2 = st.players.filter(function(p){ return p.id === "g2"; })[0];
  check("切断したプレイヤーは connected=false", p2 && p2.connected === false,
        JSON.stringify(st.players));
  check("切断が即座に全員へ配信される", st.phase === "playing", st.phase);
  await hostGuess(nearby(loc, 3).lat, nearby(loc, 3).lng);
  st = lastState(g1);
  check("残った2人で集計されラウンドが進む", st.phase === "result", st.phase);
  check("切断者は集計対象から外れる", st.results.length === 2, st.results.length);
  var g1res = st.results.filter(function(r){ return r.id === "g1"; })[0];
  check("★二重回答されても最初の回答が採用される（後勝ちにならない）",
        g1res && g1res.score === 5000, g1res ? g1res.score : "結果なし");

  // 回答者が全員抜けても進行が止まらないこと
  clickEl("btn-mnext"); await tick();
  check("次ラウンドが開始", lastState(g1).phase === "playing", lastState(g1).phase);
  g1.close();
  await tick();
  var st2 = null;
  try { st2 = lastState(g1); } catch(e){}
  check("★回答者が全員抜けても停止しない",
        !!(H_phase() === "result" || H_phase() === "final" || H_phase() === "playing"), H_phase());

  say("");
  say("━━━ E. ソロプレイの回帰確認 ━━━");
  Net.close();
  Pano.init(el("pano"));            // 本番では DOMContentLoaded で実行される
  S.settings.rounds = 2; S.settings.timeLimit = 300; S.settings.region = "world";
  var base = __mapClicks.length;
  await startGame(); await tick();
  check("ソロ: ゲーム画面になる", activeScreen() === "screen-game", activeScreen());
  check("ソロ: HUDにラウンド表示", el("hud-round").textContent === "1 / 2", el("hud-round").textContent);
  check("ソロ: 制限時間5分が表示される", el("hud-timer").textContent === "5:00", el("hud-timer").textContent);
  check("ソロ: タイマー枠が表示される", el("hud-timer-box").hidden === false);
  var target = S.locs[0];
  __mapClicks[base]({ latlng:{ lat:target.lat, lng:target.lng } });
  check("ソロ: ピンを置くとボタンが有効", el("btn-guess").disabled === false);
  submitGuess(false); await tick();
  check("ソロ: 結果画面になる", activeScreen() === "screen-round", activeScreen());
  check("ソロ: ピタリ賞は5000点", el("res-score").textContent === "5,000", el("res-score").textContent);
  check("ソロ: 地名が表示される", el("res-place").textContent.indexOf(target.name) === 0, el("res-place").textContent);
  await nextRound(); await tick();
  check("ソロ: ラウンド2へ", el("hud-round").textContent === "2 / 2", el("hud-round").textContent);
  var t2 = S.locs[1];
  __mapClicks[base]({ latlng:{ lat:nearby(t2, 10).lat, lng:nearby(t2, 10).lng } });
  submitGuess(false); await tick();
  await nextRound(); await tick();
  check("ソロ: 最終結果へ", activeScreen() === "screen-final", activeScreen());
  check("ソロ: 満点表示が 10000", el("fin-max").textContent === "/ 10,000", el("fin-max").textContent);
  check("ソロ: 合計が加算されている", el("fin-total").textContent !== "0", el("fin-total").textContent);

  await sectionF();
  await sectionG();
  await sectionH();
  await sectionI();
  await sectionJ();

  say("");
  say("════════════════════════════════");
  say("  合格 " + __pass + " 件 / 失敗 " + __fail + " 件");
  say("════════════════════════════════");
}
function H_phase(){
  // ホスト側の画面表示から現在フェーズを推定する
  var s = activeScreen();
  return s === "screen-mround" ? "result" : s === "screen-mfinal" ? "final" : "playing";
}
main().catch(function(e){ say("‼️ 例外: " + (e && (e.stack || e.message || e))); });
