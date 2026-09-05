#!/bin/bash
# ================================================
#  GeoGuessr Clone 起動スクリプト（macOS）
#  ダブルクリックで実行してください
# ================================================
cd "$(dirname "$0")" || exit 1

# --- Python 3 を探す（無ければ file:// で直接開く） ---
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && \
     "$c" -c 'import sys,http.server; sys.exit(0 if sys.version_info[0]==3 else 1)' >/dev/null 2>&1; then
    PY="$c"; break
  fi
done

if [ -z "$PY" ]; then
  echo "=============================================="
  echo " Python 3 が見つかりませんでした。"
  echo " index.html を直接開きます。"
  echo ""
  echo " ※ ひとりで遊ぶ分には問題ありません。"
  echo " ※ オンライン対戦がうまく繋がらない場合は、"
  echo "    ターミナルで次を実行して Python を入れてください："
  echo "      xcode-select --install"
  echo "=============================================="
  open index.html
  echo ""
  read -n 1 -s -r -p "このウィンドウは閉じて構いません（何かキーを押すと終了）"
  exit 0
fi

# --- 空いているポートを探す ---
PORT=8765
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done

echo "=============================================="
echo " GeoGuessr Clone を起動します"
echo ""
echo "   http://localhost:$PORT/"
echo ""
echo " 終了するには Control + C を押してください"
echo "=============================================="
( sleep 1; open "http://localhost:$PORT/" ) &
"$PY" -m http.server $PORT
