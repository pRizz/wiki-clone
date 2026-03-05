#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
API_BASE_URL="${API_BASE_URL:-http://localhost:4000/api}"
CONNECTIONS="${CONNECTIONS:-20}"
DURATION_SECONDS="${DURATION_SECONDS:-5}"
KARMA_USER_ID="${KARMA_USER_ID:-1}"

echo "Running perf smoke tests with:"
echo "  BASE_URL=${BASE_URL}"
echo "  API_BASE_URL=${API_BASE_URL}"
echo "  CONNECTIONS=${CONNECTIONS}"
echo "  DURATION_SECONDS=${DURATION_SECONDS}"

echo ""
echo "== /health =="
npx autocannon -d "${DURATION_SECONDS}" -c "${CONNECTIONS}" "${BASE_URL}/health"

echo ""
echo "== /api/articles =="
npx autocannon -d "${DURATION_SECONDS}" -c "${CONNECTIONS}" "${API_BASE_URL}/articles"

echo ""
echo "== /api/karma/users/${KARMA_USER_ID} =="
npx autocannon -d "${DURATION_SECONDS}" -c "${CONNECTIONS}" "${API_BASE_URL}/karma/users/${KARMA_USER_ID}"
