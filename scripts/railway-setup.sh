#!/bin/bash
set -e

railway variables set \
  WHATSAPP_ACCESS_TOKEN="$WHATSAPP_TOKEN" \
  WHATSAPP_PHONE_NUMBER_ID="1129051206965973" \
  WHATSAPP_BUSINESS_ACCOUNT_ID="1331187315501590" \
  WHATSAPP_WEBHOOK_VERIFY_TOKEN="$WHATSAPP_WEBHOOK_VERIFY_TOKEN" \
  WHATSAPP_API_VERSION="v21.0" \
  POSTGRES_USER="botuser" \
  POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  POSTGRES_DB="botdb" \
  N8N_USER="admin" \
  N8N_PASSWORD="$N8N_PASSWORD" \
  GROQ_API_KEY="gsk_xxxx"

echo "Variáveis setadas. Fazendo deploy..."
railway up --detach
echo "Deploy iniciado. Acompanhe em: https://railway.app/dashboard"
