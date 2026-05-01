#!/bin/sh
set -eu

mkdir -p /app/data /app/outputs
chown -R node:node /app/data /app/outputs

exec su node -s /bin/sh -c "$*"
