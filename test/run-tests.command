#!/bin/bash
# ゲームロジックの自動テスト（ブラウザ不要 / macOS 標準の JS エンジンで実行）
cd "$(dirname "$0")/.." || exit 1

python3 - <<'PY'
import re
files = ['test/stub.js','js/common.js','js/locations.js','js/maps.js','js/pano.js',
         'js/net.js','js/multi.js','js/game.js','test/driver.js']
src = "\n".join(open(f, encoding='utf-8').read() for f in files)
# osascript(JXA) では $ が ObjC ブリッジ用に予約されているため改名する
src = src.replace("const $ = id => document.getElementById(id);",
                  "var __dollar = id => document.getElementById(id);")
src = re.sub(r'\$\(', '__dollar(', src)
open('test/_build.js', 'w', encoding='utf-8').write(src)
PY

osascript -l JavaScript test/_build.js 2>&1 | grep -v '^\[object Promise\]$'
rm -f test/_build.js
echo
read -n 1 -s -r -p "終了するには何かキーを押してください..."
