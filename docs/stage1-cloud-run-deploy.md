# Stage 1 Cloud Run Deployment Runbook

> **APPROVAL GATE:** This document describes production deployment commands. Run nothing here without reviewing with your team first. Set secrets carefully — never commit secret values to git or share them in chat.

This runbook prepares and deploys the SignalGen Stage 1 hosted agent to Google Cloud Run. It is intentionally written as a reviewable checklist: verify locally first, create cloud resources safely, deploy, bind secrets, then configure Vercel to call the hosted agent.

## 1. Pre-flight checklist

Verify these before deploying:

- [ ] `npm run typecheck` passes in `agent/`
- [ ] `npm test` passes in `agent/`
- [ ] `gcloud auth list` shows the correct account
- [ ] `gcloud config get-value project` shows `signalgen-496700`
- [ ] `gcloud --version` is installed

Suggested local verification commands:

```bash
cd /Users/vivianli/projects/SignalGen/agent
npm run typecheck
npm test

gcloud auth list
gcloud config get-value project
gcloud --version
```

## 2. Enable required Google Cloud services

Enable the required APIs for Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Cloud Logging, and Gemini. This command is safe to re-run because enabling an already-enabled service is idempotent.

```bash
gcloud services enable run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  generativelanguage.googleapis.com \
  --project signalgen-496700
```

## 3. Create secrets in Google Secret Manager

Create the Secret Manager secret slots first, then add secret values separately. Do not paste real secret values into files, git commits, screenshots, or chat.

Create the secret slots:

```bash
# Create secret slots (idempotent on re-run)
gcloud secrets create signalgen-gemini-api-key \
  --replication-policy=automatic \
  --project signalgen-496700

gcloud secrets create signalgen-mongodb-uri \
  --replication-policy=automatic \
  --project signalgen-496700

gcloud secrets create signalgen-agent-worker-secret \
  --replication-policy=automatic \
  --project signalgen-496700
```

If a secret already exists, `gcloud secrets create` may print an already-exists error. That is expected on re-run; continue by adding a new secret version only when you intentionally want to set or rotate the value.

Add the actual secret values using this command shape. Replace each placeholder with the real value only in your local terminal, not in this document.

```bash
# Add the actual secret values — replace <value> with the real value
echo -n "<YOUR_GEMINI_API_KEY>" | \
  gcloud secrets versions add signalgen-gemini-api-key \
    --data-file=- --project signalgen-496700

echo -n "<YOUR_MONGODB_URI>" | \
  gcloud secrets versions add signalgen-mongodb-uri \
    --data-file=- --project signalgen-496700

# Generate a random secret for AGENT_WORKER_SECRET and store it:
echo -n "<GENERATE_A_STRONG_RANDOM_SECRET>" | \
  gcloud secrets versions add signalgen-agent-worker-secret \
    --data-file=- --project signalgen-496700
```

Important: `AGENT_WORKER_SECRET` must also be added to Vercel environment variables so the dashboard can call the hosted agent.

## 4. Deploy to Cloud Run from source

The agent package includes a `Dockerfile` that runs the custom HTTP worker exposing `/health` and `POST /process-run`. Use `gcloud run deploy --source` to build and deploy from the `agent/` directory.

**Why not `adk deploy cloud_run`?**

`adk deploy cloud_run` deploys the ADK built-in API server (`adk api_server`) which exposes ADK-format LLM endpoints — not the custom `/health` and `/process-run` contract that the Vercel dashboard calls. The custom server (`agent/src/server.ts`) must be deployed directly.

**Deploy command:**

```bash
cd /Users/vivianli/projects/SignalGen/agent

# Run local verification first
npm run typecheck
npm test

# Deploy to Cloud Run (builds from Dockerfile in agent/)
gcloud run deploy signalgen-agent \
  --source . \
  --project signalgen-496700 \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated
```

**Notes:**
- `--allow-unauthenticated` allows Vercel to call the service. The service is protected at the application layer by the `AGENT_WORKER_SECRET` Bearer token — Cloud Run IAM is not the auth boundary here.
- `--source .` uses Cloud Build to build from the `Dockerfile` in the current directory.
- The build may take 5–10 minutes on first deploy.
- If you want to use a specific tag: add `--image gcr.io/signalgen-496700/signalgen-agent:latest`.

