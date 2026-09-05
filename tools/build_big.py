# -*- coding: utf-8 -*-
"""GeoNames から1万件規模の出題地点を選び、コンパクトな locations.js を生成する"""
import sys, json, math, random, re
from collections import defaultdict
SP, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, SP)
from countries import COUNTRIES
from difficulty import familiarity, assign_by_rank, country_tier
random.seed(20260905)

# 日本は GeoNames の収録自体が約2,200件で頭打ちのため、他エリアで補っている
QUOTA = {"japan":2000,"asia":3600,"europe":6300,"namerica":3600,
         "samerica":2000,"africa":1400,"oceania":1400}

# 「・」や「ー」だけで日本語と誤判定しないよう、実際の仮名だけを見る
KANA = re.compile(r"[ぁ-ゖァ-ヺ]")
CJK  = re.compile(r"[ぁ-ゖァ-ヺ一-龯]")
# 簡体字は日本語名ではない（东京 が採用されてしまうのを防ぐ）
SIMPLIFIED = set("东广华湾岛县阳泽长兴龙义丰齐边门鸟众亚归产欢汉纪节乐两")
TRIM = " 　()（）[]「」『』<>《》,、"

KANJI_COUNTRIES = {"JP", "KR", "TW", "HK", "MO"}
HIRA  = re.compile(r"[ぁ-ゖ]")
KANJI = re.compile(r"[一-龯]")

# 仮名とラテン文字が混ざった候補は文字化けの可能性が高い
# （「スウæォンジ」= Swansea、「クランj」など。
#   「ウォーエーカーズ/Warr Acres」のような併記もここで弾ける）
MIXED = re.compile(r"[A-Za-zÀ-ÿ]")

def jp_name(alt, cc, fallback):
    """日本語の呼び名を選ぶ。
       日本の地名は漢字が正式なので漢字を優先する（「あおもり」ではなく「青森」）。
       海外は片仮名の音訳を使う。"""
    kanji = kana = None
    for t in alt.split(","):
        t = t.strip(TRIM)
        if not t or len(t) > 20: continue
        if SIMPLIFIED & set(t): continue
        if KANA.search(t) and MIXED.search(t): continue    # 文字化けの疑い
        if cc in KANJI_COUNTRIES:
            # 日本・韓国・台湾・香港・マカオは漢字表記が日本語の呼び名になる
            # （釜山は片仮名の別名が無く、漢字しか用意されていない）
            if KANJI.search(t) and not HIRA.search(t):
                if kanji is None: kanji = t
            elif KANA.search(t) and kana is None:
                kana = t
        elif KANA.search(t):
            return t
    return kanji or kana or fallback.strip(TRIM)

CELL = 0.03
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
def add_grid(lat, lng): grid[(int(lat/CELL), int(lng/CELL))].append((lat,lng))

NAME_FIX = {"Ishiki":"一色","Iwai":"岩井","Kaitaichi":"海田","Kamigotō":"上五島",
            "Mitsukaidō":"水海道","Onoda":"小野田"}
DIFF_OVERRIDE = {"ブリスベン":1, "パース":1, "アデレード":1}

# ---- GeoNames の候補を読む ----
cands = defaultdict(list)
seen = set()
for line in open(SP+"/cities500.txt", encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 15: continue
    cc = f[8]
    if cc not in COUNTRIES: continue
    try: pop = int(f[14])
    except Exception: pop = 0
    country, region = COUNTRIES[cc]
    name = NAME_FIX.get(jp_name(f[3], cc, f[1]), jp_name(f[3], cc, f[1]))
    if not name or len(name) > 24: continue
    alt = len([x for x in f[3].split(",") if x.strip()])
    cands[region].append({
        "name":name, "country":country, "region":region, "cc":cc,
        "lat":float(f[4]), "lng":float(f[5]),
        "fame": familiarity(cc, bool(CJK.search(name)), alt, f[7]=="PPLC", pop)})

# ---- 人手で選んだ名所を、同じ物差しで採点して混ぜる ----
# 以前は名所だけ主観で難易度を付けていたため、
# 「グラスゴー=むずかしい」のように新しい基準と食い違っていた。
# 近くの都市の知名度を引き継ぎ、名所である分だけ少し上乗せする。
# 名所そのものの目立ちやすさ（人手で付けた元の難易度を上乗せ分として使う）。
# データからは「渋谷スクランブル交差点」の象徴性までは分からないので、
# ここだけは人の判断を残す。ただし土台は近くの都市の知名度に合わせる。
LANDMARK_BONUS = {1: 2.0, 2: 1.0, 3: 0.3}

def fame_near(lat, lng, region, cc_hint, hand_diff):
    best, bd = None, 1e9
    for c in cands.get(region, []):
        d = abs(c["lat"]-lat) + abs(c["lng"]-lng)      # 粗い距離で十分
        if d < bd: bd, best = d, c
    base = best["fame"] if (best and bd < 0.30) else country_tier(cc_hint) * 1.5
    return base + LANDMARK_BONUS.get(hand_diff, 0.3)

CC_OF = {v[0]: k for k, v in COUNTRIES.items()}
base = json.load(open(SP+"/geo_snapped.json", encoding="utf-8"))
curated = defaultdict(list)
seen_named = set()
for p in base:
    nm = NAME_FIX.get(p["name"], p["name"]).strip(TRIM)
    key = (nm, p["country"])
    if not nm or key in seen_named: continue
    seen_named.add(key); seen.add(key); add_grid(p["lat"], p["lng"])
    curated[p["region"]].append({
        "name":nm, "country":p["country"], "region":p["region"],
        "lat":p["lat"], "lng":p["lng"],
        "fame": fame_near(p["lat"], p["lng"], p["region"],
                          CC_OF.get(p["country"], ""), p["diff"])})
print(f"  人手で選んだ名所 {sum(len(v) for v in curated.values())}件（同じ物差しで採点し直す）")

# ---- 国ごとに知名度の高い順から順番に取る（国の偏りを防ぐ） ----
final = []
picked_by_region = {}
for region, quota in QUOTA.items():
    byc = defaultdict(list)
    for c in cands.get(region, []): byc[c["cc"]].append(c)
    for k in byc: byc[k].sort(key=lambda c: -c["fame"])
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
        seen.add(key); add_grid(c["lat"], c["lng"]); out.append(c)
    # 名所と合わせて、エリア内の相対順位で難易度を割り当てる
    allrows = out + curated.get(region, [])
    assign_by_rank(allrows, lambda c: c["fame"])
    picked_by_region[region] = allrows
    d = [sum(1 for c in allrows if c["diff"]==k) for k in (1,2,3)]
    print(f"  {region:9s} {len(allrows):5d}件  易{d[0]:4d} 普{d[1]:4d} 難{d[2]:4d}"
          f"  (名所{len(curated.get(region,[]))}件を含む)")
    for c in allrows:
        final.append({"name":c["name"], "country":c["country"], "region":c["region"],
                      "diff":DIFF_OVERRIDE.get(c["name"], c["diff"]),
                      "lat":round(c["lat"],4), "lng":round(c["lng"],4)})

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
 * 難易度は「国の見分けやすさ」を主、「その街の知名度」を従として点数化し、
 * エリアの中での相対順位で3段階に割り当てている（tools/difficulty.py）。
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
tail = tail.split("\n", 1)[1] if tail.startswith("];") else tail
open(OUT, "w", encoding="utf-8").write(head + tail)
print(f"\n生成: {len(final)}地点 / {len(countries)}の国と地域")
