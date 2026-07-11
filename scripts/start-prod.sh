#!/bin/bash

set -e

ROOT=/root/proman-prod

[ -f /root/.proman-secrets/doppler.env ] && source /root/.proman-secrets/doppler.env
DOPPLER_TOKEN=${DOPPLER_TOKEN:-$DOPPLER_TOKEN_PROD}
: "${DOPPLER_TOKEN:?Set DOPPLER_TOKEN or DOPPLER_TOKEN_PROD in /root/.proman-secrets/doppler.env}"

export DOPPLER_TOKEN

pm2 start /root/proman/ecosystem.prod.config.js
pm2 save
