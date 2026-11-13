#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="nova@tobiasguta.github.io"
VERSION="0.6.0-dev"
OUT="${ROOT}/dist/Nova-v${VERSION}-GNOME.zip"

for command in zip glib-compile-schemas; do
    command -v "${command}" >/dev/null 2>&1 || {
        echo "Missing dependency: ${command}" >&2
        exit 1
    }
done

STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT

install -m 0644 "${ROOT}/extension.js" "${STAGE}/extension.js"
install -m 0644 "${ROOT}/metadata.json" "${STAGE}/metadata.json"
install -m 0644 "${ROOT}/prefs.js" "${STAGE}/prefs.js"
install -m 0644 "${ROOT}/stylesheet.css" "${STAGE}/stylesheet.css"
mkdir -p "${STAGE}/lib" "${STAGE}/schemas" "${ROOT}/dist"
for source in "${ROOT}"/lib/*.js; do
    install -m 0644 "${source}" "${STAGE}/lib/$(basename -- "${source}")"
done
install -m 0644 "${ROOT}/schemas/org.gnome.shell.extensions.nova.gschema.xml" \
    "${STAGE}/schemas/org.gnome.shell.extensions.nova.gschema.xml"
glib-compile-schemas --strict "${STAGE}/schemas"

rm -f "${OUT}"
(
    cd "${STAGE}"
    zip -qr "${OUT}" extension.js metadata.json prefs.js stylesheet.css lib schemas
)
test -s "${OUT}"
echo "Packaged ${OUT} for GNOME extension ${UUID}"
