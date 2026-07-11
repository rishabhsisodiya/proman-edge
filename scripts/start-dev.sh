#!/bin/bash

set -e

ROOT=/root/proman

[ -f /root/.proman-secrets/doppler.env ] && source /root/.proman-secrets/doppler.env
DOPPLER_TOKEN=${DOPPLER_TOKEN:-$DOPPLER_TOKEN_DEV}
: "${DOPPLER_TOKEN:?Set DOPPLER_TOKEN or DOPPLER_TOKEN_DEV in /root/.proman-secrets/doppler.env}"

export DOPPLER_TOKEN

pm2 start "$ROOT/ecosystem.config.js"
pm2 save
