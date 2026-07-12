#!/bin/bash
# Bundle size budget check
# Fails if any budget is exceeded

set -e

DIST_DIR="dist"
MAIN_JS_BUDGET_KB=500    # Main entry JS gzip budget
FONT_BUDGET_KB=4096      # Total Chinese font budget (4MB)

echo "=== Bundle Size Check ==="

# Find the main index JS file (largest JS in dist/assets/)
MAIN_JS=$(ls -lS "$DIST_DIR"/assets/index-*.js 2>/dev/null | head -1 | awk '{print $NF}')
if [ -z "$MAIN_JS" ]; then
  echo "ERROR: No main JS file found in $DIST_DIR/assets/"
  exit 1
fi

# Get gzip size
MAIN_GZIP=$(gzip -c "$MAIN_JS" | wc -c | tr -d ' ')
MAIN_GZIP_KB=$((MAIN_GZIP / 1024))

echo "Main JS: ${MAIN_GZIP_KB}KB gzip (budget: ${MAIN_JS_BUDGET_KB}KB)"

if [ "$MAIN_GZIP_KB" -gt "$MAIN_JS_BUDGET_KB" ]; then
  echo "FAIL: Main JS exceeds budget!"
  exit 1
fi

# Check Chinese font sizes
FONT_SIZE=0
for f in "$DIST_DIR"/assets/SourceHanSerif*.woff2; do
  if [ -f "$f" ]; then
    SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null)
    FONT_SIZE=$((FONT_SIZE + SIZE))
  fi
done

FONT_KB=$((FONT_SIZE / 1024))
echo "Chinese fonts: ${FONT_KB}KB (budget: ${FONT_BUDGET_KB}KB)"

if [ "$FONT_KB" -gt "$FONT_BUDGET_KB" ]; then
  echo "FAIL: Chinese fonts exceed budget!"
  exit 1
fi

echo "=== All checks passed ==="
