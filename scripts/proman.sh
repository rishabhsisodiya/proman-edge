#!/bin/bash
# Usage: ./scripts/proman.sh <dev|prod> <check|delete|start|deploy|status|logs> [backend|frontend]

set -e

ENV=$1
ACTION=$2
TARGET=${3:-all}   # only used by deploy: all | backend | frontend

if [ -z "$ENV" ] || [ -z "$ACTION" ]; then
  echo "Usage: $0 <dev|prod> <check|delete|start|deploy|status|logs> [backend|frontend]"
  exit 1
fi

[ -f /root/.proman-secrets/doppler.env ] && source /root/.proman-secrets/doppler.env

case $ENV in
  dev)
    ROOT=/root/proman
    ECOSYSTEM=/root/proman/ecosystem.config.js
    DOPPLER_CONFIG=dev
    DOPPLER_TOKEN=${DOPPLER_TOKEN_DEV:?DOPPLER_TOKEN_DEV not set in /root/.proman-secrets/doppler.env}
    BACKEND=proman-backend
    FRONTEND=proman-frontend
    ;;
  prod)
    ROOT=/root/proman-prod
    ECOSYSTEM=/root/proman/ecosystem.prod.config.js
    DOPPLER_CONFIG=prd
    DOPPLER_TOKEN=${DOPPLER_TOKEN_PROD:?DOPPLER_TOKEN_PROD not set in /root/.proman-secrets/doppler.env}
    BACKEND=proman-prod-backend
    FRONTEND=proman-prod-frontend
    ;;
  *)
    echo "Unknown env: $ENV (expected dev|prod)"
    exit 1
    ;;
esac

export DOPPLER_TOKEN

check() {
  echo "==> Checking Doppler secrets for [$DOPPLER_CONFIG]..."
  doppler secrets --project proman --config "$DOPPLER_CONFIG" --token="$DOPPLER_TOKEN"
}

delete() {
  echo "==> Deleting pm2 processes [$BACKEND, $FRONTEND]..."
  pm2 delete "$BACKEND" "$FRONTEND" || true
}

start() {
  echo "==> Starting pm2 processes from $ECOSYSTEM..."
  pm2 start "$ECOSYSTEM"
  pm2 save
}

deploy() {
  echo "==> Pulling latest code..."
  cd "$ROOT"
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git pull origin "$BRANCH"

  build_backend() {
    echo "==> Building backend..."
    cd "$ROOT/backend"
    npm install
    doppler run --token="$DOPPLER_TOKEN" -- npm run build
    echo "✓ Backend built"
  }

  build_frontend() {
    echo "==> Building frontend..."
    cd "$ROOT/frontend"
    npm install
    doppler run --token="$DOPPLER_TOKEN" -- npm run build
    echo "✓ Frontend built"
  }

  case $TARGET in
    backend)
      build_backend
      pm2 reload "$BACKEND"
      ;;
    frontend)
      build_frontend
      pm2 reload "$FRONTEND"
      ;;
    all)
      build_backend
      build_frontend
      pm2 reload "$BACKEND" "$FRONTEND"
      ;;
    *)
      echo "Usage: $0 $ENV deploy [all|backend|frontend]"
      exit 1
      ;;
  esac
  pm2 status
}

status() {
  pm2 status
}

logs() {
  pm2 logs "$BACKEND" "$FRONTEND" --lines 50 --nostream
}

case $ACTION in
  check)  check ;;
  delete) delete ;;
  start)  start ;;
  deploy) deploy ;;
  status) status ;;
  logs)   logs ;;
  *)
    echo "Unknown action: $ACTION (expected check|delete|start|deploy|status|logs)"
    exit 1
    ;;
esac

echo "==> Done."
