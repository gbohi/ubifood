"""
Django settings for core project.
"""

from pathlib import Path
from decouple import config, Csv
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent


# ============================================================
# SÉCURITÉ
# Ces valeurs sont lues depuis le fichier .env — jamais en dur.
# ============================================================

# La SECRET_KEY vient du .env — pas de valeur par défaut intentionnellement :
# si la variable est absente, Django lève une erreur immédiatement au démarrage
# plutôt que de tourner silencieusement avec une clé faible.
SECRET_KEY = config('SECRET_KEY')

# DEBUG vaut True en développement, False en production.
# config(..., cast=bool) convertit la chaîne "True"/"False" du .env en booléen Python.
DEBUG = config('DEBUG', default=False, cast=bool)

# En production, liste les domaines autorisés.
# Csv() permet d'écrire : ALLOWED_HOSTS=monsite.com,www.monsite.com dans le .env
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())


# ============================================================
# APPLICATIONS
# ============================================================

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'rest_framework.authtoken',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'django_filters',
    'corsheaders',

    # Local
    'api',
]

AUTH_USER_MODEL = 'api.User'


# ============================================================
# MIDDLEWARE
# CorsMiddleware doit être en premier dans la liste.
# ============================================================

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]


# ============================================================
# CORS
# En développement (DEBUG=True) : on accepte toutes les origines.
# En production (DEBUG=False)   : on n'accepte que les origines listées dans .env.
# ============================================================

if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
else:
    # Exemple dans .env :
    # CORS_ALLOWED_ORIGINS=https://monsite.com,https://app.monsite.com
    CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='', cast=Csv())

# Origines autorisées à soumettre des formulaires (admin Django derrière Nginx).
# Exemple : CSRF_TRUSTED_ORIGINS=https://ubifood.mondomaine.com
CSRF_TRUSTED_ORIGINS = config('CSRF_TRUSTED_ORIGINS', default='', cast=Csv())


# ============================================================
# HTTPS
# Nginx termine le TLS et transmet X-Forwarded-Proto.
# USE_HTTPS=True une fois le certificat installé (Let's Encrypt).
# ============================================================

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_HTTPS = config('USE_HTTPS', default=False, cast=bool)
SECURE_SSL_REDIRECT   = USE_HTTPS
SESSION_COOKIE_SECURE = USE_HTTPS
CSRF_COOKIE_SECURE    = USE_HTTPS
if USE_HTTPS:
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'


# ============================================================
# URLS & TEMPLATES
# ============================================================

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# ============================================================
# BASE DE DONNÉES
# Toutes les valeurs sensibles viennent du .env.
# ============================================================

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME':     config('DB_NAME',     default='djangotest'),
        'USER':     config('DB_USER',     default='postgres'),
        'PASSWORD': config('DB_PASSWORD'),   # pas de default : erreur si absent
        'HOST':     config('DB_HOST',     default='localhost'),
        'PORT':     config('DB_PORT',     default='5432'),
        'CONN_MAX_AGE': 60,
    }
}


# ============================================================
# CACHE
# Partagé entre les workers Gunicorn (codes OTP, limitation de débit).
# Le cache mémoire par défaut est propre à chaque processus : un code OTP
# créé par un worker était introuvable pour les autres.
# Table créée par : python manage.py createcachetable
# ============================================================

CACHES = {
    'default': {
        'BACKEND':  'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'django_cache',
    }
}


# ============================================================
# REST FRAMEWORK
# ============================================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'api.pagination.StandardPagination',
    'PAGE_SIZE': 10,
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_THROTTLE_RATES': {
        # Mot de passe oublié / vérification du code : par adresse IP
        'password_reset': '10/hour',
        'login':          '20/min',
    },
}


# ============================================================
# JWT
# ============================================================

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    # Met à jour User.last_login à chaque obtention de token
    # (le signal user_logged_in n'est pas émis par l'authentification JWT).
    'UPDATE_LAST_LOGIN': True,
}


# ============================================================
# VALIDATION DES MOTS DE PASSE
# ============================================================

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ============================================================
# INTERNATIONALISATION
# ============================================================

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Abidjan'
USE_I18N = True
USE_TZ = True


# ============================================================
# FICHIERS STATIQUES & MÉDIAS
# ============================================================

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Taille max d'un fichier uploadé (doit rester ≤ client_max_body_size de Nginx)
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024


# ============================================================
# DIVERS
# ============================================================

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ============================================================
# FIREBASE ADMIN SDK
# ============================================================

FIREBASE_SERVICE_ACCOUNT_KEY = config(
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    default=str(BASE_DIR / 'firebase-service-account.json'),
)


# ============================================================
# SMS (AllMySMS) — réinitialisation du mot de passe
# ============================================================

ALLMYSMS_LOGIN   = config('ALLMYSMS_LOGIN',   default='')
ALLMYSMS_API_KEY = config('ALLMYSMS_API_KEY', default='')
ALLMYSMS_SENDER  = config('ALLMYSMS_SENDER',  default='UbiFood')


# ============================================================
# LOGS — sortie console (récupérée par docker logs)
# ============================================================

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}

