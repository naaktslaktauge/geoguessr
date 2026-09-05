/* ============================================================
 * 共通ユーティリティ（ソロ / オンライン対戦の両方で使用）
 * ============================================================ */
const $ = id => document.getElementById(id);

/* エリアごとの「地図の広さ(km)」— スコアのスケール */
const MAP_SIZE = {
  world:14916.862, japan:2200, asia:9000, europe:5000,
  namerica:7000, samerica:6000, africa:7000, oceania:5000
};

/* プレイヤーの色（最大4人） */
const PLAYER_COLORS = ["#3b82f6", "#ef4444", "#f59e0b", "#a855f7"];

/* 退出ボタンを出す画面（メニュー・設定・接続画面では出さない） */
const IN_GAME_SCREENS = [
  "screen-game", "screen-round", "screen-final",
  "screen-lobby", "screen-mgame", "screen-mround", "screen-mfinal"
];

function showScreen(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = $(id);
  if (el) el.classList.add("active");
  const exit = $("btn-exit");
  if (exit) exit.hidden = IN_GAME_SCREENS.indexOf(id) < 0;
}

/* ---------- 確認ダイアログ ---------- */
let _confirmCb = null;

function showConfirm(title, text, okLabel, onOk){
  $("modal-title").textContent = title;
  $("modal-text").textContent  = text;
  $("modal-ok").textContent    = okLabel || "OK";
  _confirmCb = onOk;
  $("modal").hidden = false;
}
function closeConfirm(){ $("modal").hidden = true; _confirmCb = null; }
function modalOpen(){ const m = $("modal"); return !!m && !m.hidden; }

function initModal(){
  const accept = () => { const cb = _confirmCb; closeConfirm(); if (cb) cb(); };
  $("modal-cancel").addEventListener("click", closeConfirm);
  $("modal-ok").addEventListener("click", accept);
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeConfirm(); });
  document.addEventListener("keydown", e => {
    if (!modalOpen()) return;
    if (e.key === "Escape"){ e.preventDefault(); closeConfirm(); }
    if (e.key === "Enter"){ e.preventDefault(); accept(); }
  });
}

/* ---------- 推測マップの表示サイズ ---------- */
const MAP_SIZES = [
  { w:360, h:260 }, { w:520, h:380 }, { w:680, h:480 }, { w:880, h:640 }
];
const KEY_MAPSIZE = "gg_map_size";
let _mapStep = 2;

function applyMapSize(step){
  // 数値でない値が来ても壊れないようにしてから範囲内に収める
  const n = Number(step);
  _mapStep = Math.max(0, Math.min(MAP_SIZES.length - 1,
                                  Number.isFinite(n) ? Math.round(n) : _mapStep));
  try { localStorage.setItem(KEY_MAPSIZE, String(_mapStep)); } catch(e){}
  const s = MAP_SIZES[_mapStep];
  document.querySelectorAll(".map-panel").forEach(p => {
    p.style.setProperty("--map-w", s.w + "px");
    p.style.setProperty("--map-h", s.h + "px");
  });
  document.querySelectorAll(".map-size").forEach(b => {
    const dir = Number(b.dataset.dir);
    b.disabled = (dir < 0 && _mapStep === 0) || (dir > 0 && _mapStep === MAP_SIZES.length - 1);
  });
  return _mapStep;
}

function initMapSizeControls(onResize){
  let saved = 2;
  try {
    const v = parseInt(localStorage.getItem(KEY_MAPSIZE), 10);
    if (!isNaN(v)) saved = v;
  } catch(e){}
  applyMapSize(saved);
  document.querySelectorAll(".map-size").forEach(b => {
    b.addEventListener("click", e => {
      e.stopPropagation();
      applyMapSize(_mapStep + Number(b.dataset.dir));
      if (onResize) onResize();
    });
  });
}

/* スコア計算（GeoGuessr 準拠の指数減衰） */
function calcScore(km, region){
  const size = MAP_SIZE[region] || MAP_SIZE.world;
  return Math.max(0, Math.round(5000 * Math.exp(-10 * km / size)));
}

function fmtDist(km){
  if (km == null) return "—";
  if (km < 1)   return Math.round(km * 1000) + " m";
  if (km < 100) return km.toFixed(1) + " km";
  return Math.round(km).toLocaleString() + " km";
}

function fmtTime(sec){
  sec = Math.max(0, sec);
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

/**
 * 受信した値を座標として厳密に解釈する。不正なら null を返す。
 * Number(null) が 0 になる等の暗黙変換を避けるため、数値か数字文字列のみ受け付ける。
 * （これを怠ると壊れたメッセージが (0,0) の回答として通ってしまう）
 */
function parseLatLng(rawLat, rawLng){
  const num = v => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    return NaN;                       // null / undefined / 真偽値 / オブジェクトは拒否
  };
  const lat = num(rawLat), lng = num(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/* 部屋コード生成（紛らわしい文字を除外） */
function makeRoomCode(len){
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < (len || 5); i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

/**
 * 再参加用トークン。部屋ごとに端末内へ保存し、席の持ち主であることの証明に使う。
 * PeerJS の ID は再接続のたびに変わるため、これが無いと復帰時に別人扱いになる。
 */
function rejoinToken(roomCode){
  const key = "gg_rejoin_" + roomCode;
  let t = null;
  try { t = localStorage.getItem(key); } catch(e){}
  if (!t){
    t = makeRoomCode(16);
    try { localStorage.setItem(key, t); } catch(e){}
  }
  return t;
}

/* ---------- 対戦ロジック（純粋関数・テスト対象） ---------- */

/** そのラウンドの出題者を返す（毎ラウンド交代） */
function quizmasterFor(round, players){
  if (!players.length) return null;
  return players[(round - 1) % players.length].id;
}

/** 出題モードでの総ラウンド数 = 人数 × 周回数 */
function totalRounds(mode, players, settings){
  return mode === "quiz" ? players.length * settings.laps : settings.rounds;
}

/** 1ラウンド分の採点。guesses = {playerId:{lat,lng}} */
function scoreRound(location, guesses, players, region, quizmasterId){
  return players.map(p => {
    if (p.id === quizmasterId) return { id:p.id, name:p.name, quizmaster:true, km:null, score:0, guess:null };
    const g = guesses[p.id];
    if (!g) return { id:p.id, name:p.name, quizmaster:false, km:null, score:0, guess:null };
    const km = haversineKm(g, location);
    return { id:p.id, name:p.name, quizmaster:false, km, score:calcScore(km, region), guess:g };
  });
}

/** 得点の高い順に順位付け（同点は同順位） */
function rankPlayers(players){
  const sorted = players.slice().sort((a, b) => b.score - a.score);
  let rank = 0, prev = null;
  return sorted.map((p, i) => {
    if (p.score !== prev){ rank = i + 1; prev = p.score; }
    return Object.assign({}, p, { rank });
  });
}
