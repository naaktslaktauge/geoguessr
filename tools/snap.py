"""
名所の座標そのままだと建物の中や歩行者エリアに落ちてストリートビューで
動けないことが多い。OSM の道路データを使い、最寄りの車道上の点へ吸着させる。
Overpass への負荷を抑えるため、複数地点を1クエリにまとめて問い合わせる。
"""
import sys, json, math, time, subprocess

SP = sys.argv[1]
pts = json.load(open(SP + "/geo.json", encoding="utf-8"))
UA = "GeoGuessrClone/1.0 (personal hobby project; one-off dataset build)"
ENDPOINT = "https://overpass-api.de/api/interpreter"
ROADS = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service"
RADIUS = 220          # この範囲で道路を探す
BATCH  = 8

def hav(a1, o1, a2, o2):
    R = 6371000.0; tr = math.radians
    dla, dlo = tr(a2 - a1), tr(o2 - o1)
    s = math.sin(dla/2)**2 + math.cos(tr(a1))*math.cos(tr(a2))*math.sin(dlo/2)**2
    return 2 * R * math.asin(min(1, math.sqrt(s)))

def overpass(query):
    r = subprocess.run(["curl","-sS","-m","180","-A",UA,"--data-urlencode","data@-",ENDPOINT],
                       input=query, capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        raise RuntimeError((r.stderr or "empty")[:150])
    return json.loads(r.stdout)

snapped = moved = kept = 0
for b in range(0, len(pts), BATCH):
    chunk = pts[b:b+BATCH]
    q = "[out:json][timeout:120];(\n"
    for p in chunk:
        q += f'way(around:{RADIUS},{p["raw_lat"]},{p["raw_lng"]})["highway"~"^({ROADS})$"];\n'
    q += ");out geom;"
    ways = []
    for attempt in range(3):
        try:
            ways = overpass(q).get("elements", []); break
        except Exception as e:
            time.sleep(8)
    for p in chunk:
        best, bd = None, 1e18
        for w in ways:
            for g in w.get("geometry", []):
                d = hav(p["raw_lat"], p["raw_lng"], g["lat"], g["lon"])
                if d < bd: bd, best = d, g
        if best and bd <= RADIUS:
            p["lat"], p["lng"] = round(best["lat"], 6), round(best["lon"], 6)
            p["snap_m"] = round(bd)
            snapped += 1
            if bd > 5: moved += 1
        else:
            p["lat"], p["lng"] = p["raw_lat"], p["raw_lng"]
            p["snap_m"] = None
            kept += 1
    print(f"  {min(b+BATCH,len(pts))}/{len(pts)} 件処理", flush=True)
    time.sleep(2.0)

json.dump(pts, open(SP + "/geo_snapped.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
ds = [p["snap_m"] for p in pts if p.get("snap_m") is not None]
ds.sort()
print(f"\n道路に吸着: {snapped}件 / 道路が見つからず据え置き: {kept}件")
if ds:
    print(f"移動距離  中央値 {ds[len(ds)//2]}m  最大 {ds[-1]}m  平均 {sum(ds)//len(ds)}m")
