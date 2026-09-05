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

/**
 * 条件に合う地点だけをシャッフルして全件返す。
 * pickLocations は「必要数に足りなければ難易度を緩める」ため、
 * 1件ずつ引きたい用途で大きな n を渡すと条件が無視されてしまう。
 * 引き直し（スキップ）や1件ずつの出題にはこちらを使う。
 */
function shuffledPool(region, difficulty){
  const byRegion = l => region === "world" || l.region === region;
  const byDiff   = l => difficulty === "all" || String(l.diff) === String(difficulty);
  let pool = LOCATIONS.filter(l => byRegion(l) && byDiff(l));
  if (pool.length === 0) pool = LOCATIONS.filter(byRegion);
  if (pool.length === 0) pool = LOCATIONS.slice();
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