## 5. Bind secrets to the Cloud Run service after deploy

After the service is deployed, bind the Secret Manager secrets so they are available to the running service as environment variables.

```bash
gcloud run services update signalgen-agent \
  --region us-central1 \
  --project signalgen-496700 \
  --set-secrets GEMINI_API_KEY=signalgen-gemini-api-key:latest,MONGODB_URI=signalgen-mongodb-uri:latest,AGENT_WORKER_SECRET=signalgen-agent-worker-secret:latest
```

Do not put secret values directly in this command. The right-hand side references Secret Manager secret names and versions.

## 6. Verify the deployment

After deployment, get the service URL and test the health endpoint first. Then test `POST /process-run` using a known test run ID and the same worker secret stored in Secret Manager.

```bash
# Get the Cloud Run URL and save it locally for verification commands
CLOUD_RUN_URL=$(gcloud run services describe signalgen-agent \
  --region us-central1 \
  --project signalgen-496700 \
  --format "value(status.url)")

# Test health endpoint
curl -sS "$CLOUD_RUN_URL/health"

# Expected response:
# {"ok":true,"service":"signalgen-agent","runtime":"google-cloud-adk"}

# Test process-run (replace placeholders locally; do not paste real secrets into docs/chat)
curl -sS -X POST "$CLOUD_RUN_URL/process-run" \
  -H "Authorization: Bearer <AGENT_WORKER_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"runId":"<TEST_RUN_ID>"}'
```

## 7. Configure Vercel to use the hosted agent

Add these environment variables to the Vercel project after the Cloud Run URL is known:

```txt
AGENT_WORKER_URL=https://<CLOUD_RUN_URL>/process-run
AGENT_WORKER_SECRET=<same value stored in signalgen-agent-worker-secret>
```

After saving the Vercel environment variables, redeploy the Vercel app so the tick route can read them. The hosted agent path in the Vercel tick route only activates when `AGENT_WORKER_URL` is set. Local development continues without any env vars configured.

## 8. IAM and service account note

The Cloud Run service identity needs permission to read the secrets. After deployment, identify the service account used by the Cloud Run service, then grant it Secret Manager access for each secret.

```bash
# Get the Cloud Run service account (shown after deploy)
# Grant it access to the secrets:
gcloud secrets add-iam-policy-binding signalgen-gemini-api-key \
  --member="serviceAccount:<SERVICE_ACCOUNT_EMAIL>" \
  --role="roles/secretmanager.secretAccessor" \
  --project signalgen-496700

gcloud secrets add-iam-policy-binding signalgen-mongodb-uri \
  --member="serviceAccount:<SERVICE_ACCOUNT_EMAIL>" \
  --role="roles/secretmanager.secretAccessor" \
  --project signalgen-496700

gcloud secrets add-iam-policy-binding signalgen-agent-worker-secret \
  --member="serviceAccount:<SERVICE_ACCOUNT_EMAIL>" \
  --role="roles/secretmanager.secretAccessor" \
  --project signalgen-496700
```

## 9. Open decisions / notes

- The `agent/Dockerfile` compiles TypeScript during the build stage and starts the compiled custom worker with `node dist/src/server.js`.
- Cloud Run invocations bill on active CPU time, not wall-clock time. The service scales to zero between requests, so cold starts of about 2-3 seconds are expected.
- The hosted agent path in the Vercel tick route only activates when `AGENT_WORKER_URL` is set. Local development continues without any env vars configured.

## 10. Final safety checklist before running production commands

Before running any production command from this document, confirm:

- [ ] The commands have been reviewed with your team.
- [ ] You are using the intended Google Cloud account and project.
- [ ] Secret values are entered only in your local terminal or trusted cloud UI.
- [ ] No secret value is committed to git or shared in chat.
- [ ] You understand which steps create resources, deploy code, update Cloud Run, or update Vercel.
