#!/bin/bash
# Local macOS build. No npm, Homebrew, external font files, or cloud account needed.
# Electron's official binary ZIP is checked against its published SHA-256.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$(uname -s)" != "Darwin" ]; then
  printf '\n此脚本必须在 macOS 上执行；当前环境无法运行 codesign / hdiutil。\n未生成 DMG。\n' >&2
  exit 2
fi
VERSION="0.1.4"
ELECTRON_VERSION="44.4.3"
NATIVE_ARCH="$(uname -m)"
case "$NATIVE_ARCH" in arm64) NATIVE_ARCH="arm64";; x86_64) NATIVE_ARCH="x64";; *) echo '不支持的 Mac 架构' >&2; exit 2;; esac
ARCH="${1:-$NATIVE_ARCH}"
case "$ARCH" in
  arm64) SHA="6b728f5dcfae74f3f936f2bca5b3cd9b9659ffea464f67939f004acb55425a85";;
  x64) SHA="015b52631d92187b552ff4e047255f596a7af4707e388a5890951f0b2645764e";;
  *) echo '用法：bash scripts/build-mac.sh [arm64|x64]' >&2; exit 2;;
esac
for tool in /usr/bin/curl /usr/bin/shasum /usr/bin/ditto /usr/bin/codesign /usr/bin/hdiutil /usr/libexec/PlistBuddy; do
  [ -x "$tool" ] || { echo "缺少系统工具：$tool" >&2; exit 2; }
done
mkdir -p "$ROOT/.cache" "$ROOT/dist"
WORK="$(mktemp -d "$ROOT/.cache/focus-build.XXXXXX")"
cleanup(){ [ -z "${WORK:-}" ] || rm -rf "$WORK"; }
trap cleanup EXIT
trap 'printf "\n构建中止（第 %s 行）。没有发布未验证的安装包。\n" "$LINENO" >&2' ERR
ZIP_NAME="electron-v${ELECTRON_VERSION}-darwin-${ARCH}.zip"
ZIP="${FOCUS_ELECTRON_ZIP:-$ROOT/.cache/$ZIP_NAME}"
URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/$ZIP_NAME"

printf '\nFocus %s · macOS %s\n\n[1/6] 获取并验证 Electron 运行库\n' "$VERSION" "$ARCH"
if [ ! -f "$ZIP" ]; then
  if [ -n "${FOCUS_ELECTRON_ZIP:-}" ]; then echo "指定文件不存在：$ZIP" >&2; exit 1; fi
  printf '来源：%s\n首次构建需下载约 130 MB。\n' "$URL"
  /usr/bin/curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --connect-timeout 30 --max-time 1800 --output "$WORK/electron.download.zip" "$URL"
  mv "$WORK/electron.download.zip" "$ZIP"
fi
ACTUAL="$(/usr/bin/shasum -a 256 "$ZIP" | awk '{print $1}')"
if [ "$ACTUAL" != "$SHA" ]; then
  printf '运行库 SHA-256 不匹配，已停止。\n预期：%s\n实际：%s\n请移走不完整的缓存文件并重试：%s\n' "$SHA" "$ACTUAL" "$ZIP" >&2
  exit 1
fi

printf '\n[2/6] 组装 Focus.app\n'
/usr/bin/ditto -x -k "$ZIP" "$WORK/runtime"
[ -d "$WORK/runtime/Electron.app" ] || { echo '运行库中缺少 Electron.app' >&2; exit 1; }
mkdir -p "$WORK/image"
APP="$WORK/image/Focus.app"
mv "$WORK/runtime/Electron.app" "$APP"
RESOURCES="$APP/Contents/Resources"
rm -f "$RESOURCES/default_app.asar"
mkdir -p "$RESOURCES/app/assets"
/usr/bin/ditto "$ROOT/src" "$RESOURCES/app/src"
cp "$ROOT/package.json" "$RESOURCES/app/package.json"
cp "$ROOT/LICENSE" "$RESOURCES/app/LICENSE"
cp "$ROOT/assets/icon.png" "$RESOURCES/app/assets/icon.png"
cp "$ROOT/assets/icon.icns" "$RESOURCES/Focus.icns"
# Preserve upstream runtime licenses in the app, if supplied beside Electron.app.
for license in LICENSE LICENSES.chromium.html; do
  if [ -f "$WORK/runtime/$license" ]; then cp "$WORK/runtime/$license" "$RESOURCES/$license"; fi
