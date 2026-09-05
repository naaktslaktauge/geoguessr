/* ============================================================
 * Leaflet 地図モジュール（API キー不要）
 * ============================================================ */
const TILE_URL  = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; OpenStreetMap &copy; CARTO';
const COLOR_GUESS  = "#3b82f6";
const COLOR_ACTUAL = "#6cc24a";

function makePin(color, label){
  return L.divIcon({
    className: "",
    html: '<div class="pin" style="background:' + color + '">' +
          (label ? '<span class="pin-label">' + label + '</span>' : '') + '</div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

/** 2 地点間の距離(km) — ハバーサイン */
function haversineKm(a, b){
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 経度を -180〜180 に正規化 */
function normLng(lng){ return ((lng + 540) % 360) - 180; }

/* ------------------------------------------------------------
 * クリックでピンを置く地図（推測用 / 出題者の地点選択用）
 * ------------------------------------------------------------ */
function createPickerMap(elId, onPick, color){
  let map = null, marker = null;

  function ensure(){
    if (map) return map;
    map = L.map(elId, { worldCopyJump:true, zoomControl:true, attributionControl:false })
           .setView([20, 0], 1);
    L.tileLayer(TILE_URL, { attribution:TILE_ATTR, maxZoom:18 }).addTo(map);
    map.on("click", e => {
      const p = { lat:e.latlng.lat, lng:normLng(e.latlng.lng) };
      if (marker) marker.setLatLng(e.latlng);
      else marker = L.marker(e.latlng, { icon:makePin(color || COLOR_GUESS) }).addTo(map);
      if (onPick) onPick(p);
    });
    return map;
  }

  return {
    init(){ ensure(); },
    reset(){
      ensure();
      if (marker){ map.removeLayer(marker); marker = null; }
      map.setView([20, 0], 1);
    },
    refresh(delay){ if (map) setTimeout(() => map.invalidateSize(), delay == null ? 190 : delay); }
  };
}

/* ------------------------------------------------------------
 * 結果表示マップ（ソロ = 1人 / 対戦 = 最大4人）
 *   entries: [{ name, lat, lng, color }]
 * ------------------------------------------------------------ */
function createResultMap(elId){
  let map = null, layer = null;

  function ensure(){
    if (!map){
      map = L.map(elId, { zoomControl:true, attributionControl:false }).setView([20, 0], 2);
      L.tileLayer(TILE_URL, { attribution:TILE_ATTR, maxZoom:18 }).addTo(map);
    }
    return map;
  }

  function show(actual, entries, bottomPad){
    ensure();
    if (layer) map.removeLayer(layer);
    layer = L.layerGroup().addTo(map);
    map.invalidateSize();

    L.marker([actual.lat, actual.lng], { icon:makePin(COLOR_ACTUAL) })
      .addTo(layer)
      .bindTooltip("正解", { permanent:true, direction:"top", offset:[0,-13], className:"tt-actual" });

    const pts = [[actual.lat, actual.lng]];
    (entries || []).forEach(e => {
      if (e.lat == null || e.lng == null) return;
      pts.push([e.lat, e.lng]);
      L.marker([e.lat, e.lng], { icon:makePin(e.color || COLOR_GUESS) })
        .addTo(layer)
        .bindTooltip(e.name, { permanent:true, direction:"top", offset:[0,-13] });
      L.polyline([[actual.lat, actual.lng], [e.lat, e.lng]],
                 { color:e.color || COLOR_GUESS, weight:2, dashArray:"7 7", opacity:.85 }).addTo(layer);
    });

    const pad = bottomPad == null ? 230 : bottomPad;
    if (pts.length > 1){
      map.fitBounds(L.latLngBounds(pts),
        { paddingTopLeft:[70, 70], paddingBottomRight:[70, pad], maxZoom:11 });
    } else {
      map.setView([actual.lat, actual.lng], 6);
      map.panBy([0, pad / 2.5], { animate:false });
    }
    setTimeout(() => map.invalidateSize(), 60);
  }

  return { show };
}

/* ---------- ソロ用のシングルトン ---------- */
const GuessMap = (() => {
  let inst = null;
  return {
    init(elId, cb){ if (!inst) inst = createPickerMap(elId, cb, COLOR_GUESS); inst.init(); },
    reset(){ if (inst) inst.reset(); },
    refresh(){ if (inst) inst.refresh(); }
  };
})();

const ResultMap = (() => {
  let inst = null;
  return {
    show(elId, actual, guess){
      if (!inst) inst = createResultMap(elId);
      inst.show(actual, guess ? [{ name:"あなた", lat:guess.lat, lng:guess.lng, color:COLOR_GUESS }] : []);
    }
  };
})();
