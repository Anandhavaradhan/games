#!/usr/bin/env bash
# Downloads the libraries the game loads from CDNs, so the app can serve them from inside the APK.
# Keep the versions in step with hollowmere-v3 (THREE in index.html, SDK in cloud.js / multiplayer.js).
set -euo pipefail
cd "$(dirname "$0")"
THREE=0.160.0
FB=12.19.0
mkdir -p vendor/firebasejs
curl -fsSL "https://cdn.jsdelivr.net/npm/three@$THREE/build/three.module.js" -o vendor/three.module.js
for m in firebase-app firebase-auth firebase-firestore firebase-database; do
  curl -fsSL "https://www.gstatic.com/firebasejs/$FB/$m.js" -o "vendor/firebasejs/$m.js"
done
# a module may import further files next to it; fetch any it names
for f in vendor/firebasejs/*.js; do
  grep -oE "https://www.gstatic.com/firebasejs/$FB/[a-z0-9_.-]+\.js" "$f" | sort -u | while read -r u; do
    n=vendor/firebasejs/$(basename "$u"); [ -f "$n" ] || curl -fsSL "$u" -o "$n"
  done
done
ls -la vendor vendor/firebasejs
