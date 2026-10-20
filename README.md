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
| `gestionnaire` | Cantine **de son agence uniquement** (agence de rattachement en cours) : plats, menus, planning, commandes, retraits, tableau de bord, facturation. Factures officielles : seulement celles qui ne concernent que son agence. L'administrateur voit toutes les agences |
| `employe`      | Commander / annuler ses repas (web « Commander » ou mobile, dans n'importe quelle agence), gérer ses allergies, ses besoins |

Le backend applique ces règles sur chaque endpoint ; le web et le mobile
masquent en plus les écrans non autorisés.

---

## Facturation des repas

Calculée uniquement par le serveur (`backend/backend/api/facturation.py`) ;
le web, le mobile et le tableau de bord affichent ce résultat.

- **Règle :** chaque repas commandé et non annulé (en attente ou retiré) est
  facturé, avec les tarifs en vigueur **à la date du menu** :
  - à l'**agent** : tarif de sa catégorie salarié ;
  - par le **prestataire** rattaché à l'agence du menu : tarif de ce
    prestataire (page « Facturation prestataire »).
- **Clôture mensuelle** (administrateurs, page web « Facturation commandes ») :
  fige la facture de chaque agent et de chaque prestataire. Les changements de
  tarif, de catégorie ou de rattachement d'agence faits ensuite ne modifient
  plus ce mois. Un mois ne peut être clôturé qu'une fois terminé, une seule
  fois, et seulement si chaque repas a un tarif agent, un prestataire et un
  tarif prestataire (sinon la liste des éléments à corriger est affichée).
- Après clôture, les commandes du mois ne sont plus modifiables, et un agent ou
  un prestataire facturé ne peut plus être supprimé (désactiver l'agent).
- **Facture prestataire PDF** : chaque prestataire reçoit à la clôture une
  facture numérotée `FP-AAAA-MM-NNN`, téléchargeable sur la page
  « Facturation prestataire » (bloc « Factures officielles »). Le PDF est
  généré par le serveur à partir de la facture figée.
- **En-tête des factures** : Paramètres → Société (nom, adresse, ville,
  téléphone, e-mail, site, N° contribuable, RCCM, logo, mentions de bas de
  page). Modifiable à tout moment par un administrateur : les factures
  téléchargées ensuite utilisent les nouvelles informations.
- **Coordonnées du prestataire** (contact, adresse, téléphone, e-mail,
  N° contribuable, RCCM) : fiche prestataire, Paramètres → Prestataires.
  Elles figurent aussi sur la facture PDF.

---

## Bannières de l'application mobile

Les bannières qui défilent en haut de l'accueil mobile se gèrent sur le web,
Paramètres → Bannières mobile (administrateurs) : image paysage
(≈ 1200 × 520 px, PNG / JPEG / WebP, 5 Mo maximum), ordre d'affichage,
activation et période facultative (ex. une fête). Sans bannière active,
l'accueil n'en affiche aucune.

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
mkdir -p secrets
cp /chemin/firebase-service-account.json secrets/   # clé Firebase (non versionnée)
chmod 644 secrets/firebase-service-account.json     # lisible par le conteneur
docker compose up -d --build
docker compose exec backend python manage.py createsuperuser   # 1re fois
```

Le conteneur applique les migrations, crée la table de cache et collecte
les fichiers statiques à chaque démarrage.

> Le fichier `.env` se trouve désormais dans `backend/` (à côté de
> `docker-compose.yml`) et non plus dans `backend/backend/`.

### Déploiement automatisé sur AWS EC2

`deploy/aws/deploy.py` crée et configure tout le serveur depuis votre poste,
sans SSH : rôle IAM, groupe de sécurité (ports 80/443), IP élastique,
instance Ubuntu 24.04 (disque chiffré), secrets générés dans SSM Parameter
Store, Docker, PostgreSQL, Django, site Angular, compte `admin`,
sauvegarde quotidienne de la base.

1. Créer un utilisateur IAM avec la politique
   `deploy/aws/iam-politique-deploiement.json` et une clé d'accès.
2. ```bash
   pip install boto3
   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_DEFAULT_REGION=eu-north-1
   export UBIFOOD_ALLMYSMS_LOGIN=... UBIFOOD_ALLMYSMS_API_KEY=...   # optionnel
   python deploy/aws/deploy.py create --firebase-key /chemin/firebase-service-account.json
   ```
3. Mises à jour du code : `python deploy/aws/deploy.py update`

Le mot de passe du compte `admin` est dans AWS Console → Systems Manager →
Parameter Store → `/ubifood/ADMIN_PASSWORD`. Console du serveur : EC2 →
instance « ubifood » → Se connecter → Session Manager.

### Sauvegardes

Installées par `deploy/aws/server-setup.sh` (donc à chaque `deploy.py create`
ou `update`) :

- **Chaque nuit à 2 h** : la base PostgreSQL **et** les fichiers envoyés
  (photos des plats et de profil, bannières, fenêtre de connexion, documents
  des besoins, logo) dans `/opt/ubifood-backups/base` et `/opt/ubifood-backups/fichiers`.
  Chaque sauvegarde de la base est vérifiée ; **14 jours** sont conservés.
- **Avant chaque mise à jour** (`deploy.py update`) : une sauvegarde
  « avant-deploiement ». Si elle échoue, le déploiement s'arrête.
- Journal : `/var/log/ubifood-sauvegarde.log` (une ligne ❌ en cas d'échec).
- **Copie hors du serveur (recommandé)** : sans elle, la perte du disque
  emporte aussi les sauvegardes. Créer un bucket S3, autoriser le rôle de
  l'instance (`s3:PutObject` sur ce bucket), puis créer le paramètre SSM
  `/ubifood/BACKUP_S3` = `s3://mon-bucket/ubifood` et relancer `deploy.py update`.

Sauvegarde manuelle : `sudo bash /opt/ubifood/deploy/aws/sauvegarde.sh manuelle`.

Restauration (remplace toutes les données ; l'état actuel est d'abord sauvegardé) :
```bash
sudo bash /opt/ubifood/deploy/aws/restaurer.sh \
  /opt/ubifood-backups/base/ubifood_2026-10-20_0200_quotidienne.dump \
  /opt/ubifood-backups/fichiers/media_2026-10-20_0200_quotidienne.tar.gz
```

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
