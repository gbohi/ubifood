# ============================================================
# Site web Angular compilé, servi par Nginx (qui sert aussi de
# reverse proxy vers l'API Django — voir backend/nginx/nginx.conf).
# Contexte de build : le dossier web/
# ============================================================
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
# Le build Angular demande beaucoup de mémoire (serveur avec swap conseillé)
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
COPY --from=build /app/dist/steex /usr/share/nginx/html
