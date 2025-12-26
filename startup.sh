#!/bin/sh
cd /home/site/wwwroot
echo "Installing system dependencies..."
apt-get update && apt-get install -y libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2

echo "Installing node dependencies..."
npm install --omit=dev

echo "Starting app..."
npm start
