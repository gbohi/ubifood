#!/bin/bash
# ============================================================
# Restauration d'une sauvegarde Ubifood (base et/ou fichiers).
#
#   bash restaurer.sh /opt/ubifood-backups/base/ubifood_2026-10-20_0200_quotidienne.dump \
#                     [/opt/ubifood-backups/fichiers/media_2026-10-20_0200_quotidienne.tar.gz]
#
# ⚠️ Remplace TOUTES les données actuelles par celles de la sauvegarde.
#    Une sauvegarde de l'état actuel est faite juste avant (« avant-restauration »).
# ============================================================
set -euo pipefail
BASE=${1:?Indiquer le fichier .dump à restaurer}
FICHIERS=${2:-}
BACKEND_DIR=/opt/ubifood/backend
DOSSIER_SCRIPTS=$(cd "$(dirname "$0")" && pwd)

[ -f "$BASE" ] || { echo "Fichier introuvable : $BASE" >&2; exit 1; }
[ -z "$FICHIERS" ] || [ -f "$FICHIERS" ] || { echo "Fichier introuvable : $FICHIERS" >&2; exit 1; }

read -r -p "Remplacer les données actuelles par cette sauvegarde ? Tapez OUI : " reponse
[ "$reponse" = "OUI" ] || { echo "Abandon."; exit 1; }

bash "$DOSSIER_SCRIPTS/sauvegarde.sh" avant-restauration

cd "$BACKEND_DIR"
echo "==> Arrêt de l'API pendant la restauration"
docker compose stop backend nginx
echo "==> Restauration de la base"
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$BASE"
docker compose start backend
if [ -n "$FICHIERS" ]; then
    echo "==> Restauration des fichiers"
    docker compose exec -T backend sh -c 'rm -rf /app/media/* && tar -C /app -xzf -' < "$FICHIERS"
fi
docker compose start nginx
echo "✅ Restauration terminée"
