# Cycle Subscriptions

Embedded Shopify app for managing recurring shirt subscription programs.

The app lets a merchant configure a recurring shirt program, publish a Shopify selling plan group, track paid subscription cycles, and surface milestone rewards such as a free shipment on the 12th paid cycle. The reward rule is configurable and is treated as an operations milestone rather than the whole product.

## Stack

- Shopify embedded app with React Router and App Bridge
- Polaris web components
- Shopify Admin GraphQL selling plans
- Prisma with PostgreSQL
- Google Cloud Run, Cloud Build, Artifact Registry, Secret Manager, and Cloud SQL

## Shopify Scopes

Use these app scopes:

```txt
write_products,read_orders,read_customers,read_own_subscription_contracts,write_own_subscription_contracts
```

## Environment

Copy or edit `.env` for local development:

```sh
cp .env.example .env
```

Paste the Shopify Dev Dashboard values into:

```txt
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
```

`SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` are compatibility aliases for Shopify tooling. Use the same values as the client ID and client secret.

Set `DATABASE_URL` to a local Postgres database or a Cloud SQL Auth Proxy connection.

## Development

```sh
npm install --cache ./.npm-cache
npm run setup
npm run dev
```

Useful checks:

```sh
npm run typecheck
npm run lint
npm run build
```

## Google Cloud

This repo is configured for the existing `glass-pane` GCP project:

- project: `ai-stone`
- region: `us-central1`
- Cloud Run service: `shirt-subscriptions`
- Artifact Registry repo: `shirt-subscriptions`
- Cloud SQL instance: `ai-stone:us-central1:glass-pane-db`
- database: `shirt_subscriptions`

Bootstrap GCP resources:

```sh
PROJECT_ID=ai-stone \
REGION=us-central1 \
AR_REPOSITORY=shirt-subscriptions \
CLOUD_SQL_INSTANCE=glass-pane-db \
CLOUD_SQL_DATABASE=shirt_subscriptions \
./scripts/gcloud-bootstrap.sh
```

Optionally create a dedicated Cloud SQL user in the same step:

```sh
CLOUD_SQL_USER=subscriptions_user \
CLOUD_SQL_PASSWORD='choose-a-strong-password' \
./scripts/gcloud-bootstrap.sh
```

Create a production secret env file:

```sh
cp .env.gcloud.example .env.gcloud
```

Fill in `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, and `DATABASE_URL`, then push the secrets to Secret Manager:

```sh
./scripts/gcloud-secrets-from-env.sh .env.gcloud
```

Deploy:

```sh
gcloud builds submit --config cloudbuild.yaml --project ai-stone
```

After the first deployment, keep `SHOPIFY_APP_URL`, `application_url`, and the redirect URLs in `shopify.app.toml` pointed at `https://cycle-subs.aistone.com`, then run:

```sh
npm run deploy
```

## Git

The intended remote is:

```txt
git@github.com:ahronmeir26/cycle-subscriptions.git
```
