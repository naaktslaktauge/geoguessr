/* ===== ブラウザ環境のスタブ（osascript 上でゲームロジックを走らせる） ===== */
var __log = [];
function say(s){ console.log(s); }
var __pass = 0, __fail = 0;
function check(label, cond, extra){
  if (cond){ __pass++; say("  ✅ " + label); }
  else { __fail++; say("  ❌ " + label + (extra ? "  → " + extra : "")); }
}

/* --- タイマー（手動実行） --- */
var __timers = [], __tid = 0;
var setTimeout  = function(fn, ms){ __timers.push({ id:++__tid, fn:fn }); return __tid; };
var setInterval = function(fn, ms){ return ++__tid; };          // 定期実行は使わない
var clearTimeout  = function(id){ __timers = __timers.filter(function(t){ return t.id !== id; }); };
var clearInterval = clearTimeout;
function runTimers(){ var q = __timers; __timers = []; q.forEach(function(t){ t.fn(); }); }
async function tick(n){ for (var i = 0; i < (n || 12); i++) await Promise.resolve(); }

/* --- DOM --- */
function FakeEl(id){
  this.id = id; this._cls = {}; this._ev = {};
  this.style = {}; this.dataset = {};
  this.textContent = ""; this.innerHTML = ""; this.value = "";
  this.hidden = false; this.disabled = false; this.href = "";
  var self = this;
  this.classList = {
    add:    function(c){ self._cls[c] = 1; },
    remove: function(c){ delete self._cls[c]; },
    toggle: function(c, on){ if (on) self._cls[c] = 1; else delete self._cls[c]; },
    contains: function(c){ return !!self._cls[c]; }
  };
}
FakeEl.prototype.addEventListener = function(e, cb){ (this._ev[e] = this._ev[e] || []).push(cb); };
FakeEl.prototype.appendChild = function(){};
FakeEl.prototype.querySelectorAll = function(){ return []; };
FakeEl.prototype.closest = function(){ return this; };
FakeEl.prototype.fire = function(e, arg){ (this._ev[e] || []).forEach(function(f){ f(arg || {}); }); };

var __els = {};
function el(id){ if (!__els[id]) __els[id] = new FakeEl(id); return __els[id]; }
function clickEl(id){ el(id).fire("click", { stopPropagation:function(){}, target:el(id) }); }
function activeScreen(){
  for (var k in __els) if (k.indexOf("screen-") === 0 && __els[k]._cls.active) return k;
  return null;
}

/* --- 設定セグメント（ロビー用） --- */
var __segs = {};
function makeSeg(name){
  var s = new FakeEl("seg-" + name);
  s.dataset = { setting:name };
  s.querySelectorAll = function(){ return []; };
  __segs[name] = s;
  return s;
}
["mode","rounds","laps","timeLimit","region","difficulty"].forEach(makeSeg);
function setSeg(name, value){
  var btn = { dataset:{ value:value }, classList:{ add:function(){}, remove:function(){} } };
  __segs[name].fire("click", { target:{ closest:function(){ return btn; } } });
}

var document = {
  getElementById: el,
  createElement: function(){ return new FakeEl("tmp"); },
  addEventListener: function(){},
  querySelectorAll: function(sel){
    if (sel === ".screen"){
      return Object.keys(__els).filter(function(k){ return k.indexOf("screen-") === 0; })
                   .map(function(k){ return __els[k]; });
    }
    if (sel === "#screen-lobby .seg") return Object.keys(__segs).map(function(k){ return __segs[k]; });
    return [];
  }
};
var window = { };
var navigator = {};
var localStorage = { getItem:function(){ return null; }, setItem:function(){}, removeItem:function(){} };
function alert(m){ say("    [alert] " + m); }
function confirm(){ return true; }
if (typeof console === "undefined") var console = { log:function(){}, warn:function(){} };
console.warn = console.warn || console.log;

/* --- Leaflet --- */
var __mapClicks = [];
function LMap(){
  return {
    setView: function(){ return this; },
    on: function(e, cb){ if (e === "click") __mapClicks.push(cb); },
    removeLayer: function(){}, invalidateSize: function(){},
    fitBounds: function(){}, panBy: function(){}
  };
}
var __chain = { addTo:function(){ return __chain; }, bindTooltip:function(){ return __chain; },
                setLatLng:function(){}, on:function(){ return __chain; } };
var L = {
  map: function(){ return LMap(); },
  tileLayer: function(){ return __chain; },
  marker: function(){ return __chain; },
  polyline: function(){ return __chain; },
  layerGroup: function(){ return __chain; },
  divIcon: function(){ return {}; },
  latLngBounds: function(){ return {}; }
};

/* --- PeerJS --- */
var __peers = [];
function Peer(id){
  var self = this;
  this.id = id || "guest-peer";
  this._h = {};
  this.on = function(e, cb){ (self._h[e] = self._h[e] || []).push(cb); };
  this.fire = function(e, a){ (self._h[e] || []).forEach(function(f){ f(a); }); };
  this.destroy = function(){}; this.reconnect = function(){};
  this.connect = function(){ return new FakeConn("host"); };
  __peers.push(this);
  setTimeout(function(){ self.fire("open", self.id); });
}
function FakeConn(peerId){
  var self = this;
  this.peer = peerId; this.open = true; this._h = {}; this.sent = [];
  this.on = function(e, cb){ (self._h[e] = self._h[e] || []).push(cb); };
  this.fire = function(e, a){ (self._h[e] || []).forEach(function(f){ f(a); }); };
  this.send = function(m){ self.sent.push(m); };
  this.close = function(){ self.open = false; self.fire("close"); };
}
