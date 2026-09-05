# 出題地点データの生成ツール

`js/locations.js` を作り直すためのスクリプトです。普段のプレイでは使いません。
地点を数件足すだけなら `js/locations.js` を直接編集するほうが早いです。

## ファイル
### 手作業リスト（名所・ランドマーク 344件）
| ファイル | 内容 |
|---|---|
| `part1〜4.py` | 地点の一覧（表示名・検索クエリ・国コード・エリア・難易度） |
| `geo3.py` | 検索クエリから座標を取得（Photon / Nominatim） |
| `snap.py` | 最寄りの車道上へ座標を吸着（Overpass API） |
| `cross.py` | 2つの地理サービスを突き合わせて誤りを検出 |
| `gen.py` | 344件版の `js/locations.js` を生成 |

### 一括生成（都市データ 約1万件）
| ファイル | 内容 |
|---|---|
| `countries.py` | 対象の国・地域とエリアごとの追加目標件数 |
| `pick_cities.py` | GeoNames の都市データから条件に合う地点を選ぶ |
| `snap_add.py` | 追加分を道路へ吸着（任意。Overpass が重いときは省略可） |
| `gen_all.py` | 手作業リストと追加分を統合して `js/locations.js` を生成（1,000件版） |
| `build_big.py` | 1万件版を一気に生成（コンパクト形式） |
| `pick_tail.js` | 生成物の末尾に付ける抽選関数 |

一括生成には GeoNames の都市データが必要です。
```bash
curl -O https://download.geonames.org/export/dump/cities1000.zip
unzip cities1000.zip -d tools/
python3 tools/build_big.py tools js/locations.js
```

難易度は人口で機械的に決めています（首都または150万人以上＝やさしい、
15万人以上＝ふつう、それ以下＝むずかしい）。手作業リストの344件は
1地点ずつ人手で付けた値をそのまま使います。

## 手順
```bash
python3 tools/geo3.py tools      # 座標を取得   → geo.json
python3 tools/snap.py  tools     # 道路へ吸着   → geo_snapped.json
python3 tools/cross.py tools     # 誤りの検出（25km以上ずれた地点を報告）
python3 tools/gen.py   tools js/locations.js
```

## なぜ道路に吸着させるのか
名所ちょうどの座標は建物の中や歩行者エリアに落ちることが多く、
ストリートビューが表示されなかったり、表示されても移動できなかったりします。
最寄りの車道上に寄せることで、確実に道の上から始まり歩き回れるようになります。

## なぜ2つのサービスで突き合わせるのか
地名検索は思わぬ別の場所を返すことがあります。実際にこの方法で、
「佐賀駅」が京都の嵯峨に、「福井駅」が岡山県津山市に化けているのを検出しました。
独立した2つのサービスの結果が 25km 以上離れていたら、どちらかが誤っています。
