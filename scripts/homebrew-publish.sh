#!/bin/bash
# shellcheck shell=bash
#
# homebrew-publish.sh — Update Homebrew tap (zsxink/homebrew-tap) on each release.
#
# Prerequisites:
#   - GITHUB_TOKEN with push access to zsxink/homebrew-tap and read on the source release
#   - `gh` on PATH (release assets are fetched through it so draft releases work)
#   - Release tag and artifacts already uploaded on GitHub Releases
#
# Usage:
#   export GITHUB_TOKEN=ghp_xxx
#   ./scripts/homebrew-publish.sh v0.0.4

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <tag>"
  echo "Example: $0 v0.0.4"
  exit 1
fi

TAG="$1"
VERSION="${TAG#v}"
TAP_REPO="zsxink/homebrew-tap"
FORMULA_FILE="Casks/m/markflow.rb"
SOURCE_REPO="zsxink/MarkFlow"

echo "=== Publishing MarkFlow ${VERSION} to ${TAP_REPO} ==="

WORKDIR=$(mktemp -d)
# shellcheck disable=SC2064
trap 'rm -rf "$WORKDIR"' EXIT

git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${TAP_REPO}.git" "$WORKDIR" --depth=1

# Download DMGs and compute SHA256
SHA_ARM=""
SHA_INTEL=""

# 资产要带鉴权取，不能用 releases/download/<tag>/<file> 这条公开 URL。
# 发布流水线以 releaseDraft: true 建 release，草稿状态下公开 URL 一律 404，
# 于是 homebrew job 会误判「没有 macOS DMG」（Issue #320）。
# `gh release download` 认 GITHUB_TOKEN，草稿资产也能拉，且不用自己解析 JSON。
download_sha() {
  local arch="$1"   # aarch64 or x86_64
  local dmg_name="MarkFlow_${VERSION}_${arch}.dmg"
  echo "Downloading ${dmg_name}..." >&2
  if ! gh release download "$TAG" \
      --repo "$SOURCE_REPO" \
      --pattern "$dmg_name" \
      --dir "$WORKDIR" \
      --clobber 2>/dev/null; then
    echo "Warning: ${dmg_name} not found in release ${TAG} — skipping ${arch} build" >&2
    return 1
  fi
  if [ ! -s "${WORKDIR}/${dmg_name}" ]; then
    echo "Warning: ${dmg_name} downloaded empty — skipping ${arch} build" >&2
    rm -f "${WORKDIR}/${dmg_name}"
    return 1
  fi
  local sha
  sha=$(sha256sum "${WORKDIR}/${dmg_name}" | cut -d' ' -f1)
  rm -f "${WORKDIR}/${dmg_name}"
  echo "$sha"
  return 0
}

echo "Downloading ARM DMG..." >&2
SHA_ARM=$(download_sha "aarch64" || true)

echo "Downloading Intel DMG..." >&2
SHA_INTEL=$(download_sha "x86_64" || true)

if [ -z "$SHA_ARM" ] && [ -z "$SHA_INTEL" ]; then
  echo "Error: No macOS DMGs found for ${TAG}" >&2
  exit 1
fi

# Build the formula
cat > "${WORKDIR}/${FORMULA_FILE}" << RUBY
# typed: true
# frozen_string_literal: true

cask "markflow" do
  version "${VERSION}"

$(if [ -n "$SHA_ARM" ]; then
  echo "  on_arm do"
  echo "    url \"https://github.com/${SOURCE_REPO}/releases/download/v#{version}/MarkFlow_#{version}_aarch64.dmg\""
  echo "    sha256 \"${SHA_ARM}\""
  echo "  end"
fi)
$(if [ -n "$SHA_INTEL" ]; then
  echo "  on_intel do"
  echo "    url \"https://github.com/${SOURCE_REPO}/releases/download/v#{version}/MarkFlow_#{version}_x86_64.dmg\""
  echo "    sha256 \"${SHA_INTEL}\""
  echo "  end"
fi)

  name "MarkFlow"
  desc "Modern Markdown editor with WYSIWYG and source mode"
  homepage "https://github.com/${SOURCE_REPO}"

  livecheck do
    url :stable
    strategy :github_latest
  end

  auto_updates true

  app "MarkFlow.app"

  uninstall quit: "com.markflow.editor"

  zap trash: [
    "~/Library/Application Support/com.markflow.editor",
    "~/Library/Caches/com.markflow.editor",
    "~/Library/HTTPStorages/com.markflow.editor",
    "~/Library/Preferences/com.markflow.editor.plist",
    "~/Library/Saved Application State/com.markflow.editor.savedState",
    "~/Library/Logs/MarkFlow",
  ]
end
RUBY

# Commit and push
cd "$WORKDIR"
git add "$FORMULA_FILE"
git -c user.name="MarkFlow Bot" \
    -c user.email="bot@markflow.app" \
    commit -m "Update MarkFlow to ${VERSION}"
git push origin HEAD:main

echo "=== Done! Published MarkFlow ${VERSION} to ${TAP_REPO} ==="
echo "Install with: brew install zsxink/tap/markflow"
