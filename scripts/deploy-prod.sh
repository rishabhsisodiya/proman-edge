#!/bin/bash

set -e

TARGET=${1:-all}  # all | backend | frontend

ROOT=/Users/rishabhsisodiya/PROMAN-prod

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
  npm run build
  echo "✓ Backend built"
}

build_frontend() {
  echo "==> Building frontend..."
  cd $ROOT/frontend
  npm install
  npm run build
  echo "✓ Frontend built"
}

restart() {
  echo "==> Reloading pm2..."
  pm2 reload proman-prod-backend proman-prod-frontend
  pm2 status
}

pull

case $TARGET in
  backend)
    build_backend
    pm2 reload proman-prod-backend
    ;;
  frontend)
    build_frontend
    pm2 reload proman-prod-frontend
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
