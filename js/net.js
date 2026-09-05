/* ============================================================
 * P2P 通信層（PeerJS / WebRTC）
 *   ホストが「部屋」を作り、ゲストは部屋コードで直接つながる。
 *   星形トポロジ：ゲスト同士は直接通信せず、必ずホストを経由する。
 * ============================================================ */
const Net = (() => {
  const PREFIX = "ggsr-v1-";     // 公開ブローカー上での ID 衝突回避
  let peer = null;
  let isHost = false;
  let myId = "";
  let roomCode = "";
  let conns = new Map();         // ホスト用: peerId -> DataConnection
  let hostConn = null;           // ゲスト用: ホストへの接続
  let emit = () => {};

  function opts(){
    return {
      debug: 0,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" }
        ]
      }
    };
  }

  /* ---------- ホストとして部屋を作る ---------- */
  function host(onEvent){
    emit = onEvent;
    isHost = true;
    return new Promise((resolve, reject) => {
      let tries = 0;

      const attempt = () => {
        tries++;
        roomCode = makeRoomCode(5);
        const p = new Peer(PREFIX + roomCode, opts());

        p.on("open", id => {
          peer = p; myId = id;
          p.on("connection", conn => setupHostConn(conn));
          p.on("error", err => handleErr(err));
          p.on("disconnected", () => { try { p.reconnect(); } catch(e){} });
          resolve(roomCode);
        });

        p.on("error", err => {
          if (err.type === "unavailable-id" && tries < 6){
            try { p.destroy(); } catch(e){}
            attempt();                       // コードが使用中 → 別コードで再試行
          } else if (!peer){
            reject(err);
          } else {
            handleErr(err);
          }
        });
      };
      attempt();
    });
  }

  function setupHostConn(conn){
    conn.on("open", () => {
      if (conns.size >= 3){                  // ホスト + ゲスト3 = 最大4人
        try { conn.send({ t:"full" }); } catch(e){}
        setTimeout(() => conn.close(), 300);
        return;
      }
      conns.set(conn.peer, conn);
      emit({ type:"peer-join", id:conn.peer });
    });
    conn.on("data", msg => emit({ type:"data", from:conn.peer, msg }));
    conn.on("close", () => {
      conns.delete(conn.peer);
      emit({ type:"peer-leave", id:conn.peer });
    });
    conn.on("error", () => {
      conns.delete(conn.peer);
      emit({ type:"peer-leave", id:conn.peer });
    });
  }

  /* ---------- ゲストとして参加する ---------- */
  function join(code, onEvent){
    emit = onEvent;
    isHost = false;
    roomCode = String(code || "").trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const p = new Peer(null, opts());
      let settled = false;

      const fail = msg => { if (!settled){ settled = true; reject(new Error(msg)); } };

      p.on("open", id => {
        peer = p; myId = id;
        const conn = p.connect(PREFIX + roomCode, { reliable:true, serialization:"json" });

        const timeout = setTimeout(() => fail("部屋に接続できませんでした（コードを確認してください）"), 15000);

        conn.on("open", () => {
          clearTimeout(timeout);
          hostConn = conn;
          settled = true;
          resolve();
        });
        conn.on("data", msg => {
          if (msg && msg.t === "full"){ fail("この部屋は満員です（最大4人）"); return; }
          emit({ type:"data", from:"host", msg });
        });
        conn.on("close", () => emit({ type:"host-lost" }));
        conn.on("error", () => { clearTimeout(timeout); fail("接続エラーが発生しました"); });
      });

      p.on("error", err => {
        if (err.type === "peer-unavailable") fail("その部屋コードは見つかりませんでした");
        else if (!settled) fail("接続に失敗しました: " + err.type);
        else handleErr(err);
      });
    });
  }

  function handleErr(err){ emit({ type:"error", err }); }

  /* ---------- 送信 ---------- */
  function broadcast(msg){                   // ホスト → 全ゲスト
    conns.forEach(c => { if (c.open) { try { c.send(msg); } catch(e){} } });
  }
  function sendToHost(msg){                  // ゲスト → ホスト
    if (hostConn && hostConn.open) { try { hostConn.send(msg); } catch(e){} }
  }
  function sendTo(id, msg){                  // ホスト → 特定のゲスト
    const c = conns.get(id);
    if (c && c.open) { try { c.send(msg); } catch(e){} }
  }
  /** 自分の役割に応じて適切な相手へ送る */
  function send(msg){ isHost ? broadcast(msg) : sendToHost(msg); }

  function close(){
    try { conns.forEach(c => c.close()); } catch(e){}
    try { if (hostConn) hostConn.close(); } catch(e){}
    try { if (peer) peer.destroy(); } catch(e){}
    peer = null; hostConn = null; conns = new Map();
    isHost = false; myId = ""; roomCode = "";
  }

  return {
    host, join, send, broadcast, sendTo, close,
    get isHost(){ return isHost; },
    get myId(){ return myId; },
    get roomCode(){ return roomCode; },
    get peerCount(){ return conns.size; }
  };
})();
