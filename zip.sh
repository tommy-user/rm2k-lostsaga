#!/bin/bash
# 배포용 zip 을 만든다: ~/easyrpg-player-apps/rm2k-lostsaga.zip
# 한글 파일 이름에 UTF-8 표시(zip 플래그 bit 11)를 붙여야 Windows 에서 이름이 깨지지 않는다.
# macOS 의 zip 은 이 표시를 붙이지 않으므로 python zipfile 로 묶는다. 세이브·로그·.DS_Store 는 넣지 않는다.
# (정식 배포는 v* 태그를 push 하면 .github/workflows/tag.yaml 이 만든다)
set -e
cd "$(dirname "$0")"
DEST_DIR="$HOME/easyrpg-player-apps"
ZIP_FILE="$DEST_DIR/rm2k-lostsaga.zip"
mkdir -p "$DEST_DIR"
rm -f "$ZIP_FILE"
python3 - "$ZIP_FILE" <<'EOF'
import os, sys, zipfile, unicodedata
out = sys.argv[1]
skip_ext = ('.lsd',)
skip_name = ('.DS_Store', 'easyrpg_log.txt', 'Thumbs.db')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('rm2k-lostsaga'):
        dirs.sort()
        for f in sorted(files):
            if f in skip_name or f.endswith(skip_ext): continue
            p = os.path.join(root, f)
            z.write(p, unicodedata.normalize('NFC', p))   # macOS 이름(NFD)도 NFC 로
print(out)
EOF
echo "Lostsaga game is zipped and moved to $ZIP_FILE"
