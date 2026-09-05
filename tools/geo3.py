import sys, json, time, subprocess, urllib.parse, threading
from queue import Queue
sys.path.insert(0, sys.argv[1])
from part1 import DATA as D1
from part2 import DATA as D2
from part3 import DATA as D3
from part4 import DATA as D4
ALL = D1 + D2 + D3 + D4
UA = "GeoGuessrClone/1.0 (personal hobby project; one-off dataset build)"

def curl(url):
    r = subprocess.run(["curl","-sS","-m","30","-A",UA,url],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        raise RuntimeError(r.stderr[:120] or "empty")
    return json.loads(r.stdout)

def photon(q):
    f = (curl("https://photon.komoot.io/api/?limit=1&q=" + urllib.parse.quote(q)).get("features") or [])
    if not f: return None
    c = f[0]["geometry"]["coordinates"]; p = f[0].get("properties", {})
    return {"lat":c[1], "lng":c[0], "cc":(p.get("countrycode") or "").lower(),
            "label":", ".join(x for x in [p.get("name"), p.get("city"), p.get("country")] if x)}

def nominatim(q, cc):
    r = curl("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1"
             "&countrycodes=" + cc + "&q=" + urllib.parse.quote(q))
    if not r: return None
    a = r[0].get("address") or {}
    return {"lat":float(r[0]["lat"]), "lng":float(r[0]["lon"]),
            "cc":(a.get("country_code") or "").lower(), "label":r[0].get("display_name","")[:70]}

lock = threading.Lock(); results = {}; problems = []; done = [0]
def worker(qu):
    while True:
        item = qu.get()
        if item is None: break
        idx, (name, q, cc, country, region, diff) = item
        got = None
        try: got = photon(q)
        except Exception: pass
        if (not got) or got["cc"] != cc:
            time.sleep(1.0)
            try:
                alt = nominatim(q, cc)
                if alt: got = alt
            except Exception: pass
        with lock:
            done[0] += 1
            if got and got["cc"] == cc:
                results[idx] = {"name":name,"country":country,"region":region,"diff":diff,
                                "raw_lat":round(got["lat"],6),"raw_lng":round(got["lng"],6),
                                "label":got["label"]}
            else:
                problems.append(f'{name} ({q}) 期待={cc} 実際={got["cc"] if got else "取得失敗"}')
            if done[0] % 40 == 0: print(f"  {done[0]}/{len(ALL)}", flush=True)
        time.sleep(0.9)

qu = Queue()
for i, row in enumerate(ALL): qu.put((i, row))
ths = []
for _ in range(3):
    qu.put(None)
    t = threading.Thread(target=worker, args=(qu,)); t.start(); ths.append(t)
for t in ths: t.join()

json.dump([results[i] for i in sorted(results)],
          open(sys.argv[1] + "/geo.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\n成功 {len(results)}/{len(ALL)} 件 / 要確認 {len(problems)} 件")
for p in problems: print("  ⚠️ " + p)
