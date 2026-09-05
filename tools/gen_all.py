"""既存の手作業リストと GeoNames 由来の追加分を統合して locations.js を生成する"""
import sys, json, math, os
SP, OUT = sys.argv[1], sys.argv[2]
base = json.load(open(SP+"/geo_snapped.json", encoding="utf-8"))
addf = SP + ("/added_snapped.json" if os.path.exists(SP+"/added_snapped.json") else "/added.json")
add  = json.load(open(addf, encoding="utf-8"))
print("追加分の読み込み:", os.path.basename(addf))

def hav(a1,o1,a2,o2):
    R=6371.0; tr=math.radians
    s=math.sin(tr(a2-a1)/2)**2+math.cos(tr(a1))*math.cos(tr(a2))*math.sin(tr(o2-o1)/2)**2
    return 2*R*math.asin(min(1,math.sqrt(s)))

# オーストラリアの主要都市は十分「見て分かる」ので、やさしい側に寄せて件数を揃える
DIFF_OVERRIDE = {"ブリスベン":1, "パース":1, "アデレード":1}

# GeoNames に日本語の別名が無かった日本の地名を補う
NAME_FIX = {
  "Ishiki":"一色", "Iwai":"岩井", "Kaitaichi":"海田", "Kamigotō":"上五島",
  "Mitsukaidō":"水海道", "Onoda":"小野田",
}

# 統合しつつ、名前の重複と 3km 以内の近接を落とす
pts, names, coords = [], set(), []
for p in base + add:
    p["name"] = NAME_FIX.get(p["name"], p["name"])
    if p["name"] in names: continue
    if any(hav(p["lat"],p["lng"],c[0],c[1]) < 3 for c in coords): continue
    if not (-90 <= p["lat"] <= 90 and -180 <= p["lng"] <= 180): continue
    names.add(p["name"]); coords.append((p["lat"], p["lng"]))
    pts.append({"name":p["name"], "country":p["country"], "region":p["region"],
                "diff":DIFF_OVERRIDE.get(p["name"], p["diff"]),
                "lat":round(p["lat"],6), "lng":round(p["lng"],6)})

REG = [("japan","日本"),("asia","アジア"),("europe","ヨーロッパ"),
       ("namerica","北米"),("samerica","南米"),("africa","アフリカ"),("oceania","オセアニア")]
DIFF = {1:"やさしい", 2:"ふつう", 3:"むずかしい"}
head = '''/* ============================================================
 * 出題地点データ（%d地点 / %d の国と地域）
 *   name    : 表示名          country : 国・地域
 *   lat/lng : 座標
 *   region  : japan/asia/europe/namerica/samerica/africa/oceania
 *   diff    : 1=やさしい 2=ふつう 3=むずかしい
 *
 * 座標は最寄りの車道上へ吸着させてある。名所や街の中心ちょうどの座標は
 * 建物の中に落ちてストリートビューで動けなくなることがあるため。
 * 生成手順は tools/README.md を参照。
 * ============================================================ */
const LOCATIONS = [
'''
body = []
for rk, rj in REG:
    body.append(f"  /* ---------- {rj} ---------- */")
    for d in (1,2,3):
        rows = sorted([p for p in pts if p["region"]==rk and p["diff"]==d], key=lambda x:x["name"])
        body.append(f"  /* {DIFF[d]} {len(rows)}件 */")
        for p in rows:
            body.append(f'  {{ name:"{p["name"]}", country:"{p["country"]}", '
                        f'lat:{p["lat"]}, lng:{p["lng"]}, region:"{rk}", diff:{d} }},')
    body.append("")
if body and body[-1]=="": body.pop()
for i in range(len(body)-1,-1,-1):
    if body[i].endswith("},"): body[i]=body[i][:-1]; break

tail = open(SP+"/pick_tail.js", encoding="utf-8").read()
ncountry = len(set(p["country"] for p in pts))
open(OUT,"w",encoding="utf-8").write(head % (len(pts), ncountry) + "\n".join(body) + "\n" + tail)
print(f"生成: {OUT}  {len(pts)}地点 / {ncountry}の国と地域  （重複除外 {len(base)+len(add)-len(pts)}件）")
