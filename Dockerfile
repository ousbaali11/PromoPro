# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# PromoPro — image de production (Next.js 16, output: "standalone")
#
# Étapes :
#   deps     installe toutes les dépendances (npm ci)
#   builder  compile l'application (npm run build → .next/standalone)
#   tools    dépendances de production + tsx + drizzle-kit, pour pouvoir lancer
#            `npm run db:push` et `npm run db:seed` depuis le conteneur déployé
#   runner   image finale : serveur standalone + outils d'administration
#
# Image Debian (glibc) plutôt qu'Alpine : @libsql/client fournit un binaire
# natif linux-x64-gnu, utilisé en mode SQLite (fallback sans DATABASE_URL).
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Le build n'a besoin d'aucune base : pas de DATABASE_URL ici.
RUN npm run build

FROM deps AS tools
WORKDIR /app
RUN npm prune --omit=dev && npm install --no-save --no-audit --no-fund tsx drizzle-kit

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/storage

# Serveur standalone (server.js + node_modules tracés) et assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Outils d'administration : sources + config + node_modules de prod (superset
# des modules tracés, mêmes versions) + tsx / drizzle-kit
COPY --from=tools /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY scripts ./scripts

# /app/storage : fichiers uploadés (monter un volume persistant dessus)
# /app/data    : base SQLite de repli si DATABASE_URL n'est pas défini
# Les sous-dossiers par type (preuves-paiement/, contrats/…) ne sont PAS créés
# ici : le montage du volume recouvrirait de toute façon /app/storage. Ils sont
# créés au démarrage (src/instrumentation.ts) puis à la volée par saveUpload.
RUN mkdir -p /app/storage /app/data && chown -R node:node /app

# Point d'entrée : démarre en root, attribue le volume (UPLOAD_DIR) et /app/data
# à l'utilisateur `node` (UID 1000), puis bascule vers `node` via setpriv
# (util-linux, déjà dans l'image) avant de lancer le serveur. Pas d'instruction
# USER : c'est le script qui abandonne les privilèges. Un volume Railway
# fraîchement monté appartient à root, d'où EACCES sur mkdir sous `node`
# (voir DEPLOY.md, « Volume persistant »). Fins de ligne normalisées au cas où
# le fichier aurait été extrait avec des CRLF.
COPY --chmod=755 docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
