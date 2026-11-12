#!/usr/bin/env bash
set -euo pipefail

UUID="nova@tobiasguta.github.io"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

if ! command -v gnome-extensions >/dev/null 2>&1; then
    echo "Nova needs GNOME Shell (gnome-extensions command not found)." >&2
    exit 1
fi

mkdir -p "${TARGET_DIR}/lib"
for file in extension.js metadata.json stylesheet.css; do
    install -m 0644 "${SOURCE_DIR}/${file}" "${TARGET_DIR}/${file}"
done
# Always install every runtime module so adding a new import cannot silently
# break installed copies of Nova (e.g. lib/geometry.js).
for file in "${SOURCE_DIR}"/lib/*.js; do
    install -m 0644 "${file}" "${TARGET_DIR}/lib/$(basename -- "${file}")"
done

echo "Installed Nova to ${TARGET_DIR}"
echo "Log out and back in (Wayland), then run:"
echo "  gnome-extensions enable ${UUID}"
