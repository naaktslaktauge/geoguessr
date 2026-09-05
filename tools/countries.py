# ISO国コード → (日本語国名, エリア)  ※ストリートビューの整備が確認できる国のみ
COUNTRIES = {
 # ---- 日本 ----
 "JP":("日本","japan"),
 # ---- アジア ----
 "KR":("韓国","asia"),"TW":("台湾","asia"),"HK":("香港","asia"),"MO":("マカオ","asia"),
 "SG":("シンガポール","asia"),"MY":("マレーシア","asia"),"TH":("タイ","asia"),
 "VN":("ベトナム","asia"),"KH":("カンボジア","asia"),"LA":("ラオス","asia"),
 "ID":("インドネシア","asia"),"PH":("フィリピン","asia"),"IN":("インド","asia"),
 "LK":("スリランカ","asia"),"NP":("ネパール","asia"),"BD":("バングラデシュ","asia"),
 "BT":("ブータン","asia"),"MN":("モンゴル","asia"),"KZ":("カザフスタン","asia"),
 "KG":("キルギス","asia"),"AE":("アラブ首長国連邦","asia"),"QA":("カタール","asia"),
 "OM":("オマーン","asia"),"BH":("バーレーン","asia"),"JO":("ヨルダン","asia"),
 "IL":("イスラエル","asia"),"TR":("トルコ","asia"),"SA":("サウジアラビア","asia"),
 # ---- ヨーロッパ ----
 "GB":("イギリス","europe"),"IE":("アイルランド","europe"),"FR":("フランス","europe"),
 "ES":("スペイン","europe"),"PT":("ポルトガル","europe"),"IT":("イタリア","europe"),
 "DE":("ドイツ","europe"),"NL":("オランダ","europe"),"BE":("ベルギー","europe"),
 "LU":("ルクセンブルク","europe"),"CH":("スイス","europe"),"AT":("オーストリア","europe"),
 "CZ":("チェコ","europe"),"PL":("ポーランド","europe"),"HU":("ハンガリー","europe"),
 "SK":("スロバキア","europe"),"SI":("スロベニア","europe"),"HR":("クロアチア","europe"),
 "RS":("セルビア","europe"),"RO":("ルーマニア","europe"),"BG":("ブルガリア","europe"),
 "GR":("ギリシャ","europe"),"DK":("デンマーク","europe"),"NO":("ノルウェー","europe"),
 "SE":("スウェーデン","europe"),"FI":("フィンランド","europe"),"IS":("アイスランド","europe"),
 "EE":("エストニア","europe"),"LV":("ラトビア","europe"),"LT":("リトアニア","europe"),
 "UA":("ウクライナ","europe"),"RU":("ロシア","europe"),"MT":("マルタ","europe"),
 "CY":("キプロス","europe"),"ME":("モンテネグロ","europe"),"MK":("北マケドニア","europe"),
 "AL":("アルバニア","europe"),"BA":("ボスニア・ヘルツェゴビナ","europe"),
 # ---- 北米・中米 ----
 "US":("アメリカ","namerica"),"CA":("カナダ","namerica"),"MX":("メキシコ","namerica"),
 "GT":("グアテマラ","namerica"),"CR":("コスタリカ","namerica"),"PA":("パナマ","namerica"),
 "SV":("エルサルバドル","namerica"),"DO":("ドミニカ共和国","namerica"),
 "PR":("プエルトリコ","namerica"),"GL":("グリーンランド","namerica"),
 # ---- 南米 ----
 "BR":("ブラジル","samerica"),"AR":("アルゼンチン","samerica"),"CL":("チリ","samerica"),
 "PE":("ペルー","samerica"),"CO":("コロンビア","samerica"),"EC":("エクアドル","samerica"),
 "BO":("ボリビア","samerica"),"UY":("ウルグアイ","samerica"),"PY":("パラグアイ","samerica"),
 # ---- アフリカ ----
 "ZA":("南アフリカ","africa"),"EG":("エジプト","africa"),"MA":("モロッコ","africa"),
 "TN":("チュニジア","africa"),"KE":("ケニア","africa"),"TZ":("タンザニア","africa"),
 "UG":("ウガンダ","africa"),"RW":("ルワンダ","africa"),"GH":("ガーナ","africa"),
 "NG":("ナイジェリア","africa"),"SN":("セネガル","africa"),"BW":("ボツワナ","africa"),
 "NA":("ナミビア","africa"),"LS":("レソト","africa"),"SZ":("エスワティニ","africa"),
 "RE":("レユニオン","africa"),
 # ---- オセアニア ----
 "AU":("オーストラリア","oceania"),"NZ":("ニュージーランド","oceania"),
 "NC":("ニューカレドニア","oceania"),"GU":("グアム","oceania"),
}
# エリアごとの追加目標件数
QUOTA = {"japan":110,"asia":130,"europe":190,"namerica":105,
         "samerica":60,"africa":50,"oceania":45}
