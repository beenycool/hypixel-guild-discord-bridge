# Agent Work Log

## Session: Azure Deployment Fixes

### Issue
The Azure Web App deployment was failing with the error:
`Error: Deployment Failed, Error: Multi container support is not available for windows containerized web app or with publish profile.`

### Diagnosis
- The project was configured to use `azure-compose.yml` for deployment.
- The Azure Web App Plan or configuration does not support Docker Compose (Multi-Container) via the Publish Profile method used in GitHub Actions, or specifically for the current App Service configuration.
- The error message explicitly mentions "Multi container support is not available".

### Resolution
1.  **Reverted to Single Container Deployment**:
    - Modified `.github/workflows/deploy-docker.yml` to remove the `configuration-file: azure-compose.yml` input.
    - Restored the `images` input to point directly to the container image (`ghcr.io/beenycool/hypixel-guild-discord-bridge:latest`).

2.  **Startup Command Configuration**:
    - Verified that the Azure Web App has the correct startup command configured via the Azure CLI:
      - `appCommandLine`: `"node --import tsx/esm index.ts"`
    - This ensures the application starts correctly without relying on the `entrypoint` defined in `azure-compose.yml`.

### Current Status
- A new deployment has been triggered via GitHub Actions.
- The workflow is currently running.
