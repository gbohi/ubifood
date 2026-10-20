#!/bin/bash
# ============================================================
# Sauvegarde d'Ubifood : base PostgreSQL + fichiers envoyés
# (photos des plats et de profil, bannières, fenêtre de connexion,
# documents des besoins, logo).
#
#   bash sauvegarde.sh [libellé]      ex. « avant-deploiement »
#
# Lancé chaque nuit par /etc/cron.d/ubifood-sauvegarde (voir
# server-setup.sh) et avant chaque déploiement.
# Variables (facultatives) :
#   SAUVEGARDE_DIR            dossier local    (défaut /opt/ubifood-backups)
#   SAUVEGARDE_JOURS          jours conservés  (défaut 14)
#   SAUVEGARDE_S3             bucket S3 pour une copie hors du serveur (ex. s3://mon-bucket/ubifood)
#   AWS_REGION                région du bucket
# ============================================================
set -euo pipefail

BACKEND_DIR=/opt/ubifood/backend
DIR=${SAUVEGARDE_DIR:-/opt/ubifood-backups}
JOURS=${SAUVEGARDE_JOURS:-14}
LIBELLE=${1:-quotidienne}
HORODATAGE=$(date +%Y-%m-%d_%H%M)
JOURNAL=/var/log/ubifood-sauvegarde.log

log() { echo "$(date '+%F %T') [$LIBELLE] $*" | tee -a "$JOURNAL"; }
echec() { log "❌ ÉCHEC : $*"; exit 1; }

mkdir -p "$DIR/base" "$DIR/fichiers"
chmod 700 "$DIR"
cd "$BACKEND_DIR"

docker compose ps --status running db | grep -q db || echec "le conteneur PostgreSQL n'est pas démarré"

# ── Base : format personnalisé (compressé, restaurable table par table) ──
BASE="$DIR/base/ubifood_${HORODATAGE}_${LIBELLE}.dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BASE.part" \
    || echec "pg_dump"
# Vérification : le fichier doit être lisible par pg_restore
docker compose exec -T db pg_restore -l < "$BASE.part" > /dev/null \
    || echec "sauvegarde de la base illisible"
mv "$BASE.part" "$BASE"
log "Base sauvegardée : $BASE ($(du -h "$BASE" | cut -f1))"

# ── Fichiers envoyés (volume media) ──
FICHIERS="$DIR/fichiers/media_${HORODATAGE}_${LIBELLE}.tar.gz"
docker compose exec -T backend tar -C /app -czf - media > "$FICHIERS.part" \
    || echec "archive des fichiers"
mv "$FICHIERS.part" "$FICHIERS"
log "Fichiers sauvegardés : $FICHIERS ($(du -h "$FICHIERS" | cut -f1))"

# ── Rotation : on garde les $JOURS derniers jours ──
find "$DIR/base" "$DIR/fichiers" -type f -mtime +"$JOURS" -delete

# ── Copie hors du serveur (perte du disque ou de l'instance) ──
if [ -n "${SAUVEGARDE_S3:-}" ]; then
    aws s3 cp "$BASE" "$SAUVEGARDE_S3/base/" ${AWS_REGION:+--region "$AWS_REGION"} --only-show-errors \
        && aws s3 cp "$FICHIERS" "$SAUVEGARDE_S3/fichiers/" ${AWS_REGION:+--region "$AWS_REGION"} --only-show-errors \
        && log "Copie envoyée vers $SAUVEGARDE_S3" \
        || echec "copie vers $SAUVEGARDE_S3"
fi
log "✅ Sauvegarde terminée"
