#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

# macOS does not include GNU timeout. This script preserves the original
# three-minute build limit using macOS's bundled Python runtime.
build_timeout="${SITES_BUILD_TIMEOUT:-3m}"
case "${build_timeout}" in
  *s) timeout_seconds="${build_timeout%s}" ;;
  *m) timeout_seconds="$(( ${build_timeout%m} * 60 ))" ;;
  *)
    echo "SITES_BUILD_TIMEOUT must use seconds (for example 30s) or minutes (for example 3m)." >&2
    exit 64
    ;;
esac

echo "Running bounded vinext build..."
python3 -c '
import subprocess
import sys

timeout = int(sys.argv[1])
command = sys.argv[2:]
try:
    subprocess.run(command, check=True, timeout=timeout)
except subprocess.TimeoutExpired:
    print(f"Build timed out after {timeout} seconds.", file=sys.stderr)
    raise SystemExit(124)
' "${timeout_seconds}" "${vinext}" build

"${script_dir}/validate-artifact.sh"
