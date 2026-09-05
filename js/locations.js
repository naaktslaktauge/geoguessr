/* ============================================================
 * 出題地点データ
 *   name : 表示名          country : 国
 *   lat/lng : 座標（ストリートビューが存在する道路上を選定）
 *   region : japan/asia/europe/namerica/samerica/africa/oceania
 *   diff   : 1=やさしい 2=ふつう 3=むずかしい
 * ============================================================ */
const LOCATIONS = [
  /* ---------- 日本 ---------- */
  { name:"渋谷スクランブル交差点", country:"日本", lat:35.6595, lng:139.7005, region:"japan", diff:1 },
  { name:"道頓堀", country:"日本", lat:34.6687, lng:135.5013, region:"japan", diff:1 },
  { name:"京都・祇園", country:"日本", lat:35.0037, lng:135.7754, region:"japan", diff:2 },
  { name:"札幌・大通公園", country:"日本", lat:43.0605, lng:141.3540, region:"japan", diff:2 },
  { name:"那覇・国際通り", country:"日本", lat:26.2145, lng:127.6870, region:"japan", diff:2 },
  { name:"河口湖（富士山）", country:"日本", lat:35.5171, lng:138.7566, region:"japan", diff:2 },
  { name:"広島・平和記念公園", country:"日本", lat:34.3955, lng:132.4536, region:"japan", diff:2 },
  { name:"金沢・ひがし茶屋街", country:"日本", lat:36.5721, lng:136.6668, region:"japan", diff:3 },
  { name:"長崎・グラバー園周辺", country:"日本", lat:32.7340, lng:129.8695, region:"japan", diff:3 },
  { name:"松本城周辺", country:"日本", lat:36.2381, lng:137.9689, region:"japan", diff:3 },
  { name:"横浜・みなとみらい", country:"日本", lat:35.4568, lng:139.6380, region:"japan", diff:2 },
  { name:"仙台・青葉通", country:"日本", lat:38.2606, lng:140.8819, region:"japan", diff:3 },

  /* ---------- アジア ---------- */
  { name:"ソウル・江南", country:"韓国", lat:37.4979, lng:127.0276, region:"asia", diff:2 },
  { name:"台北101周辺", country:"台湾", lat:25.0338, lng:121.5645, region:"asia", diff:2 },
  { name:"香港・旺角", country:"香港", lat:22.3193, lng:114.1694, region:"asia", diff:2 },
  { name:"バンコク・サイアム", country:"タイ", lat:13.7466, lng:100.5347, region:"asia", diff:2 },
  { name:"シンガポール・マリーナベイ", country:"シンガポール", lat:1.2834, lng:103.8607, region:"asia", diff:1 },
  { name:"クアラルンプール", country:"マレーシア", lat:3.1578, lng:101.7117, region:"asia", diff:2 },
  { name:"バリ島・ウブド", country:"インドネシア", lat:-8.5069, lng:115.2625, region:"asia", diff:3 },
  { name:"ハノイ旧市街", country:"ベトナム", lat:21.0338, lng:105.8500, region:"asia", diff:3 },
  { name:"シェムリアップ", country:"カンボジア", lat:13.3617, lng:103.8590, region:"asia", diff:3 },
  { name:"イスタンブール", country:"トルコ", lat:41.0082, lng:28.9784, region:"asia", diff:2 },
  { name:"ドバイ", country:"アラブ首長国連邦", lat:25.2048, lng:55.2708, region:"asia", diff:2 },
  { name:"ジャイプール", country:"インド", lat:26.9239, lng:75.8267, region:"asia", diff:3 },
  { name:"ムンバイ", country:"インド", lat:18.9220, lng:72.8347, region:"asia", diff:3 },
  { name:"エルサレム", country:"イスラエル", lat:31.7767, lng:35.2345, region:"asia", diff:3 },
  { name:"ウランバートル", country:"モンゴル", lat:47.9188, lng:106.9176, region:"asia", diff:3 },
  { name:"アルマトイ", country:"カザフスタン", lat:43.2380, lng:76.9450, region:"asia", diff:3 },
  { name:"キャンディ", country:"スリランカ", lat:7.2906, lng:80.6337, region:"asia", diff:3 },
  { name:"マニラ", country:"フィリピン", lat:14.5896, lng:120.9800, region:"asia", diff:3 },
  { name:"ウラジオストク", country:"ロシア", lat:43.1155, lng:131.8855, region:"asia", diff:3 },

  /* ---------- ヨーロッパ ---------- */
  { name:"シャンゼリゼ通り", country:"フランス", lat:48.8698, lng:2.3078, region:"europe", diff:1 },
  { name:"ウェストミンスター", country:"イギリス", lat:51.5007, lng:-0.1246, region:"europe", diff:1 },
  { name:"コロッセオ", country:"イタリア", lat:41.8902, lng:12.4922, region:"europe", diff:1 },
  { name:"サグラダ・ファミリア", country:"スペイン", lat:41.4036, lng:2.1744, region:"europe", diff:1 },
  { name:"ブランデンブルク門", country:"ドイツ", lat:52.5163, lng:13.3777, region:"europe", diff:1 },
  { name:"アムステルダム運河", country:"オランダ", lat:52.3730, lng:4.8896, region:"europe", diff:2 },
  { name:"プラハ", country:"チェコ", lat:50.0865, lng:14.4114, region:"europe", diff:2 },
  { name:"サントリーニ島・イア", country:"ギリシャ", lat:36.4618, lng:25.3753, region:"europe", diff:2 },
  { name:"レイキャビク", country:"アイスランド", lat:64.1466, lng:-21.9426, region:"europe", diff:2 },
  { name:"ツェルマット", country:"スイス", lat:46.0207, lng:7.7491, region:"europe", diff:3 },
  { name:"リスボン", country:"ポルトガル", lat:38.7139, lng:-9.1394, region:"europe", diff:2 },
  { name:"ストックホルム旧市街", country:"スウェーデン", lat:59.3251, lng:18.0711, region:"europe", diff:3 },
  { name:"ドゥブロヴニク", country:"クロアチア", lat:42.6407, lng:18.1077, region:"europe", diff:3 },
  { name:"ハルシュタット", country:"オーストリア", lat:47.5622, lng:13.6493, region:"europe", diff:3 },
  { name:"レーヌ（ロフォーテン）", country:"ノルウェー", lat:67.9333, lng:13.0870, region:"europe", diff:3 },
  { name:"赤の広場", country:"ロシア", lat:55.7539, lng:37.6208, region:"europe", diff:2 },
  { name:"ブダペスト", country:"ハンガリー", lat:47.4979, lng:19.0402, region:"europe", diff:3 },
  { name:"ワルシャワ", country:"ポーランド", lat:52.2297, lng:21.0122, region:"europe", diff:3 },
  { name:"コペンハーゲン", country:"デンマーク", lat:55.6761, lng:12.5683, region:"europe", diff:3 },
  { name:"ヘルシンキ", country:"フィンランド", lat:60.1699, lng:24.9384, region:"europe", diff:3 },
  { name:"ダブリン", country:"アイルランド", lat:53.3498, lng:-6.2603, region:"europe", diff:3 },
  { name:"エディンバラ", country:"イギリス", lat:55.9533, lng:-3.1883, region:"europe", diff:3 },
  { name:"ヴィーク", country:"アイスランド", lat:63.4187, lng:-19.0060, region:"europe", diff:3 },

  /* ---------- 北米 ---------- */
  { name:"タイムズスクエア", country:"アメリカ", lat:40.7580, lng:-73.9855, region:"namerica", diff:1 },
  { name:"ゴールデンゲートブリッジ", country:"アメリカ", lat:37.8199, lng:-122.4783, region:"namerica", diff:1 },
  { name:"ラスベガス・ストリップ", country:"アメリカ", lat:36.1147, lng:-115.1728, region:"namerica", diff:1 },
  { name:"グランドキャニオン", country:"アメリカ", lat:36.0578, lng:-112.1400, region:"namerica", diff:2 },
  { name:"ルート66 セリグマン", country:"アメリカ", lat:35.3258, lng:-112.8730, region:"namerica", diff:3 },
  { name:"ニューオーリンズ", country:"アメリカ", lat:29.9584, lng:-90.0644, region:"namerica", diff:2 },
  { name:"シカゴ", country:"アメリカ", lat:41.8827, lng:-87.6233, region:"namerica", diff:2 },
  { name:"マイアミビーチ", country:"アメリカ", lat:25.7810, lng:-80.1300, region:"namerica", diff:2 },
  { name:"ワイキキ（ハワイ）", country:"アメリカ", lat:21.2793, lng:-157.8292, region:"namerica", diff:2 },
  { name:"アンカレッジ", country:"アメリカ", lat:61.2181, lng:-149.9003, region:"namerica", diff:3 },
  { name:"トロント", country:"カナダ", lat:43.6532, lng:-79.3832, region:"namerica", diff:2 },
  { name:"バンクーバー", country:"カナダ", lat:49.2827, lng:-123.1207, region:"namerica", diff:2 },
  { name:"バンフ", country:"カナダ", lat:51.1784, lng:-115.5708, region:"namerica", diff:3 },
  { name:"メキシコシティ・ソカロ", country:"メキシコ", lat:19.4326, lng:-99.1332, region:"namerica", diff:2 },
  { name:"カンクン", country:"メキシコ", lat:21.1619, lng:-86.8515, region:"namerica", diff:3 },
  { name:"パナマシティ", country:"パナマ", lat:8.9824, lng:-79.5199, region:"namerica", diff:3 },
  { name:"サンホセ", country:"コスタリカ", lat:9.9281, lng:-84.0907, region:"namerica", diff:3 },

  /* ---------- 南米 ---------- */
  { name:"コパカバーナ", country:"ブラジル", lat:-22.9711, lng:-43.1822, region:"samerica", diff:2 },
  { name:"サンパウロ", country:"ブラジル", lat:-23.5505, lng:-46.6333, region:"samerica", diff:3 },
  { name:"ブエノスアイレス", country:"アルゼンチン", lat:-34.6037, lng:-58.3816, region:"samerica", diff:2 },
  { name:"クスコ", country:"ペルー", lat:-13.5183, lng:-71.9781, region:"samerica", diff:3 },
  { name:"サンティアゴ", country:"チリ", lat:-33.4489, lng:-70.6693, region:"samerica", diff:3 },
  { name:"サンペドロ・デ・アタカマ", country:"チリ", lat:-22.9087, lng:-68.1997, region:"samerica", diff:3 },
  { name:"ボゴタ", country:"コロンビア", lat:4.7110, lng:-74.0721, region:"samerica", diff:3 },
  { name:"モンテビデオ", country:"ウルグアイ", lat:-34.9011, lng:-56.1645, region:"samerica", diff:3 },
  { name:"ウシュアイア", country:"アルゼンチン", lat:-54.8019, lng:-68.3030, region:"samerica", diff:3 },
  { name:"キト", country:"エクアドル", lat:-0.1807, lng:-78.4678, region:"samerica", diff:3 },
  { name:"リマ", country:"ペルー", lat:-12.0464, lng:-77.0428, region:"samerica", diff:3 },
  { name:"ブラジリア", country:"ブラジル", lat:-15.7939, lng:-47.8828, region:"samerica", diff:3 },
  { name:"カルタヘナ", country:"コロンビア", lat:10.3910, lng:-75.4794, region:"samerica", diff:3 },
  { name:"バルパライソ", country:"チリ", lat:-33.0472, lng:-71.6127, region:"samerica", diff:3 },
  { name:"ラパス", country:"ボリビア", lat:-16.4897, lng:-68.1193, region:"samerica", diff:3 },
  { name:"アスンシオン", country:"パラグアイ", lat:-25.2637, lng:-57.5759, region:"samerica", diff:3 },

  /* ---------- アフリカ ---------- */
  { name:"ケープタウン", country:"南アフリカ", lat:-33.9249, lng:18.4241, region:"africa", diff:2 },
  { name:"ギザのピラミッド", country:"エジプト", lat:29.9773, lng:31.1325, region:"africa", diff:1 },
  { name:"マラケシュ", country:"モロッコ", lat:31.6258, lng:-7.9891, region:"africa", diff:2 },
  { name:"ナイロビ", country:"ケニア", lat:-1.2921, lng:36.8219, region:"africa", diff:3 },
  { name:"ダカール", country:"セネガル", lat:14.6928, lng:-17.4467, region:"africa", diff:3 },
  { name:"アクラ", country:"ガーナ", lat:5.6037, lng:-0.1870, region:"africa", diff:3 },
  { name:"ハボローネ", country:"ボツワナ", lat:-24.6282, lng:25.9231, region:"africa", diff:3 },
  { name:"アルーシャ", country:"タンザニア", lat:-3.3869, lng:36.6830, region:"africa", diff:3 },
  { name:"ヨハネスブルグ", country:"南アフリカ", lat:-26.2041, lng:28.0473, region:"africa", diff:3 },
  { name:"ルクソール", country:"エジプト", lat:25.6989, lng:32.6421, region:"africa", diff:2 },
  { name:"チュニス", country:"チュニジア", lat:36.8065, lng:10.1815, region:"africa", diff:3 },
  { name:"ラゴス", country:"ナイジェリア", lat:6.5244, lng:3.3792, region:"africa", diff:3 },
  { name:"カンパラ", country:"ウガンダ", lat:0.3476, lng:32.5825, region:"africa", diff:3 },
  { name:"ダルエスサラーム", country:"タンザニア", lat:-6.7924, lng:39.2083, region:"africa", diff:3 },
  { name:"スワコプムント", country:"ナミビア", lat:-22.6784, lng:14.5258, region:"africa", diff:3 },
  { name:"ヴィクトリアフォールズ", country:"ジンバブエ", lat:-17.9243, lng:25.8572, region:"africa", diff:2 },
  { name:"ダーバン", country:"南アフリカ", lat:-29.8587, lng:31.0218, region:"africa", diff:3 },

  /* ---------- オセアニア ---------- */
  { name:"シドニー・オペラハウス", country:"オーストラリア", lat:-33.8568, lng:151.2153, region:"oceania", diff:1 },
  { name:"メルボルン", country:"オーストラリア", lat:-37.8136, lng:144.9631, region:"oceania", diff:2 },
  { name:"グレートオーシャンロード", country:"オーストラリア", lat:-38.6650, lng:143.1050, region:"oceania", diff:3 },
  { name:"ウルル周辺", country:"オーストラリア", lat:-25.3450, lng:131.0300, region:"oceania", diff:3 },
  { name:"パース", country:"オーストラリア", lat:-31.9523, lng:115.8613, region:"oceania", diff:3 },
  { name:"クイーンズタウン", country:"ニュージーランド", lat:-45.0312, lng:168.6626, region:"oceania", diff:2 },
  { name:"オークランド", country:"ニュージーランド", lat:-36.8485, lng:174.7633, region:"oceania", diff:3 },
  { name:"ブリスベン", country:"オーストラリア", lat:-27.4698, lng:153.0251, region:"oceania", diff:3 },
  { name:"アデレード", country:"オーストラリア", lat:-34.9285, lng:138.6007, region:"oceania", diff:3 },
  { name:"ケアンズ", country:"オーストラリア", lat:-16.9186, lng:145.7781, region:"oceania", diff:2 },
  { name:"ホバート", country:"オーストラリア", lat:-42.8821, lng:147.3272, region:"oceania", diff:3 },
  { name:"ダーウィン", country:"オーストラリア", lat:-12.4634, lng:130.8456, region:"oceania", diff:3 },
  { name:"ウェリントン", country:"ニュージーランド", lat:-41.2866, lng:174.7756, region:"oceania", diff:2 },
  { name:"クライストチャーチ", country:"ニュージーランド", lat:-43.5321, lng:172.6362, region:"oceania", diff:3 },
  { name:"ロトルア", country:"ニュージーランド", lat:-38.1368, lng:176.2497, region:"oceania", diff:3 },
  { name:"ヌメア", country:"ニューカレドニア", lat:-22.2758, lng:166.4580, region:"oceania", diff:3 }
];

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
