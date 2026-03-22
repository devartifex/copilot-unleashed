#!/bin/sh
# Auto-detect deployer's public IP and set DEPLOYER_IP_ADDRESS for azd provision
set -e

CURRENT_IP=$(curl -sf https://api.ipify.org || curl -sf https://checkip.amazonaws.com | tr -d '[:space:]')

if [ -z "$CURRENT_IP" ]; then
  echo "Warning: could not detect public IP, ACR will remain private-only"
  exit 0
fi

echo "Setting DEPLOYER_IP_ADDRESS=$CURRENT_IP"
azd env set DEPLOYER_IP_ADDRESS "$CURRENT_IP"
