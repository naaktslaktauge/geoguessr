/* ============================================================
 * ストリートビュー表示
 *   モード A : Google Maps JavaScript API（APIキーあり）
 *              → 移動/パン/ズームの制限、地名ラベル非表示、地点の存在判定が可能
 *   モード B : キー不要の埋め込み iframe（APIキーなし）
 *
 *   load() は { api:boolean, location:{lat,lng} } を返す。
 *   API モードでは実際のパノラマ位置にスナップした座標が入る。
 * ============================================================ */
const Pano = (() => {
  let defaultEl = null;
  let apiKey = "";
  let apiLoaded = false;
  let apiFailed = false;
  let panorama = null;          // 本編用のパノラマ
  let svService = null;
  let startPov = null;
  let startPanoId = null;

  function init(el){ defaultEl = el; }
  function setApiKey(k){
    const v = (k || "").trim();
    if (v !== apiKey) apiFailed = false;
    apiKey = v;
  }
  function usingApi(){ return !!apiKey && !apiFailed; }

  function loadApi(){
    return new Promise((resolve, reject) => {
      if (apiLoaded && window.google && google.maps) return resolve();
      window.gm_authFailure = () => { apiFailed = true; };   // キー不正時に Google が呼ぶ
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" +
              encodeURIComponent(apiKey) + "&v=weekly&language=ja";
      s.async = true;
      s.onload  = () => { apiLoaded = true; resolve(); };
      s.onerror = () => { apiFailed = true; reject(new Error("Maps API の読み込みに失敗しました")); };
      document.head.appendChild(s);
    });
  }

  function findPano(loc, radius){
    return new Promise(resolve => {
      svService.getPanorama(
        { location:{ lat:loc.lat, lng:loc.lng }, radius, source:"outdoor" },
        (data, status) => resolve(status === "OK" ? data : null)
      );
    });
  }

  /**
   * @param loc    {lat,lng}
   * @param rules  {move,pan,zoom}
   * @param opts   {el, preview, radii}
   */
  async function load(loc, rules, opts){
    opts = opts || {};
    rules = rules || { move:true, pan:true, zoom:true };
    const el = opts.el || defaultEl;
    el.innerHTML = "";
    if (!opts.preview) panorama = null;

    if (usingApi()){
      try{
        await loadApi();
        await new Promise(r => setTimeout(r, 250));   // gm_authFailure の発火を待つ
        if (apiFailed) throw new Error("APIキーの認証に失敗しました");
        if (!svService) svService = new google.maps.StreetViewService();

        let data = null;
        const radii = opts.radii || [120, 800, 5000, 25000];
        for (const r of radii){
          data = await findPano(loc, r);
          if (data) break;
        }
        if (!data) return { api:true, location:null, notFound:true };

        const panoId = data.location.pano;
        const pov = { heading: Math.random() * 360, pitch: 0 };
        const snapped = {
          lat: data.location.latLng.lat(),
          lng: data.location.latLng.lng()
        };

        const pv = new google.maps.StreetViewPanorama(el, {
          pano: panoId,
          pov, zoom: 0,
          addressControl: false,
          showRoadLabels: false,
          linksControl: !!rules.move,
          clickToGo:    !!rules.move,
          scrollwheel:  !!rules.zoom,
          zoomControl:  !!rules.zoom,
          panControl:   false,
          disableDoubleClickZoom: !rules.zoom,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
          enableCloseButton: false
        });

        if (!rules.pan){
          pv.addListener("pov_changed", () => {
            const p = pv.getPov();
            if (Math.abs(p.heading - pov.heading) > 0.5 || Math.abs(p.pitch) > 0.5)
              pv.setPov({ heading:pov.heading, pitch:0 });
          });
        }
        if (!rules.zoom){
          pv.addListener("zoom_changed", () => { if (pv.getZoom() !== 0) pv.setZoom(0); });
        }

        if (!opts.preview){ panorama = pv; startPanoId = panoId; startPov = pov; }
        return { api:true, location:snapped };
      }catch(err){
        console.warn("[Pano] API モード失敗 → 埋め込みモードへ:", err.message);
        apiFailed = true;
      }
    }

    /* ---------- 埋め込みモード（キー不要） ---------- */
    const heading = Math.floor(Math.random() * 360);
    const iframe = document.createElement("iframe");
    iframe.src = "https://www.google.com/maps?q=&layer=c&cbll=" +
                 loc.lat + "," + loc.lng + "&cbp=11," + heading + ",0,0,0&output=svembed";
    iframe.allow = "accelerometer; gyroscope";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    el.appendChild(iframe);
    return { api:false, location:{ lat:loc.lat, lng:loc.lng } };
  }

  function resetView(){
    if (panorama && startPanoId){
      panorama.setPano(startPanoId);
      panorama.setPov(startPov);
      panorama.setZoom(0);
    }
  }

  function clear(el){
    const target = el || defaultEl;
    if (target) target.innerHTML = "";
    if (!el) panorama = null;
  }

  return { init, setApiKey, usingApi, load, resetView, clear };
})();
