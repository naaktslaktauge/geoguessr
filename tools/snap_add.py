import sys, json, math, time, subprocess
SP = sys.argv[1]
pts = json.load(open(SP + "/added.json", encoding="utf-8"))
UA = "GeoGuessrClone/1.0 (personal hobby project; one-off dataset build)"
ROADS = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service"
RADIUS, BATCH = 250, 12

def hav(a1,o1,a2,o2):
    R=6371000.0; tr=math.radians
    s=math.sin(tr(a2-a1)/2)**2+math.cos(tr(a1))*math.cos(tr(a2))*math.sin(tr(o2-o1)/2)**2
    return 2*R*math.asin(min(1,math.sqrt(s)))

snapped = kept = 0
for b in range(0, len(pts), BATCH):
    chunk = pts[b:b+BATCH]
    q = "[out:json][timeout:160];(\n"
    for p in chunk:
        q += f'way(around:{RADIUS},{p["lat"]},{p["lng"]})["highway"~"^({ROADS})$"];\n'
    q += ");out geom;"
    ways = []
    for attempt in range(3):
        try:
            r = subprocess.run(["curl","-sS","-m","200","-A",UA,"--data-urlencode","data@-",
                                "https://overpass-api.de/api/interpreter"],
                               input=q, capture_output=True, text=True)
            ways = json.loads(r.stdout).get("elements", []); break
        except Exception:
            time.sleep(10)
    for p in chunk:
        best, bd = None, 1e18
        for w in ways:
            for g in w.get("geometry", []):
                d = hav(p["lat"], p["lng"], g["lat"], g["lon"])
                if d < bd: bd, best = d, g
        if best and bd <= RADIUS:
            p["lat"], p["lng"], p["snap_m"] = round(best["lat"],6), round(best["lon"],6), round(bd)
            snapped += 1
        else:
            p["snap_m"] = None; kept += 1
    print(f"  {min(b+BATCH,len(pts))}/{len(pts)}", flush=True)
    time.sleep(1.5)

json.dump(pts, open(SP+"/added_snapped.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
d = sorted(p["snap_m"] for p in pts if p.get("snap_m") is not None)
print(f"\n道路に吸着 {snapped}件 / 据え置き {kept}件", flush=True)
if d: print(f"移動距離 中央値 {d[len(d)//2]}m / 最大 {d[-1]}m", flush=True)
