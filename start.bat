@echo off
rem ================================================
rem   GeoGuessr Clone 起動スクリプト（Windows）
rem   ダブルクリックで実行してください
rem ================================================
cd /d "%~dp0"
setlocal

set PORT=8765
set PY=

where python >nul 2>nul && (python -c "import sys,http.server; sys.exit(0 if sys.version_info[0]==3 else 1)" >nul 2>nul && set PY=python)
if not defined PY (
  where py >nul 2>nul && (py -3 -c "import http.server" >nul 2>nul && set PY=py -3)
)

if not defined PY (
  echo ==============================================
  echo  Python 3 が見つかりませんでした。
  echo  index.html を直接開きます。
  echo.
  echo  ※ ひとりで遊ぶ分には問題ありません。
  echo  ※ オンライン対戦がうまく繋がらない場合は
  echo     https://www.python.org/downloads/ から
  echo     Python 3 を入れてください。
  echo ==============================================
  start "" index.html
  pause
  exit /b
)

echo ==============================================
echo  GeoGuessr Clone を起動します
echo.
echo    http://localhost:%PORT%/
echo.
echo  終了するには Ctrl + C を押してください
echo ==============================================
start "" http://localhost:%PORT%/
%PY% -m http.server %PORT%
