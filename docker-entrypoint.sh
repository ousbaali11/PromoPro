#!/bin/sh
# ---------------------------------------------------------------------------
# PromoPro — point d'entrée du conteneur de production.
#
# Le conteneur démarre en root (aucune instruction USER dans le Dockerfile)
# uniquement pour rendre le disque des uploads accessible à l'utilisateur
# applicatif, puis bascule vers `node` (UID 1000, GID 1000 dans l'image
# officielle) avant de lancer le serveur. Raison : un volume Railway
# fraîchement monté sur /app/storage appartient à root ; le processus Node,
# lancé sous `node`, obtenait `EACCES: permission denied, mkdir` au premier
# dépôt de fichier (incident de septembre 2026). Le `chown` du Dockerfile ne
# suffit pas : le montage du volume recouvre le dossier préparé dans l'image.
#
# Bascule de privilèges sans outil supplémentaire : `setpriv` (util-linux,
# présent dans node:22-bookworm-slim), sinon `runuser`, sinon `su`.
# ---------------------------------------------------------------------------
set -eu

UTILISATEUR="${APP_USER:-node}"
DOSSIER_UPLOADS="${UPLOAD_DIR:-/app/storage}"
DOSSIER_DONNEES="/app/data"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DOSSIER_UPLOADS" "$DOSSIER_DONNEES"
  for dossier in "$DOSSIER_UPLOADS" "$DOSSIER_DONNEES"; do
    # chown récursif seulement si la racine n'appartient pas déjà à l'utilisateur
    # (un volume déjà corrigé et bien rempli n'est pas reparcouru à chaque démarrage)
    if [ "$(stat -c %u "$dossier")" != "$(id -u "$UTILISATEUR")" ]; then
      echo "[entrypoint] $dossier appartient à l'UID $(stat -c %u "$dossier") : attribution à $UTILISATEUR"
      chown -R "$UTILISATEUR:$UTILISATEUR" "$dossier" || echo "[entrypoint] AVERTISSEMENT : chown impossible sur $dossier (le serveur signalera UPLOAD_DIR au démarrage)"
    fi
  done

  # /usr/bin/setpriv et /sbin/runuser font partie du paquet util-linux de Debian bookworm
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid="$UTILISATEUR" --regid="$UTILISATEUR" --init-groups "$@"
  fi
  exec runuser -u "$UTILISATEUR" -- "$@"
fi

# Déjà non-root (RAILWAY_RUN_UID ou docker run --user) : aucun chown possible, on lance tel quel
exec "$@"
