#!/bin/bash

# This script packages the extension for distribution into build/spaces.zip.
# It can be run from any directory.

set -e

# Run from the directory containing this script (the repo root).
cd "$( dirname "${BASH_SOURCE[0]}" )"

if [[ ! -f "manifest.json" ]]; then
    echo "Error: manifest.json not found in $(pwd)."
    exit 1
fi

# Make sure the manifest version matches the latest CHANGELOG entry.
MANIFEST_VERSION=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' manifest.json)
CHANGELOG_VERSION=$(sed -n 's/^## \[\([^]]*\)\].*/\1/p' CHANGELOG.md | head -n 1)
if [[ "$MANIFEST_VERSION" != "$CHANGELOG_VERSION" ]]; then
    echo "Error: manifest.json version ($MANIFEST_VERSION) does not match latest CHANGELOG.md entry ($CHANGELOG_VERSION)."
    exit 1
fi

OUTPUT="build/spaces.zip"
mkdir -p build
rm -f "$OUTPUT"

echo "Creating $OUTPUT for version $MANIFEST_VERSION..."

zip -r "$OUTPUT" \
    css \
    img \
    js \
    LICENSE \
    manifest.json \
    README.md \
    *.html \
    -x 'img/icon-dev.png'

echo "Package created at $(pwd)/$OUTPUT"
