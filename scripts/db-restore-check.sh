#!/usr/bin/env bash
# Restaure un dump pg_dump (format custom) dans une base PostgreSQL JETABLE et
# vérifie que les tables clés contiennent des lignes : un backup jamais restauré
# n'est pas vérifié.
#
#   DATABASE_URL=postgresql://... scripts/db-restore-check.sh chemin/vers/fichier.dump [tables obligatoires...]
#
# Tables obligatoires par défaut : users biens paiements. Utilisé par
# .github/workflows/backup-restore-check.yml (hebdomadaire) sur le service
# Postgres du job — JAMAIS sur la base de production.
set -euo pipefail

DUMP="${1:?chemin du fichier .dump attendu}"
shift || true
TABLES=("$@")
if [ ${#TABLES[@]} -eq 0 ]; then TABLES=(users biens paiements); fi
if [ -z "${DATABASE_URL:-}" ]; then echo "DATABASE_URL absente (base jetable cible)" >&2; exit 1; fi
case "$DATABASE_URL" in
  *railway.app*|*rlwy.net*|*railway.internal*)
    echo "::error::Refus : cette vérification ne s'exécute que sur une base jetable, jamais sur Railway." >&2
    exit 1 ;;
esac

echo "→ Restauration de $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1)) dans la base jetable"
# --clean/--if-exists : base jetable vide ou déjà utilisée, même résultat ; --no-owner/--no-privileges : rôles Railway absents ici
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$DATABASE_URL" "$DUMP"

echo "→ Contrôle des tables clés"
ECHEC=0
for table in "${TABLES[@]}"; do
  if ! psql "$DATABASE_URL" -Atqc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$table'" | grep -q 1; then
    echo "::error::Table absente après restauration : $table" >&2
    ECHEC=1
    continue
  fi
  N=$(psql "$DATABASE_URL" -Atqc "SELECT count(*) FROM \"$table\"" | tr -d '\r')
  if [ "$N" -lt 1 ]; then
    echo "::error::Table vide après restauration : $table" >&2
    ECHEC=1
  else
    echo "  ✓ $table : $N ligne(s)"
  fi
done

echo "→ Inventaire complet (lignes par table)"
psql "$DATABASE_URL" -Atqc "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1" | tr -d '\r' | while read -r t; do
  printf '  %-22s %s\n' "$t" "$(psql "$DATABASE_URL" -Atqc "SELECT count(*) FROM \"$t\"" | tr -d '\r')"
done

if [ "$ECHEC" -ne 0 ]; then exit 1; fi
echo "✓ Sauvegarde restaurée et cohérente"
