# Image de base Python
FROM python:3.11-slim

# Définir le répertoire de travail dans le container
WORKDIR /app

# Copier les dépendances d'abord (optimisation cache Docker)
COPY requirements.txt .

# Installer les dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# Copier tout le code source
COPY . .

# Exposer le port 8000 (port Django/Gunicorn)
EXPOSE 8000

# Commande de démarrage avec Gunicorn (serveur de production)
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "core.wsgi:application"]