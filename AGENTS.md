# Agent Notes

## Hosting and Deployment

- This app is hosted on Google Cloud Run, not Vercel.
- Google Cloud project ID: `ai-stone`.
- Google Cloud project number: `96299311297`.
- Cloud Run region: `us-central1`.
- Cloud Run service: `shirt-subscriptions`.
- Artifact Registry repository: `shirt-subscriptions`.
- Native Cloud Run URL: `https://shirt-subscriptions-r7havy3edq-uc.a.run.app`.
- Public Shopify app URL in repo config: `https://cycle-subs.aistone.com`.
- `glass-pane` is part of the existing infrastructure naming, including Cloud SQL instance `ai-stone:us-central1:glass-pane-db`; it is not a separate visible GCP project in this environment.

Deployment is defined by `cloudbuild.yaml`. It builds the Docker image, pushes it to Artifact Registry, and deploys Cloud Run with Secret Manager values and the Cloud SQL instance attached.

Manual deploy command:

```sh
gcloud builds submit \
  --config cloudbuild.yaml \
  --project ai-stone \
  --service-account projects/ai-stone/serviceAccounts/glass-pane-github-deployer@ai-stone.iam.gserviceaccount.com
```

Push-to-`origin/main` deploys are handled by `.github/workflows/deploy-cloud-run.yml`. The workflow authenticates to Google Cloud using GitHub Actions OIDC:

- Workload identity pool: `projects/96299311297/locations/global/workloadIdentityPools/github-pool`.
- Provider: `cycle-subscriptions-provider`.
- Provider condition: `assertion.repository=='ahronmeir26/cycle-subscriptions' && assertion.ref=='refs/heads/main'`.
- Deploy service account: `glass-pane-github-deployer@ai-stone.iam.gserviceaccount.com`.
- The service account has `roles/iam.workloadIdentityUser` granted to `principalSet://iam.googleapis.com/projects/96299311297/locations/global/workloadIdentityPools/github-pool/attribute.repository/ahronmeir26/cycle-subscriptions`.

Cloud Build push triggers were not firing for this repo because `ahronmeir26/cycle-subscriptions` was not connected as a Cloud Build repository mapping. Existing Cloud Build triggers in `ai-stone` were for other repos, including `ahronmeir26/glass_pane_kiosk`.

As of 2026-07-01, a manual Cloud Build deploy succeeded with build ID `12fa8dca-1dac-44ab-8f5b-29c14107651e`, deploying Cloud Run revision `shirt-subscriptions-00004-rqb` at 100% traffic.
