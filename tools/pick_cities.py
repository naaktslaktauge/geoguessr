import sys, json, math, random, re
from collections import defaultdict
SP = sys.argv[1]; sys.path.insert(0, SP)
from countries import COUNTRIES, QUOTA
random.seed(20260905)

KANA = re.compile(r"[぀-ヿ]")          # ひらがな・カタカナ
CJK  = re.compile(r"[぀-ヿ一-鿿]")

def jp_name(alt, cc, fallback):
    """日本語の別名があれば使う。日本の都市は漢字のみでも日本語とみなす"""
    for t in alt.split(","):
        t = t.strip()
        if not t or len(t) > 20: continue
        if KANA.search(t): return t
        if cc == "JP" and CJK.search(t): return t
    return fallback

def hav(a1,o1,a2,o2):
    R=6371.0; tr=math.radians
    s=math.sin(tr(a2-a1)/2)**2+math.cos(tr(a1))*math.cos(tr(a2))*math.sin(tr(o2-o1)/2)**2
    return 2*R*math.asin(min(1,math.sqrt(s)))

# 既存の344地点（重複を避けるため）
existing = json.load(open(SP+"/geo_snapped.json", encoding="utf-8"))
ex_names = {e["name"] for e in existing}
ex_pts   = [(e["lat"], e["lng"]) for e in existing]

cands = defaultdict(list)
for line in open(SP+"/cities15000.txt", encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 15: continue
    cc = f[8]
    if cc not in COUNTRIES: continue
    try: pop = int(f[14])
    except Exception: pop = 0
    if pop < 15000: continue
    country, region = COUNTRIES[cc]
    name = jp_name(f[3], cc, f[1])
    # 首都は人口によらず「やさしい」。国名を思い浮かべやすいため
    is_capital = (f[7] == "PPLC")
    diff = 1 if (is_capital or pop >= 1_500_000) else (2 if pop >= 150_000 else 3)
    cands[region].append({"name":name, "country":country, "region":region, "cc":cc,
                          "lat":float(f[4]), "lng":float(f[5]), "pop":pop, "diff":diff})

def round_robin(items, quota, chosen_pts):
    """国ごとに順番に取っていき、偏りを防ぐ"""
    byc = defaultdict(list)
    for c in items: byc[c["cc"]].append(c)
    keys = sorted(byc, key=lambda k: -len(byc[k]))
    out, i = [], 0
    while len(out) < quota and any(byc[k] for k in keys):
        k = keys[i % len(keys)]; i += 1
        if not byc[k]: continue
        c = byc[k].pop(0)
        if c["name"] in ex_names: continue
        if any(hav(c["lat"], c["lng"], p[0], p[1]) < 5 for p in chosen_pts): continue
        ex_names.add(c["name"])
        chosen_pts.append((c["lat"], c["lng"]))
        out.append(c)
    return out

picked, pts = [], list(ex_pts)
RATIO = {1:0.15, 2:0.40, 3:0.45}
for region, quota in QUOTA.items():
    pool = cands.get(region, [])
    got = []
    for d in (1, 2, 3):
        sub = [c for c in pool if c["diff"] == d]
        sub.sort(key=lambda c: -c["pop"])
        if d == 3: random.shuffle(sub)          # 小都市は人口順だと偏るので混ぜる
        got += round_robin(sub, round(quota * RATIO[d]), pts)
    # 端数はどの難易度からでも埋める
    if len(got) < quota:
        rest = [c for c in pool if c["name"] not in ex_names]
        random.shuffle(rest)
        got += round_robin(rest, quota - len(got), pts)
    picked += got
    c1 = sum(1 for c in got if c["diff"]==1); c2 = sum(1 for c in got if c["diff"]==2)
    print(f"  {region:9s} 追加{len(got):4d}件  易{c1:3d} 普{c2:3d} 難{len(got)-c1-c2:3d}"
          f"  ({len(set(c['cc'] for c in got))}か国)")

json.dump(picked, open(SP+"/added.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\n追加候補 {len(picked)}件 → 既存344件と合わせて {len(picked)+344}件")
