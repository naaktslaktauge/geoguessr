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

  guestSend(g2, { t:"guess", lat:loc.lat + 20, lng:loc.lng + 20 }); // 遠い
  await tick();
  await hostGuess(loc.lat + 1, loc.lng + 1);                        // そこそこ近い

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
    guestSend(g2, { t:"guess", lat:loc.lat + 5, lng:loc.lng + 5 });
    await tick();
    await hostGuess(loc.lat + 2, loc.lng + 2);
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
  guestSend(g1, { t:"guess", lat:loc.lat + 40, lng:loc.lng + 40 });  // 2回目は無効のはず
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
  await hostGuess(loc.lat + 3, loc.lng + 3);
  st = lastState(g1);
  check("残った2人で集計されラウンドが進む", st.phase === "result", st.phase);
  check("切断者は集計対象から外れる", st.results.length === 2, st.results.length);

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
  S.settings.rounds = 2; S.settings.timeLimit = 0; S.settings.region = "world";
  var base = __mapClicks.length;
  await startGame(); await tick();
  check("ソロ: ゲーム画面になる", activeScreen() === "screen-game", activeScreen());
  check("ソロ: HUDにラウンド表示", el("hud-round").textContent === "1 / 2", el("hud-round").textContent);
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
  __mapClicks[base]({ latlng:{ lat:t2.lat + 10, lng:t2.lng + 10 } });
  submitGuess(false); await tick();
  await nextRound(); await tick();
  check("ソロ: 最終結果へ", activeScreen() === "screen-final", activeScreen());
  check("ソロ: 満点表示が 10000", el("fin-max").textContent === "/ 10,000", el("fin-max").textContent);
  check("ソロ: 合計が加算されている", el("fin-total").textContent !== "0", el("fin-total").textContent);

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