done
PLIST="$APP/Contents/Info.plist"
plist_set(){ /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PLIST"; }
plist_set CFBundleName Focus
plist_set CFBundleDisplayName Focus
plist_set CFBundleIdentifier com.focuslocal.desktop
plist_set CFBundleShortVersionString "$VERSION"
plist_set CFBundleVersion "$VERSION"
plist_set CFBundleIconFile Focus.icns
plist_set NSHumanReadableCopyright 'Focus — local-first task management'
# CFBundleExecutable deliberately remains Electron, matching its on-disk binary.
/usr/bin/plutil -lint "$PLIST"

printf '\n[3/6] 本机 ad-hoc 签名与完整性校验（不是 Developer ID 公证）\n'
/usr/bin/codesign --force --deep --sign - --entitlements "$ROOT/assets/entitlements.mac.plist" "$APP"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$APP"

printf '\n[4/6] 原生启动与数据读写检查\n'
if [ "$ARCH" = "$NATIVE_ARCH" ]; then
  # Keep the isolated profile until Electron exits; the build cleanup owns it.
  mkdir -p "$WORK/smoke-tmp"
  TMPDIR="$WORK/smoke-tmp" FOCUS_SMOKE_SCREENSHOT="$WORK/native-smoke.png" "$APP/Contents/MacOS/Electron" --focus-smoke-test
else
  printf '交叉打包 %s；本机为 %s，跳过原生运行检查，安装后仍需在目标 Mac 验证。\n' "$ARCH" "$NATIVE_ARCH"
fi

printf '\n[5/6] 生成拖拽安装 DMG\n'
ln -s /Applications "$WORK/image/Applications"
cat > "$WORK/image/安装说明.txt" <<'TXT'
将 Focus.app 拖到 Applications 后，从“应用程序”打开 Focus。

这是本地测试版本，仅有 ad-hoc 签名，没有 Apple Developer ID 签名/公证。
只有确认来源和文件完整性后，才考虑按 macOS 提示在“隐私与安全性”中批准此 App。
无需关闭系统门禁，也无需运行移除隔离标记的命令。

首次打开是空白工作区，可自愿载入虚构示例。数据保存在本机：
~/Library/Application Support/Focus/
建议通过菜单“文件 → 导出备份”定期保存独立备份。
TXT
DMG_NAME="Focus-${VERSION}-${ARCH}.dmg"
/usr/bin/hdiutil create -volname Focus -srcfolder "$WORK/image" -fs HFS+ -format UDZO "$WORK/$DMG_NAME"

printf '\n[6/6] 验证并输出安装包\n'
/usr/bin/hdiutil verify "$WORK/$DMG_NAME"
[ -s "$WORK/$DMG_NAME" ] || { echo 'DMG 为空，已停止' >&2; exit 1; }
if [ -e "$ROOT/dist/$DMG_NAME" ]; then
  mv "$ROOT/dist/$DMG_NAME" "$ROOT/dist/${DMG_NAME%.dmg}.previous-$(date +%Y%m%d-%H%M%S).dmg"
fi
mv "$WORK/$DMG_NAME" "$ROOT/dist/$DMG_NAME"
(cd "$ROOT/dist" && /usr/bin/shasum -a 256 "$DMG_NAME" > "$DMG_NAME.sha256")
if [ -f "$WORK/native-smoke.png" ]; then cp "$WORK/native-smoke.png" "$ROOT/dist/native-smoke-$ARCH.png"; fi
printf '\n完成：%s/dist/%s\n签名：ad-hoc；未经过 Apple 公证。\n' "$ROOT" "$DMG_NAME"
