"""GeoNames から1万件規模の出題地点を選び、コンパクトな locations.js を生成する"""
import sys, json, math, random, re
from collections import defaultdict
SP, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, SP)
from countries import COUNTRIES
random.seed(20260905)

QUOTA = {"japan":1500,"asia":1800,"europe":2600,"namerica":1700,
         "samerica":1000,"africa":700,"oceania":700}
RATIO = {1:0.04, 2:0.22, 3:0.74}
KANA = re.compile(r"[぀-ヿ]")
CJK  = re.compile(r"[぀-ヿ一-鿿]")
DIFF_OVERRIDE = {"ブリスベン":1, "パース":1, "アデレード":1}
NAME_FIX = {"Ishiki":"一色","Iwai":"岩井","Kaitaichi":"海田","Kamigotō":"上五島",
            "Mitsukaidō":"水海道","Onoda":"小野田"}

def jp_name(alt, cc, fallback):
    for t in alt.split(","):
        t = t.strip()
        if not t or len(t) > 20: continue
        if KANA.search(t): return t
        if cc == "JP" and CJK.search(t): return t
    return fallback

# ---- 近接判定用の格子（総当たりだと1万件で1億回になるため） ----
CELL = 0.03                      # 約3km
grid = defaultdict(list)
def near(lat, lng, km=3.0):
    gi, gj = int(lat/CELL), int(lng/CELL)
    for di in (-1,0,1):
        for dj in (-1,0,1):
            for (a,o) in grid[(gi+di, gj+dj)]:
                R=6371.0; tr=math.radians
                s=math.sin(tr(a-lat)/2)**2+math.cos(tr(lat))*math.cos(tr(a))*math.sin(tr(o-lng)/2)**2
                if 2*R*math.asin(min(1,math.sqrt(s))) < km: return True
    return False
def add_grid(lat, lng):
    grid[(int(lat/CELL), int(lng/CELL))].append((lat,lng))

# ---- 既存の手作業リスト（344件）を先に入れる ----
base = json.load(open(SP+"/geo_snapped.json", encoding="utf-8"))
final, seen = [], set()
for p in base:
    nm = NAME_FIX.get(p["name"], p["name"])
    key = (nm, p["country"])
    if key in seen: continue
    seen.add(key); add_grid(p["lat"], p["lng"])
    final.append({"name":nm, "country":p["country"], "region":p["region"],
                  "diff":DIFF_OVERRIDE.get(nm, p["diff"]),
                  "lat":round(p["lat"],5), "lng":round(p["lng"],5)})
print(f"  手作業リスト {len(final)}件を採用")

# ---- GeoNames から候補を読む ----
cands = defaultdict(list)
for line in open(SP+"/cities1000.txt", encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 15: continue
    cc = f[8]
    if cc not in COUNTRIES: continue
    try: pop = int(f[14])
    except Exception: pop = 0
    country, region = COUNTRIES[cc]
    name = NAME_FIX.get(jp_name(f[3], cc, f[1]), jp_name(f[3], cc, f[1]))
    diff = 1 if (f[7]=="PPLC" or pop >= 1_500_000) else (2 if pop >= 150_000 else 3)
    cands[region].append({"name":name, "country":country, "region":region, "cc":cc,
                          "lat":float(f[4]), "lng":float(f[5]), "pop":pop, "diff":diff})

def take(items, quota):
    """国ごとに順番に取って偏りを防ぐ"""
    byc = defaultdict(list)
    for c in items: byc[c["cc"]].append(c)
    keys = sorted(byc, key=lambda k: -len(byc[k]))
    out, i, miss = [], 0, 0
    while len(out) < quota and miss < len(keys) * 3:
        k = keys[i % len(keys)]; i += 1
        if not byc[k]: miss += 1; continue
        miss = 0
        c = byc[k].pop(0)
        key = (c["name"], c["country"])
        if key in seen: continue
        if near(c["lat"], c["lng"]): continue
        seen.add(key); add_grid(c["lat"], c["lng"])
        out.append(c)
    return out

for region, quota in QUOTA.items():
    pool = cands.get(region, [])
    got = []
    for d in (1, 2, 3):
        sub = [c for c in pool if c["diff"] == d]
        if d == 3: random.shuffle(sub)
        else: sub.sort(key=lambda c: -c["pop"])
        got += take(sub, round(quota * RATIO[d]))
    if len(got) < quota:                       # 端数はどの難易度からでも埋める
        rest = [c for c in pool if (c["name"], c["country"]) not in seen]
        random.shuffle(rest)
        got += take(rest, quota - len(got))
    for c in got:
        final.append({"name":c["name"], "country":c["country"], "region":c["region"],
                      "diff":DIFF_OVERRIDE.get(c["name"], c["diff"]),
                      "lat":round(c["lat"],5), "lng":round(c["lng"],5)})
    print(f"  {region:9s} 追加{len(got):5d}件 ({len(set(c['cc'] for c in got))}か国)")

# ---- コンパクト形式で出力 ----
REGIONS = ["japan","asia","europe","namerica","samerica","africa","oceania"]
countries = sorted({p["country"] for p in final})
ci = {c:i for i,c in enumerate(countries)}
final.sort(key=lambda p: (REGIONS.index(p["region"]), p["diff"], p["name"]))

rows = [f'["{p["name"]}",{ci[p["country"]]},{p["lat"]},{p["lng"]},'
        f'{REGIONS.index(p["region"])},{p["diff"]}]' for p in final]

head = '''/* ============================================================
 * 出題地点データ（%d地点 / %d の国と地域）
 *
 * 件数が多いためコンパクトな配列で持ち、読み込み時にオブジェクトへ展開する。
 *   [ 表示名, 国の番号, 緯度, 経度, エリアの番号, 難易度 ]
 *   難易度 1=やさしい 2=ふつう 3=むずかしい
 *
 * 内訳は「人手で選んだ名所」と「GeoNames の都市データから機械的に選んだ街」。
 * 生成手順は tools/README.md を参照。
 * ============================================================ */
const LOC_REGIONS = %s;
const LOC_COUNTRIES = %s;

const LOC_RAW = [
%s
];

/** 配列をゲーム側が扱うオブジェクトに展開する */
const LOCATIONS = LOC_RAW.map(r => ({
  name: r[0], country: LOC_COUNTRIES[r[1]],
  lat: r[2], lng: r[3],
  region: LOC_REGIONS[r[4]], diff: r[5]
}));
''' % (len(final), len(countries), json.dumps(REGIONS),
       json.dumps(countries, ensure_ascii=False), ",\n".join(rows))

tail = open(SP+"/pick_tail.js", encoding="utf-8").read()
tail = tail.split("\n", 1)[1] if tail.startswith("];") else tail   # 先頭の "];" を除く
open(OUT, "w", encoding="utf-8").write(head + tail)
print(f"\n生成: {len(final)}地点 / {len(countries)}の国と地域")
