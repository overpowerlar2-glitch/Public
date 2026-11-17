#!/usr/bin/env bash
# Builds the official native Stockfish (full-strength network) into ./bin/stockfish.
# Usage: scripts/build-stockfish.sh [tag] [arch]
#   tag   official release tag, default sf_19 (use "master" for the development version)
#   arch  Stockfish ARCH value, default "native" (e.g. x86-64-avx2, x86-64-bmi2, armv8)
# Needs git, make and a C++17 compiler (g++ or clang++), plus network access for the NNUE file.
set -euo pipefail
TAG="${1:-sf_19}"; ARCH="${2:-native}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.stockfish-src"
rm -rf "$SRC"
git clone --depth 1 --branch "$TAG" https://github.com/official-stockfish/Stockfish.git "$SRC"
cd "$SRC/src"
# The build embeds the neural network. If Stockfish's own download fails (blocked host), fetch the
# same file from the official networks repository on GitHub and verify it by its checksum-derived name.
NET="$(sed -n 's/.*EvalFileDefaultName *"\(nn-[0-9a-f]*\.nnue\)".*/\1/p' evaluate.h | head -1)"
if ! make net >/dev/null 2>&1 || [ ! -s "$NET" ]; then
  echo "Fetching $NET from github.com/official-stockfish/networks"
  curl -fsSL -o "$NET" "https://media.githubusercontent.com/media/official-stockfish/networks/master/$NET"
fi
[ "nn-$(sha256sum "$NET" | cut -c1-12).nnue" = "$NET" ] || { echo "Network file $NET failed its checksum"; exit 1; }
make -j"$(nproc 2>/dev/null || echo 2)" build ARCH="$ARCH"
mkdir -p "$ROOT/bin"
cp stockfish "$ROOT/bin/stockfish"
git -C "$SRC" rev-parse HEAD > "$ROOT/bin/stockfish.commit"
echo "Built $("$ROOT/bin/stockfish" uci </dev/null | head -1) → bin/stockfish"
