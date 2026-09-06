# -*- coding: utf-8 -*-
"""難易度の割り当てロジックの検査。

locations.js は生成物なので、出来上がったデータを見るだけでは
「同点をどう扱ったか」までは分からない。ここでロジックを直接確かめる。
（実際、10万件に増やしたときの不具合はデータ側の検査をすり抜けた）

    python3 tools/test_difficulty.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from difficulty import assign_by_rank, familiarity, EASY_PCT, NORMAL_PCT

ok = ng = 0
def check(name, cond, detail=""):
    global ok, ng
    if cond: ok += 1; print("  ✅ " + name)
    else:    ng += 1; print("  ❌ " + name + ("  → " + str(detail) if detail else ""))

def assign(scores):
    items = [{"s": s} for s in scores]
    assign_by_rank(items, lambda x: x["s"])
    return [it["diff"] for it in items]

print("━━━ 難易度の割り当て ━━━")

# --- 同点は必ず同じ難易度になる（10万件で見つかった不具合そのもの） ---
# 上位はばらけた点、残り9割が同点。同点の塊を途中で割ってはいけない。
scores = [10.0, 9.0, 8.0, 7.0, 6.0] + [3.0] * 95
d = assign(scores)
tie = set(d[5:])
check("★ 同じ点数のものは同じ難易度になる", len(tie) == 1, "難易度が " + str(sorted(tie)) + " に割れた")
check("★ 枠に収まらない塊は下の段へ送られる", tie == {3}, "難易度 " + str(tie) + " になった")
check("上位のばらけた点はやさしいに入る", d[0] == 1, d[:5])

# --- 全部同点なら全部同じ ---
d = assign([5.0] * 50)
check("★ 全部同点なら全部むずかしい", set(d) == {3}, set(d))

# --- 点数がすべて違えば、従来どおりの割合になる ---
n = 1000
d = assign([float(n - i) for i in range(n)])
easy, normal, hard = d.count(1), d.count(2), d.count(3)
check("点がばらけていればやさしいは約12%", abs(easy / n - EASY_PCT) < 0.02, easy)
check("点がばらけていればふつうまでで約45%",
      abs((easy + normal) / n - NORMAL_PCT) < 0.02, easy + normal)
check("難易度は1〜3のみ", set(d) <= {1, 2, 3}, set(d))

# --- 点数の高い順に難易度が上がることはない（単調性） ---
ranked = sorted(zip([float(n - i) for i in range(n)], d), key=lambda x: -x[0])
check("★ 点が高いほうが難しくなることはない",
      all(ranked[i][1] <= ranked[i + 1][1] for i in range(n - 1)))

print()
print("━━━ 当てやすさの点数 ━━━")

# --- 国の見分けやすさが主役であること ---
jp_hamlet = familiarity("JP", True, 2, False, 0, "PPL")        # 日本の集落
ro_city   = familiarity("RO", False, 20, False, 80000, "PPLA") # ルーマニアの県都
check("★ なじみの薄い国の県都より、日本の集落のほうが当てやすい",
      jp_hamlet > ro_city, f"日本の集落{jp_hamlet:.2f} / ルーマニアの県都{ro_city:.2f}")

# --- 同じ国なら、格と知名度で差が付くこと ---
big   = familiarity("JP", True, 41, True, 1973832, "PPLA")     # 札幌
small = familiarity("JP", True, 2, False, 0, "PPL")
check("★ 同じ国なら大きな街のほうが点が高い", big > small + 2.0,
      f"札幌{big:.2f} / 集落{small:.2f}")

# --- 人口も別名も無い地点でも、地物の格で差が付くこと ---
seat = familiarity("JP", True, 2, False, 0, "PPLA2")
check("★ 人口が登録されていなくても市の中心は集落より上",
      seat > small, f"市の中心{seat:.2f} / 集落{small:.2f}")

print()
print("━━━ キャッシュの指紋 ━━━")

# index.html の ?v= が中身とずれていると、直したのに古いファイルが使われたり、
# 直していないのに4MBを再ダウンロードさせたりする
import hashlib, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
fx   = open(os.path.join(ROOT, "js", "fx.js"), encoding="utf-8").read()

def dig(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]

refs  = re.findall(r'(?:src|href)="((?:js|css)/[^"?]+)\?v=([^"]*)"', html)
refs += re.findall(r'"([\w.]+\.mp3)\?v=([^"]*)"', fx)
stale = [r for r, v in refs if dig(r) != v]
check("★ 全ファイルに ?v= が付いている", len(refs) >= 10, str(len(refs)) + "件")
check("★ ?v= が中身と一致している（tools/stamp.py を流し忘れていない）",
      not stale, "ずれている: " + "、".join(stale))
vs = [v for _, v in refs]
check("★ ファイルごとに違う値になっている（1つ直すと全部落ちるのを防ぐ）",
      len(set(vs)) == len(vs), "同じ値が重複: " + str(len(vs) - len(set(vs))) + "件")

print()
print("  合格 %d 件 / 失敗 %d 件" % (ok, ng))
sys.exit(1 if ng else 0)
