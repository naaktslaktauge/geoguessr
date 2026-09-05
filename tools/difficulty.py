# -*- coding: utf-8 -*-
"""
難易度の付け方
---------------
このゲームで点が入るかどうかは、ほぼ「国を当てられるか」で決まる。
世界モードなら、国さえ合っていれば 4,500 点前後は取れるからだ。
だから難易度は「国の見分けやすさ」を主、「その街の知名度」を従として決める。

人口や首都かどうかを主軸にしていた以前のやり方は、
メキシコ市郊外の Ecatepec（160万人・無名）が「やさしい」になるなど噛み合っていなかった。

さらに、付けた点数はエリアの中での相対順位に直してから3段階に割り当てる。
そうしないと日本を選んだときに全部「やさしい」になり、
アフリカを選んだときに全部「むずかしい」になってしまう。
「日本の中では難しい町」「アフリカの中では分かりやすい街」を表せるようにする。
"""

# 国の見分けやすさ（2=一目で分かる / 1=ある程度絞れる / 0=紛らわしい・なじみが薄い）
# 文字・景観・車・植生の特徴と、日本人にとってのなじみの深さで決めている
COUNTRY_TIER = {
 "JP":2,"KR":2,"TW":2,"HK":2,"MO":2,"TH":2,"SG":2,"IN":2,"VN":2,"ID":2,
 "US":2,"CA":2,"MX":2,"BR":2,"AU":2,"NZ":2,
 "GB":2,"FR":2,"IT":2,"ES":2,"DE":2,"NL":2,"CH":2,"GR":2,"RU":2,"TR":2,"EG":2,
 "PT":1,"BE":1,"AT":1,"CZ":1,"PL":1,"SE":1,"NO":1,"DK":1,"FI":1,"IS":1,"IE":1,
 "HU":1,"HR":1,"UA":1,"MT":1,
 "PH":1,"MY":1,"KH":1,"NP":1,"LK":1,"AE":1,"IL":1,"SA":1,"QA":1,"JO":1,"MN":1,
 "MA":1,"ZA":1,"KE":1,"TN":1,"TZ":1,
 "AR":1,"CL":1,"PE":1,"CO":1,"BO":1,"EC":1,
 "GU":1,"PR":1,"GL":1,
}
def country_tier(cc): return COUNTRY_TIER.get(cc, 0)

def familiarity(cc, has_ja_name, alt_count, is_capital, pop):
    """当てやすさの点数。国の見分けやすさが支配的で、街の知名度が上乗せされる"""
    s  = country_tier(cc) * 1.5                                    # 0 / 1.5 / 3 ← 主
    s += 0.5 if has_ja_name else 0.0                               # 日本語の呼び名がある
    # 国際的な知名度。国の重みだけだと、有名なクラクフ(ポーランド)より
    # 無名のギリシャの町が上に来てしまうため、ここも厚めに配点する
    s += (2.0 if alt_count >= 40 else
          1.0 if alt_count >= 18 else
          0.4 if alt_count >= 8  else 0.0)
    s += 0.5 if is_capital else 0.0
    s += 0.5 if pop >= 1_000_000 else (0.25 if pop >= 200_000 else 0.0)
    return s

# エリア内での上位何%をどの難易度にするか
EASY_PCT, NORMAL_PCT = 0.12, 0.45      # 上位12%=やさしい、45%まで=ふつう、残り=むずかしい

def assign_by_rank(items, score_of):
    """エリア単位で相対順位に直して難易度を割り当てる"""
    ranked = sorted(items, key=lambda x: -score_of(x))
    n = len(ranked)
    for i, it in enumerate(ranked):
        p = (i + 0.5) / n
        it["diff"] = 1 if p < EASY_PCT else (2 if p < NORMAL_PCT else 3)
    return ranked
