#!/usr/bin/env bash
set -euo pipefail

# librsvg2-bin (rsvg-convert) et zbar-tools (zbarimg) servent à vérifier que les
# SVG produits se décodent réellement une fois rastérisés.
sudo apt-get update -qq
sudo apt-get install -y -qq librsvg2-bin zbar-tools

git submodule update --init --recursive
npm install
