# -*- coding: utf-8 -*-
"""index.html の ?v= を、ファイルの中身から決まる値に書き換える。

これまでは全ファイルに同じ番号を振っていたため、fx.js を1行直しただけで
locations.js（4MB）まで再ダウンロードされていた。中身が変わったファイルだけ
値が変わるようにして、無駄な再取得を無くす。

    python3 tools/stamp.py

コミットの前に実行する。中身が変わっていなければ何も起きない。
"""
import hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, "index.html")

def digest(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]

changed = []

def digest_or_none(rel):
    full = os.path.join(ROOT, rel)
    return digest(full) if os.path.exists(full) else None

# 先に fx.js の中の音源を打つ。あとにすると、書き換えで fx.js 自身の指紋が
# 変わってしまい、index.html の値が1回では合わなくなる。
FX = os.path.join(ROOT, "js", "fx.js")
fx = open(FX, encoding="utf-8").read()

def stamp_clip(m):
    new = digest_or_none(m.group(1))
    if new is None: return m.group(0)
    if new != m.group(2):
        changed.append("%s  %s → %s" % (m.group(1), m.group(2), new))
    return '"%s?v=%s"' % (m.group(1), new)

fx2 = re.sub(r'"([\w.]+\.mp3)\?v=([^"]*)"', stamp_clip, fx)
if fx2 != fx: open(FX, "w", encoding="utf-8").write(fx2)

# そのうえで index.html の ?v= を打つ
src = open(HTML, encoding="utf-8").read()

def stamp(m):
    """src="js/xxx.js?v=..." の ?v= を中身の指紋に置き換える"""
    attr, path, old = m.group(1), m.group(2), m.group(3)
    new = digest_or_none(path)
    if new is None:
        print("  ⚠️ 見つからない: " + path)
        return m.group(0)
    if new != old:
        changed.append("%s  %s → %s" % (path, old, new))
    return '%s="%s?v=%s"' % (attr, path, new)

src2 = re.sub(r'(src|href)="((?:js|css)/[^"?]+)\?v=([^"]*)"', stamp, src)
if src2 != src: open(HTML, "w", encoding="utf-8").write(src2)

if changed:
    print("更新したもの:")
    for c in changed: print("  " + c)
else:
    print("変更なし（すべて最新）")
