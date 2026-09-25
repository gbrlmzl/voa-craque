#!/bin/bash
# Roda no host de producao (via SSM), disparado pelo workflow de deploy.
# Espera AWS_REGION, ECR_REGISTRY, ECR_REPOSITORY e IMAGE_TAG no ambiente.
set -euo pipefail

cd "$(dirname "$0")/.."

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

export APP_IMAGE="$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"

docker compose -f docker-compose.yml -f docker-compose.prod.yml pull app
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker image prune -f
