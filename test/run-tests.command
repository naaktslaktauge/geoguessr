#!/bin/bash
# ゲームロジックの自動テスト（ブラウザ不要 / macOS 標準の JS エンジンで実行）
cd "$(dirname "$0")/.." || exit 1

python3 - <<'PY'
import re, json
files = ['test/stub.js','js/common.js','js/locations.js','js/guide.js','js/maps.js','js/pano.js',
         'js/fx.js','js/net.js','js/multi.js','js/game.js','test/driver.js']
src = "\n".join(open(f, encoding='utf-8').read() for f in files)

# 実際の HTML で hidden が付いている要素をスタブへ渡し、初期状態のズレを防ぐ
html = open('index.html', encoding='utf-8').read()
hidden = []
for tag in re.findall(r'<[a-zA-Z][^>]*>', html):
    m = re.search(r'id="([^"]+)"', tag)
    if m and re.search(r'\shidden(?=[\s/>])', tag):
        hidden.append(m.group(1))
src = "var __HTML_HIDDEN = " + json.dumps(sorted(set(hidden))) + ";\n" + src
# osascript(JXA) では $ が ObjC ブリッジ用に予約されているため改名する
src = src.replace("const $ = id => document.getElementById(id);",
                  "var __dollar = id => document.getElementById(id);")
src = re.sub(r'\$\(', '__dollar(', src)
open('test/_build.js', 'w', encoding='utf-8').write(src)
PY

osascript -l JavaScript test/_build.js 2>&1 | grep -v '^\[object Promise\]$'
rm -f test/_build.js

# 難易度の割り当ては生成ツール側（Python）にあり、出来上がった locations.js を
# 見るだけでは「同点をどう扱ったか」が分からないので、こちらも一緒に流す
echo
python3 tools/test_difficulty.py

echo
read -n 1 -s -r -p "終了するには何かキーを押してください..."
