#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ai-stone}"
REGION="${REGION:-us-central1}"
AR_REPOSITORY="${AR_REPOSITORY:-shirt-subscriptions}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-glass-pane-db}"
CLOUD_SQL_DATABASE="${CLOUD_SQL_DATABASE:-shirt_subscriptions}"
CLOUD_SQL_USER="${CLOUD_SQL_USER:-}"
CLOUD_SQL_PASSWORD="${CLOUD_SQL_PASSWORD:-}"

gcloud config set project "${PROJECT_ID}"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com

if ! gcloud artifacts repositories describe "${AR_REPOSITORY}" \
  --project "${PROJECT_ID}" \
  --location "${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${AR_REPOSITORY}" \
    --project "${PROJECT_ID}" \
    --repository-format=docker \
    --location "${REGION}"
fi

if ! gcloud sql databases describe "${CLOUD_SQL_DATABASE}" \
  --project "${PROJECT_ID}" \
  --instance "${CLOUD_SQL_INSTANCE}" >/dev/null 2>&1; then
  gcloud sql databases create "${CLOUD_SQL_DATABASE}" \
    --project "${PROJECT_ID}" \
    --instance "${CLOUD_SQL_INSTANCE}"
fi

if [ -n "${CLOUD_SQL_USER}" ]; then
  if [ -z "${CLOUD_SQL_PASSWORD}" ]; then
    echo "CLOUD_SQL_PASSWORD is required when CLOUD_SQL_USER is set." >&2
    exit 1
  fi

  if ! gcloud sql users list \
    --project "${PROJECT_ID}" \
    --instance "${CLOUD_SQL_INSTANCE}" \
    --format="value(name)" | grep -Fx "${CLOUD_SQL_USER}" >/dev/null; then
    gcloud sql users create "${CLOUD_SQL_USER}" \
      --project "${PROJECT_ID}" \
      --instance "${CLOUD_SQL_INSTANCE}" \
      --password="${CLOUD_SQL_PASSWORD}"
  fi
fi

echo "GCP resources are ready. Create/update secrets next, then run:"
echo "gcloud builds submit --config cloudbuild.yaml --project ${PROJECT_ID}"
