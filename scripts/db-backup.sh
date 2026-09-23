#!/usr/bin/env bash
# Sauvegarde d'une base PostgreSQL (format « custom » de pg_dump, déjà compressé)
# et vérification immédiate que le fichier est lisible par pg_restore.
#
#   DATABASE_URL=postgresql://... scripts/db-backup.sh [dossier-de-sortie]
#
# Utilisé par .github/workflows/backup-db.yml (quotidien) ; utilisable en local
# avec pg_dump installé. L'URL n'est jamais affichée.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "::error::DATABASE_URL absente — créez le secret RAILWAY_DATABASE_PUBLIC_URL (Settings › Secrets and variables › Actions)." >&2
  exit 1
fi
SORTIE="${1:-sauvegarde}"
mkdir -p "$SORTIE"
HORODATAGE="$(date -u +%Y%m%d-%H%M)"
FICHIER="$SORTIE/promopro-$HORODATAGE.dump"

echo "→ pg_dump (format custom) vers $FICHIER"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$FICHIER"

echo "→ Vérification du fichier avec pg_restore --list"
pg_restore --list "$FICHIER" > "$FICHIER.toc.txt"
TABLES=$(grep -c ' TABLE DATA ' "$FICHIER.toc.txt" || true)
TAILLE=$(du -h "$FICHIER" | cut -f1)
if [ "$TABLES" -lt 1 ]; then
  echo "::error::Le dump ne contient aucune table (base vide ou URL incorrecte)." >&2
  exit 1
fi

{
  echo "fichier=$(basename "$FICHIER")"
  echo "date_utc=$HORODATAGE"
  echo "taille=$TAILLE"
  echo "tables_avec_donnees=$TABLES"
  echo "version_pg_dump=$(pg_dump --version)"
} | tee "$SORTIE/resume.txt"
echo "✓ Sauvegarde valide : $TABLES tables avec données, $TAILLE"
