#!/bin/sh
# Démarrage du conteneur backend : attend PostgreSQL, applique les
# migrations, crée la table de cache, collecte les fichiers statiques.
set -e

echo "⏳ Attente de PostgreSQL ($DB_HOST:$DB_PORT)…"
python - <<'PY'
import os, time, psycopg2
for i in range(30):
    try:
        psycopg2.connect(
            dbname=os.environ["DB_NAME"], user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"], host=os.environ.get("DB_HOST", "db"),
            port=os.environ.get("DB_PORT", "5432"),
        ).close()
        break
    except psycopg2.OperationalError:
        time.sleep(2)
else:
    raise SystemExit("PostgreSQL injoignable")
PY

# Clé Firebase : sans elle, les notifications sont enregistrées en base
# (visibles dans l'app) mais aucune notification push n'est envoyée.
KEY="${FIREBASE_SERVICE_ACCOUNT_KEY:-/app/secrets/firebase-service-account.json}"
if [ ! -f "$KEY" ]; then
    echo "⚠️  Clé Firebase introuvable ($KEY) : notifications push désactivées."
elif [ ! -r "$KEY" ]; then
    echo "⚠️  Clé Firebase illisible par l'utilisateur du conteneur ($KEY) : chmod 644 sur le serveur."
else
    echo "✅ Clé Firebase trouvée : notifications push actives."
fi

python manage.py migrate --noinput
python manage.py createcachetable
python manage.py collectstatic --noinput

exec "$@"
