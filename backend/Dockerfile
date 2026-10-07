# ============================================================
# Image du backend Django (servi par Gunicorn derrière Nginx)
# Contexte de build : le dossier backend/
# ============================================================
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dépendances Python d'abord (cache Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code Django (manage.py, core/, api/) — .env et médias exclus par .dockerignore
COPY backend/ .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && useradd --create-home --uid 1000 django \
    && mkdir -p /app/media /app/staticfiles \
    && chown -R django:django /app

USER django
EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120", "--access-logfile", "-"]
