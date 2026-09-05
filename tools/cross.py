"""Photon 由来の最終座標を、独立した Nominatim の結果と突き合わせる。
   両者が大きく食い違う地点は、どちらかが誤った都市を指している可能性が高い。"""
import sys, json, math, time, threading, subprocess, urllib.parse
from queue import Queue
SP = sys.argv[1]; sys.path.insert(0, SP)
from part1 import DATA as D1
from part2 import DATA as D2
from part3 import DATA as D3
from part4 import DATA as D4
META = {d[0]: (d[1], d[2]) for d in (D1+D2+D3+D4)}
UA = "GeoGuessrClone/1.0 (personal hobby project)"
pts = json.load(open(SP + "/geo_snapped.json", encoding="utf-8"))

def hav(a1,o1,a2,o2):
    R=6371.0; tr=math.radians
    s=math.sin(tr(a2-a1)/2)**2+math.cos(tr(a1))*math.cos(tr(a2))*math.sin(tr(o2-o1)/2)**2
    return 2*R*math.asin(min(1,math.sqrt(s)))

lock=threading.Lock(); res=[]; done=[0]
def worker(qu):
    while True:
        p = qu.get()
        if p is None: break
        key = p["name"].replace("周辺","").replace("／ワディ・ムーサ","")
        q, cc = META.get(key, (None, None))
        d = None; label=""
        if q:
            try:
                r = subprocess.run(["curl","-sS","-m","30","-A",UA,
                    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1"
                    f"&countrycodes={cc}&q=" + urllib.parse.quote(q)],
                    capture_output=True, text=True)
                j = json.loads(r.stdout)
                if j:
                    d = hav(p["lat"], p["lng"], float(j[0]["lat"]), float(j[0]["lon"]))
                    label = j[0].get("display_name","")[:70]
            except Exception: pass
        with lock:
            done[0]+=1
            res.append({"name":p["name"],"query":q,"km":d,"nominatim":label,
                        "lat":p["lat"],"lng":p["lng"]})
            if done[0]%60==0: print(f"  {done[0]}/{len(pts)}", flush=True)
        time.sleep(1.1)

qu=Queue()
for p in pts: qu.put(p)
ths=[]
for _ in range(2):
    qu.put(None); t=threading.Thread(target=worker,args=(qu,)); t.start(); ths.append(t)
for t in ths: t.join()

json.dump(res, open(SP+"/cross.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
far  = sorted([r for r in res if r["km"] is not None and r["km"] > 25], key=lambda x:-x["km"])
none = [r for r in res if r["km"] is None]
print(f"\n2つの結果が25km以内で一致: {len(res)-len(far)-len(none)}/{len(res)} 件")
print(f"照合できず: {len(none)} 件")
print(f"25km以上ずれている（要修正）: {len(far)} 件")
for r in far:
    print(f'  ・{r["name"]:22s} {r["km"]:7.0f}km  検索="{r["query"]}"')
    print(f'      現在={r["lat"]:.4f},{r["lng"]:.4f}  Nominatim="{r["nominatim"]}"')
