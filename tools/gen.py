import sys, json
SP, OUT = sys.argv[1], sys.argv[2]
pts = json.load(open(SP + "/geo_snapped.json", encoding="utf-8"))

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
 * 座標は OpenStreetMap から取得したうえで、最寄りの車道上へ吸着させている。
 * 名所ちょうどの座標だと建物の中や歩行者エリアに落ちてしまい、
 * ストリートビューで移動できなくなるため。
 * ============================================================ */
const LOCATIONS = [
'''

body = []
for rk, rj in REG:
    body.append(f"  /* ---------- {rj} ---------- */")
    for d in (1, 2, 3):
        rows = [p for p in pts if p["region"] == rk and p["diff"] == d]
        rows.sort(key=lambda x: x["name"])
        body.append(f"  /* {DIFF[d]} {len(rows)}件 */")
        for p in rows:
            body.append(
                f'  {{ name:"{p["name"]}", country:"{p["country"]}", '
                f'lat:{p["lat"]}, lng:{p["lng"]}, region:"{rk}", diff:{d} }},')
    body.append("")
if body[-1] == "": body.pop()
# 最後の要素の末尾カンマを外す
for i in range(len(body)-1, -1, -1):
    if body[i].endswith("},"):
        body[i] = body[i][:-1]
        break

tail = '''];

/** 条件に合う地点をシャッフルして n 件返す */
function pickLocations(region, difficulty, n){
  const byRegion = l => region === "world" || l.region === region;
  const byDiff   = l => difficulty === "all" || String(l.diff) === String(difficulty);

  // 条件を満たす地点が足りなければ、難易度 → エリアの順に条件を緩める
  let pool = LOCATIONS.filter(l => byRegion(l) && byDiff(l));
  if (pool.length < n) pool = LOCATIONS.filter(byRegion);   // まず難易度だけ緩める
  if (pool.length === 0) pool = LOCATIONS.slice();          // エリアは最後まで守る

  // Fisher-Yates
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // 候補が足りない場合は繰り返して埋める
  const out = [];
  while (out.length < n) out.push(a[out.length % a.length]);
  return out.slice(0, n);
}
'''

ncountry = len(set(p["country"] for p in pts))
open(OUT, "w", encoding="utf-8").write(head % (len(pts), ncountry) + "\n".join(body) + "\n" + tail)
print(f"生成: {OUT}  {len(pts)}地点 / {ncountry}の国と地域")
