# Performance — mesure de référence

Première mesure de référence, sans objectif chiffré : le but est de pouvoir
comparer plus tard, à méthode identique, si l'application ralentit avec la
croissance réelle des données. Aucune écriture, jamais contre Railway.

## Méthode

Outil : [autocannon](https://github.com/mcollina/autocannon) (dépendance de
développement, léger), piloté par `scripts/charge.ts`. Vingt connexions
simultanées (≈ 20 utilisateurs) rejouent en boucle, pendant deux minutes,
trois pages en lecture seule :

| Page | Session |
| --- | --- |
| `/dashboard/projets` | PDG (compte staff de la base) |
| `/dashboard/propositions` | PDG |
| `/client` | client `CL-DEMO` |

Les sessions sont forgées localement avec le `JWT_SECRET` du serveur visé
(mêmes cookies que ceux émis par `/login`). Le script refuse toute URL qui
n'est pas `localhost` / `127.0.0.1`, et vérifie d'abord que les trois pages
répondent 200 avec ces sessions.

### Relancer la mesure

Dans quatre étapes, depuis la racine du projet (PowerShell : préfixer les
variables par `$env:`) :

```bash
npm run build
```

```bash
npm run test:e2e:setup
```

```bash
DATABASE_URL="" SQLITE_PATH=data/test.db JWT_SECRET=secret-de-charge-0123456789 NEXT_TELEMETRY_DISABLED=1 npx next start --port 3102
```

puis, dans un second terminal :

```bash
SQLITE_PATH=data/test.db JWT_SECRET=secret-de-charge-0123456789 npm run charge -- --url http://localhost:3102 --duree 120 --connexions 20 --json perf-resultat.json
```

Options : `--duree` (secondes, défaut 120), `--connexions` (défaut 20),
`--url` (défaut `http://localhost:3102`), `--json <fichier>` (résumé
machine-lisible, à comparer d'un run à l'autre ; ne pas le commiter).

Conditions à noter à chaque mesure : machine, build de production (`next
start`, jamais `next dev`), base de démonstration fraîche (`test:e2e:setup`),
aucun autre processus lourd en parallèle. La base SQLite locale n'est pas la
base PostgreSQL de production : la mesure reflète le rendu des pages et le
serveur Node, pas la latence réseau de la base Railway.

## Résultats de référence

Mesure du 24 septembre 2026 (01:37, heure locale), machine de développement :
Windows 11 Professionnel, Intel Core i7-1185G7 (4 cœurs / 8 fils, 3,0 GHz),
15 Go de RAM, Node 24.18, Next 16.3.5 en production (`next start`), base
SQLite de démonstration fraîche (`test:e2e:setup`), Sentry désactivé,
autocannon 8.0 — 20 connexions, 120 secondes, trois pages en boucle.

| Indicateur | Valeur |
| --- | --- |
| Requêtes servies | 8 180 en 120 s |
| Débit moyen | 68,2 req/s (p50 : 65 req/s) |
| Latence moyenne | 294 ms |
| Latence p50 | 239 ms |
| Latence p97,5 | 528 ms |
| Latence p99 | 564 ms |
| Latence max | 643 ms |
| Erreurs (non-2xx, réseau, délais) | 0 sur 8 180 — 0,00 % |
| Codes HTTP | 200 : 8 180 |

Aucune erreur dans les journaux du serveur pendant le test. Le serveur de
production local et le générateur de charge tournaient sur la même machine :
les latences incluent donc la concurrence entre les deux, ce qui pénalise la
mesure par rapport à un serveur dédié.

## Lecture des résultats

- **Latence p50 / p97,5 / p99** : temps de réponse médian et de queue par
  requête (page complète rendue côté serveur, HTML seul, sans les ressources
  statiques).
- **Requêtes par seconde** : débit soutenu avec 20 connexions qui enchaînent
  sans pause — plus sévère que 20 humains qui lisent entre deux clics.
- **Taux d'erreur** : réponses non-2xx, erreurs réseau et délais dépassés ;
  attendu 0 %.

À relancer après une évolution notable (volume de données réel, nouvelle
page lourde, changement d'hébergement) et à comparer aux chiffres ci-dessus.
Si la latence p97,5 double ou si des erreurs apparaissent, chercher d'abord
les requêtes N+1 des pages concernées (les pages du dashboard chargent
plusieurs tables par promoteur) avant toute optimisation d'infrastructure.
