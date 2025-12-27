#!/bin/sh
cd /home/site/wwwroot

# Unset problematic npm config that causes warnings/failures on some platforms
unset npm_config_before

# Note: System dependencies and npm install are already handled in the Dockerfile.
# Running them here again is redundant and slow, which can cause startup timeouts.
# echo "Installing system dependencies..."
# apt-get update && apt-get install -y libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2

# echo "Installing node dependencies..."
# npm install --omit=dev

echo "Starting app..."
npm start
