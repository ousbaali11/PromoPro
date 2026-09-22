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
RUN mkdir -p /app/storage /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "server.js"]
