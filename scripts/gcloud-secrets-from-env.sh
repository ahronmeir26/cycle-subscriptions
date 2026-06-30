#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.gcloud}"
PROJECT_ID="${PROJECT_ID:-ai-stone}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}. Copy .env.gcloud.example to ${ENV_FILE} and fill it in." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required=(
  SHOPIFY_CLIENT_ID
  SHOPIFY_CLIENT_SECRET
  DATABASE_URL
)

for name in "${required[@]}"; do
  if [ -z "${!name:-}" ]; then
    echo "${name} is required in ${ENV_FILE}" >&2
    exit 1
  fi
done

upsert_secret() {
  local name="$1"
  local value="$2"

  if ! gcloud secrets describe "${name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "${name}" \
      --project "${PROJECT_ID}" \
      --replication-policy=automatic
  fi

  printf "%s" "${value}" | gcloud secrets versions add "${name}" \
    --project "${PROJECT_ID}" \
    --data-file=-
}

upsert_secret shirt-subscriptions-client-id "${SHOPIFY_CLIENT_ID}"
upsert_secret shirt-subscriptions-client-secret "${SHOPIFY_CLIENT_SECRET}"
upsert_secret shirt-subscriptions-db-url "${DATABASE_URL}"

echo "Secrets updated in ${PROJECT_ID}."
