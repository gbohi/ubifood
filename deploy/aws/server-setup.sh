#!/bin/bash
# ============================================================
# Installation / mise à jour d'Ubifood sur l'instance EC2.
# Exécuté en root par deploy.py (AWS Systems Manager, pas de SSH).
#
#   bash server-setup.sh <region> <ip_publique>
#
# Idempotent : peut être relancé à chaque mise à jour.
# Les secrets viennent d'AWS SSM Parameter Store (/ubifood/...).
# ============================================================
set -euo pipefail

REGION="$1"
PUBLIC_IP="$2"
APP_DIR=/opt/ubifood
BACKEND_DIR="$APP_DIR/backend"
export DEBIAN_FRONTEND=noninteractive

echo "==> Swap (le build Angular demande de la mémoire)"
if ! swapon --show | grep -q /swapfile; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Paquets (Docker, AWS CLI)"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    apt-get update -q
    apt-get install -y -q docker.io docker-compose-v2 git curl
    systemctl enable --now docker
fi
if ! command -v aws >/dev/null; then
    snap install aws-cli --classic
fi

echo "==> Secrets depuis SSM Parameter Store"
param() {
    aws ssm get-parameter --region "$REGION" --name "/ubifood/$1" \
        --with-decryption --query Parameter.Value --output text 2>/dev/null || true
}
SECRET_KEY=$(param SECRET_KEY)
DB_PASSWORD=$(param DB_PASSWORD)
DOMAIN=$(param DOMAIN)
ALLMYSMS_LOGIN=$(param ALLMYSMS_LOGIN)
ALLMYSMS_API_KEY=$(param ALLMYSMS_API_KEY)
if [ -z "$SECRET_KEY" ] || [ -z "$DB_PASSWORD" ]; then
    echo "❌ /ubifood/SECRET_KEY ou /ubifood/DB_PASSWORD absent de SSM" >&2
    exit 1
fi

HOSTS="$PUBLIC_IP,localhost"
ORIGINS="http://$PUBLIC_IP"
if [ -n "$DOMAIN" ]; then
    HOSTS="$HOSTS,$DOMAIN"
    ORIGINS="$ORIGINS,http://$DOMAIN,https://$DOMAIN"
fi

umask 077
cat > "$BACKEND_DIR/.env" <<EOF
# Généré par deploy/aws/server-setup.sh — ne pas modifier à la main
# (les valeurs viennent de AWS SSM Parameter Store /ubifood/...)
SECRET_KEY=$SECRET_KEY
DEBUG=False
ALLOWED_HOSTS=$HOSTS
USE_HTTPS=False
DB_NAME=ubifood
DB_USER=ubifood
DB_PASSWORD=$DB_PASSWORD
DB_HOST=db
DB_PORT=5432
CORS_ALLOWED_ORIGINS=$ORIGINS
CSRF_TRUSTED_ORIGINS=$ORIGINS
ALLMYSMS_LOGIN=$ALLMYSMS_LOGIN
ALLMYSMS_API_KEY=$ALLMYSMS_API_KEY
ALLMYSMS_SENDER=UbiFood
FIREBASE_SERVICE_ACCOUNT_KEY=/app/secrets/firebase-service-account.json
EOF
umask 022

mkdir -p "$BACKEND_DIR/secrets"
FIREBASE_KEY=$(param FIREBASE_KEY)
if [ -n "$FIREBASE_KEY" ]; then
    printf '%s' "$FIREBASE_KEY" > "$BACKEND_DIR/secrets/firebase-service-account.json"
    chmod 644 "$BACKEND_DIR/secrets/firebase-service-account.json"
    echo "Clé Firebase installée."
else
    echo "⚠️  /ubifood/FIREBASE_KEY absent : notifications push désactivées."
fi

echo "==> Construction et démarrage (PostgreSQL, Django, Nginx + site Angular)"
cd "$BACKEND_DIR"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

echo "==> Attente de l'API"
for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/api/users/me/ || true)
    [ "$code" = "401" ] && break
    sleep 5
done
[ "$code" = "401" ] || { docker compose logs --tail 80 backend; echo "❌ API injoignable" >&2; exit 1; }

echo "==> Compte super administrateur"
ADMIN_PASSWORD=$(param ADMIN_PASSWORD)
docker compose exec -T -e ADMIN_PASSWORD="$ADMIN_PASSWORD" backend python manage.py shell -c "
import os
from django.contrib.auth.models import Group
from api.models import Statut, User
if not User.objects.filter(username='admin').exists():
    statut, _ = Statut.objects.get_or_create(libelle_statut='Actif')
    u = User.objects.create_superuser(
        username='admin', email='', password=os.environ['ADMIN_PASSWORD'],
        nom='Administrateur', prenom='', contact='', poste_telephone='', statut=statut)
    u.groups.add(Group.objects.get(name='super_admin'))
    print('Compte admin créé.')
else:
    print('Compte admin déjà présent.')
"

echo "==> Sauvegarde quotidienne de la base (7 jours conservés)"
mkdir -p /opt/ubifood-backups
cat > /etc/cron.d/ubifood-backup <<'EOF'
# Dump PostgreSQL chaque nuit à 2h, conservé 7 jours
0 2 * * * root cd /opt/ubifood/backend && docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > /opt/ubifood-backups/ubifood-$(date +\%F).sql.gz && find /opt/ubifood-backups -name '*.sql.gz' -mtime +7 -delete
EOF
chmod 644 /etc/cron.d/ubifood-backup

docker compose ps
echo "✅ Ubifood déployé : http://$PUBLIC_IP"
