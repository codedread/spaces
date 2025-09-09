#!/bin/bash

# This script packages the extension for distribution.
# It can be run from any directory.

# Save the current working directory
ORIGINAL_DIR=$(pwd)

# Get the directory of the script itself
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# The parent directory of the 'spaces' directory is where we want to run the zip command from.
PARENT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to the parent directory
cd "$PARENT_DIR"

set -e

if [[ ! -d "spaces" || ! -f "spaces/manifest.json" ]]; then
    echo "Error: 'spaces' directory not found."
    # Restore the directory before exiting
    cd "$ORIGINAL_DIR"
    exit 1
fi

echo "Creating spaces.zip in $(pwd)..."

# Create the zip file, including the 'spaces' directory and specified files.
zip -r spaces.zip \
    spaces/css \
    spaces/img \
    spaces/js \
    spaces/LICENSE \
    spaces/manifest.json \
    spaces/README.md \
    spaces/*.html

echo "Package created at spaces.zip"

# Restore the original working directory
cd "$ORIGINAL_DIR"

echo "Returned to $(pwd)"