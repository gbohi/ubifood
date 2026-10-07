# Ubifood — gestion de la cantine

Monorepo de l'application Ubifood :

| Dossier    | Contenu                                                        |
|------------|----------------------------------------------------------------|
| `backend/` | API Django REST Framework + PostgreSQL, déployée avec Docker   |
| `web/`     | Back-office Angular 18 (gestionnaires, administrateurs, employés) |
| `mobile/`  | Application Flutter (employés et gestionnaires)               |

---

## ⚠️ Sécurité — actions à faire

Le fichier `backend/backend/.env` et une clé API AllMySMS ont été publiés
dans l'historique Git d'un dépôt public. Les supprimer du dépôt ne suffit
pas : **il faut changer ces secrets**.

1. **Nouvelle `SECRET_KEY` Django**
   `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`
2. **Nouveau mot de passe PostgreSQL** :
   `ALTER USER <utilisateur> WITH PASSWORD '<nouveau>';` puis mettre à jour `DB_PASSWORD`.
3. **Nouvelle clé API AllMySMS** (depuis l'espace client AllMySMS), dans
   `ALLMYSMS_API_KEY` du `.env`.
4. **Purge de l'historique Git (recommandé)**, avec
   [git filter-repo](https://github.com/newren/git-filter-repo) :
   ```bash
   git clone --mirror https://github.com/gbohi/ubifood.git
   cd ubifood.git
   git filter-repo --invert-paths \
     --path backend/backend/.env --path backend/venv \
     --path backend/backend/media --path backend/backend/api/hash_password.py \
     --path-glob '*__pycache__*'
   git push --force --mirror
   ```
   Chaque personne ayant un clone local devra ensuite le recloner.

---

## Rôles

Les rôles sont les groupes Django (à créer dans l'admin Django s'ils n'existent pas) :

| Rôle           | Droits |
|----------------|--------|
| `super_admin`  | Tout, y compris gérer les autres administrateurs et attribuer `super_admin` |
| `admin`        | Administration : utilisateurs, référentiels, véhicules, RH, plan comptable |
| `gestionnaire` | Cantine : plats, menus, retraits, tableau de bord, facturation |
| `employe`      | Commander / annuler ses repas, gérer ses allergies, ses besoins |

Le backend applique ces règles sur chaque endpoint ; le web et le mobile
masquent en plus les écrans non autorisés.

---

## Backend (Django)

### Développement local

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example backend/.env       # puis renseigner les valeurs (DB_HOST=localhost, DEBUG=True)
cd backend
python manage.py migrate
python manage.py createcachetable
python manage.py createsuperuser
python manage.py runserver
```

Tests : `python manage.py test api`

### Production (Docker)

```bash
cd backend
cp .env.example .env               # renseigner les valeurs
cp /chemin/firebase-service-account.json .   # clé Firebase (non versionnée)
docker compose up -d --build
docker compose exec backend python manage.py createsuperuser   # 1re fois
```

Le conteneur applique les migrations, crée la table de cache et collecte
les fichiers statiques à chaque démarrage.

> Le fichier `.env` se trouve désormais dans `backend/` (à côté de
> `docker-compose.yml`) et non plus dans `backend/backend/`.

### HTTPS (fortement recommandé)

Tant que l'API est en HTTP, mots de passe et jetons circulent en clair.

1. Faire pointer un nom de domaine (ex. `api.mondomaine.com`) vers le serveur.
2. Obtenir un certificat :
   ```bash
   docker run --rm -v /etc/letsencrypt:/etc/letsencrypt \
     -v "$PWD/nginx/certbot:/var/www/certbot" certbot/certbot certonly \
     --webroot -w /var/www/certbot -d api.mondomaine.com
   ```
3. Dans `nginx/nginx.conf` : décommenter le bloc `server { listen 443 … }`
   et la redirection HTTP → HTTPS.
4. Dans `.env` : `USE_HTTPS=True`, ajouter le domaine à `ALLOWED_HOSTS`,
   `CORS_ALLOWED_ORIGINS` et `CSRF_TRUSTED_ORIGINS`.
5. Mettre l'URL `https://` dans `web/src/environments/*.ts` et
   `mobile/lib/core/config.dart`, puis supprimer l'exception HTTP de
   `mobile/android/app/src/main/res/xml/network_security_config.xml`.

---

## Web (Angular)

```bash
cd web
npm ci
npm start                                   # développement
npx ng build --configuration production     # build → dist/
```

L'URL de l'API est dans `src/environments/environment*.ts`.

---

## Mobile (Flutter 3.22)

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter run
```

L'URL de l'API est dans `lib/core/config.dart`.

### APK / AAB de production

Créer une clé de signature (une seule fois, à conserver précieusement) :

```bash
keytool -genkey -v -keystore ~/ubifood-release.jks -keyalg RSA \
  -keysize 2048 -validity 10000 -alias ubifood
```

Puis créer `mobile/android/key.properties` (non versionné) :

```properties
storePassword=...
keyPassword=...
keyAlias=ubifood
storeFile=/chemin/vers/ubifood-release.jks
```

`flutter build appbundle` signe alors avec cette clé.

> L'identifiant Android est encore `com.example.ubifood`, refusé par le
> Play Store. Le changer implique d'enregistrer une nouvelle application
> Android dans Firebase et de remplacer `google-services.json`.
