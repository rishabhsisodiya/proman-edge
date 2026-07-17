#!/bin/bash

set -e

TARGET=${1:-all}  # all | backend | frontend

ROOT=/root/proman

[ -f /root/.proman-secrets/doppler.env ] && source /root/.proman-secrets/doppler.env
DOPPLER_TOKEN=${DOPPLER_TOKEN:-$DOPPLER_TOKEN_DEV}
: "${DOPPLER_TOKEN:?Set DOPPLER_TOKEN or DOPPLER_TOKEN_DEV in /root/.proman-secrets/doppler.env}"

pull() {
  cd $ROOT
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  echo "==> Pulling latest code (branch: $BRANCH)..."
  git pull origin "$BRANCH"
}

build_backend() {
  echo "==> Building backend..."
  cd $ROOT/backend
  npm install
  doppler run --token="$DOPPLER_TOKEN" -- npm run build
  echo "✓ Backend built"
}

build_frontend() {
  echo "==> Building frontend..."
  cd $ROOT/frontend
  npm install
  doppler run --token="$DOPPLER_TOKEN" -- npm run build
  echo "✓ Frontend built"
}

restart() {
  echo "==> Reloading pm2..."
  pm2 reload all
  pm2 status
}

pull

case $TARGET in
  backend)
    build_backend
    pm2 reload proman-backend
    ;;
  frontend)
    build_frontend
    pm2 reload proman-frontend
    ;;
  all)
    build_backend
    build_frontend
    restart
    ;;
  *)
    echo "Usage: $0 [all|backend|frontend]"
    exit 1
    ;;
esac

echo "==> Done. Logs: pm2 logs"
