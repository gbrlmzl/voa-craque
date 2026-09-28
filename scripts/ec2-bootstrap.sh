#!/bin/bash
# User data da instancia EC2 de producao (cloud-init, roda uma vez no primeiro boot).
# Mantido aqui so como referencia caso a instancia precise ser recriada — colar
# no campo "User data" do assistente de lancamento (ou --user-data no run-instances).
set -e

apt-get update
apt-get install -y ca-certificates curl unzip

# Docker Engine + plugin docker compose, do repositorio oficial da Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker ubuntu

# AWS CLI v2 (arm64) — o scripts/remote-deploy.sh precisa dele pra autenticar no
# ECR na propria instancia, alem do que o runner do GitHub Actions ja usa por conta.
curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws

mkdir -p /opt/voacraque
