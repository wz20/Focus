#!/bin/bash
# Run from Finder or Terminal; preserves exit status and does not require sudo.
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1
/bin/bash "$ROOT/scripts/build-mac.sh"
RESULT=$?
if [ "$RESULT" -eq 0 ]; then
  /usr/bin/open "$ROOT/dist"
else
  printf '\n没有生成新的可验证安装包，请查看上方错误。\n'
fi
if [ -t 0 ]; then printf '\n按回车关闭窗口…'; read -r _; fi
exit "$RESULT"
