# typed: true
# frozen_string_literal: true

# Homebrew cask formula for MarkFlow.
# Template used as source for the tap formula at zsxink/homebrew-tap.
# The CI pipeline fills in VERSION, SHA256_ARM, and SHA256_INTEL on each release.

cask "markflow" do
  version "VERSION"

  on_arm do
    url "https://github.com/zsxink/MarkFlow/releases/download/v#{version}/MarkFlow_#{version}_aarch64.dmg",
        verified: "github.com/zsxink/MarkFlow/"
    sha256 "SHA256_ARM"
  end
  on_intel do
    url "https://github.com/zsxink/MarkFlow/releases/download/v#{version}/MarkFlow_#{version}_x86_64.dmg",
        verified: "github.com/zsxink/MarkFlow/"
    sha256 "SHA256_INTEL"
  end

  name "MarkFlow"
  desc "Modern Markdown editor with WYSIWYG and source mode"
  homepage "https://github.com/zsxink/MarkFlow"

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
