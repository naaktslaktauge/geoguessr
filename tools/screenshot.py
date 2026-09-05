import sys, os, re, subprocess, shutil, glob
GAME = "/Users/tanakakimihiro/Library/CloudStorage/GoogleDrive-naaktslak.taugetauge@gmail.com/マイドライブ/99_その他/GeoGuessr"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = sys.argv[1]
W, H = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (390, 844)
PORT = "8801"

SCENES = {
"menu": "showScreen('screen-menu');",
"home": "showScreen('screen-home');",
"solo": """
  showScreen('screen-game');
  fakePano('pano');
  document.getElementById('pano-loading').hidden = true;
  document.getElementById('hud-round').textContent = '3 / 5';
  document.getElementById('hud-score').textContent = '12,480';
  document.getElementById('hud-timer-box').hidden = false;
  document.getElementById('hud-timer').textContent = '4:12';
  document.getElementById('btn-reset-view').hidden = false;
  GuessMap.init('guess-map', function(){});
  GuessMap.refresh();
""",
"multi": """
  showScreen('screen-mgame');
  fakePano('m-pano');
  document.getElementById('m-pano-loading').hidden = true;
  document.getElementById('m-round').textContent = '3 / 5';
  document.getElementById('m-mode').textContent = '全員回答';
  document.getElementById('m-timer-box').hidden = false;
  document.getElementById('m-timer').textContent = '1:48';
  document.getElementById('btn-mreset').hidden = false;
  var b = document.getElementById('btn-mskip');
  b.hidden = false; b.textContent = 'スキップ 1/2';
  var box = document.getElementById('m-players'), cols=['#3b82f6','#ef4444','#f59e0b','#a855f7'];
  ['ホスト','たろう','はなこ','じろう'].forEach(function(n,i){
    var d=document.createElement('div'); d.className='mp-row';
    d.innerHTML='<span class="dot" style="background:'+cols[i]+'"></span>'+
      '<span class="mp-name">'+n+(i?'':' (あなた)')+'</span>'+
      '<span class="mp-mark">'+(i%2?'✓':'')+'</span><span class="mp-score">'+(9000-i*1500).toLocaleString()+'</span>';
    box.appendChild(d);
  });
  window.__mm = createPickerMap('m-guess-map', function(){}, '#3b82f6'); window.__mm.init();
""",
"pick": """
  showScreen('screen-mgame');
  document.getElementById('m-round').textContent = '2 / 3';
  document.getElementById('pick-overlay').hidden = false;
  document.getElementById('pick-picker').hidden = false;
  document.getElementById('map-panel-m').hidden = true;
  window.__pm = createPickerMap('pick-map', function(){}, '#f59e0b'); window.__pm.init();
  setTimeout(function(){ window.__pm.refresh(10); }, 200);
  document.getElementById('pick-card').hidden = false;
  fakePano('pick-pano');
  document.getElementById('pick-coord').textContent = '48.8698, 2.3078';
  document.getElementById('pick-status').textContent = '✅ この地点で出題できます';
  document.getElementById('btn-pick-ok').disabled = false;
""",
"result": """
  showScreen('screen-mround');
  createResultMap('m-result-map').show({lat:35.68,lng:139.76},
    [{name:'たろう',lat:34.7,lng:135.5,color:'#ef4444'},
     {name:'はなこ',lat:37.9,lng:139.1,color:'#f59e0b'}], 260);
  document.getElementById('mres-place').textContent = '渋谷スクランブル交差点（日本）';
  var rows = document.getElementById('mres-rows'), cols=['#3b82f6','#ef4444','#f59e0b'];
  [['ホスト','12 km','+4,802'],['たろう','405 km','+3,120'],['はなこ','260 km','+3,540']].forEach(function(r,i){
    var d=document.createElement('div'); d.className='mres-row';
    d.innerHTML='<span class="dot" style="background:'+cols[i]+'"></span><span class="mr-name">'+r[0]+
      '</span><span class="mr-dist">'+r[1]+'</span><span class="mr-score">'+r[2]+'</span>';
    rows.appendChild(d);
  });
""",
"lobby": """
  showScreen('screen-lobby');
  document.getElementById('lobby-code').textContent = 'K7QM3';
  document.getElementById('lobby-host-ui').hidden = false;
  document.getElementById('lobby-count').textContent = '3 / 4 人';
  document.getElementById('btn-lobby-start').disabled = false;
  var l = document.getElementById('lobby-players'), cols=['#3b82f6','#ef4444','#f59e0b'];
  ['ホスト','たろう','はなこ'].forEach(function(n,i){
    var li=document.createElement('li');
    li.innerHTML='<span class="dot" style="background:'+cols[i]+'"></span><span class="lp-name">'+n+
      '</span><span class="lp-tag">'+(i?'':'ホスト (あなた)')+'</span>';
    l.appendChild(li);
  });
""",
}

SCENES["solo_map"] = SCENES["solo"] + "\n document.getElementById('map-panel').classList.add('pinned'); GuessMap.refresh(20);"
SCENES["multi_map"] = SCENES["multi"] + "\n document.getElementById('map-panel-m').classList.add('pinned'); setTimeout(function(){window.__mm.refresh(10);},150);"

HOOK = """
<script>
function fakePano(id){
  var e=document.getElementById(id);
  e.style.background='linear-gradient(170deg,#7fa8d0 0%%,#a9c4dd 42%%,#8d8a7e 43%%,#5d5a51 100%%)';
}
window.addEventListener('load', function(){ setTimeout(function(){ try{ %s }catch(err){ document.title='ERR '+err.message; } }, 250); });
</script>
"""

WRAP = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#000}
iframe{width:%dpx;height:%dpx;border:0;display:block}
</style></head><body>
<iframe id="f" src="/index.html"></iframe>
<script>
var f=document.getElementById('f');
f.addEventListener('load', function(){
  setTimeout(function(){
    try { f.contentWindow.eval(%s); } catch(e){ document.title='ERR '+e.message; }
  }, 400);
});
</script></body></html>"""

FAKE = """
function fakePano(id){
  var e=document.getElementById(id);
  e.style.background='linear-gradient(170deg,#7fa8d0 0%,#a9c4dd 42%,#8d8a7e 43%,#5d5a51 100%)';
}
"""

srv = subprocess.Popen(["python3","-m","http.server",PORT], cwd=GAME,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
import time, json
time.sleep(1.5)
os.makedirs(OUT, exist_ok=True)
try:
    for name, js in SCENES.items():
        tmp = os.path.join(GAME, f"_prev_{name}.html")
        open(tmp,"w",encoding="utf-8").write(WRAP % (W, H, json.dumps(FAKE + js)))
        shot = f"{OUT}/{name}_raw.png"
        subprocess.run([CHROME,"--headless","--disable-gpu","--no-sandbox","--hide-scrollbars",
                        f"--window-size={max(W+40,520)},{max(H+40,860)}",
                        "--virtual-time-budget=7000", f"--screenshot={shot}",
                        f"http://localhost:{PORT}/_prev_{name}.html"], capture_output=True)
        os.remove(tmp)
        from PIL import Image
        im = Image.open(shot).convert("RGB").crop((0,0,W,H))
        im.save(f"{OUT}/{name}.png"); os.remove(shot)
        print(f"  撮影: {name}.png  ({im.size[0]}x{im.size[1]})", flush=True)
finally:
    srv.terminate()
    for f2 in glob.glob(os.path.join(GAME,"_prev_*.html")): os.remove(f2)
