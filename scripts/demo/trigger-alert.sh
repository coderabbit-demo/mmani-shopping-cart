#!/usr/bin/env bash
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/trigger-alert.mjs" "$@"
