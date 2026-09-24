import { Callout, Card } from "@/components/ui/Primitives";
import { formatMoney, formatDate } from "@/lib/utils";
import type { Projection } from "@/lib/projection";

/** Couleurs des segments (tokens de la palette), cyclées par projet. */
const COULEURS = ["var(--color-gold)", "var(--color-navy-300)", "var(--color-success)", "var(--color-info)", "var(--color-warning)", "var(--color-navy-900)"];

function compact(montant: number) {
  if (montant >= 1_000_000) return `${(montant / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (montant >= 1_000) return `${Math.round(montant / 1_000).toLocaleString("fr-FR")} k`;
  return montant.toLocaleString("fr-FR");
}

/**
 * Graphique en barres empilées (une barre par fenêtre de 30 jours, un segment
 * par projet) des montants attendus si chaque échéance est payée à sa date.
 * SVG sans dépendance ; un tableau lisible par les lecteurs d'écran double le
 * graphique. Projection théorique : voir l'avertissement affiché.
 */
export function ProjectionTresorerie({ projection }: { projection: Projection }) {
  const { fenetres, total, enRetard, auDela, segments } = projection;
  const couleur = new Map(segments.map((s, i) => [s.cle, COULEURS[i % COULEURS.length]]));
  const max = Math.max(1, ...fenetres.map((f) => f.total));

  // Repères : largeur 600, hauteur utile 200, marges pour les axes
  const L = 600;
  const H = 220;
  const margeG = 64;
  const margeB = 28;
  const hauteurUtile = H - margeB - 12;
  const largeurCol = (L - margeG) / fenetres.length;
  const largeurBarre = largeurCol * 0.5;
  const graduations = [0, 0.5, 1].map((r) => Math.round(max * r));

  return (
    <div className="space-y-4" data-testid="projection-tresorerie" data-total={Math.round(total)}>
      <Callout tone="warning" testId="projection-avertissement">
        <strong>Projection théorique</strong>, pas un engagement : chaque échéance non soldée des ventes en cours est comptée à sa date
        prévue, comme si tout était payé à temps. Les retards de paiement réels ne sont pas anticipés
        {enRetard.nombre > 0 && (
          <>
            {" "}
            — {enRetard.nombre} échéance{enRetard.nombre > 1 ? "s" : ""} déjà dépassée{enRetard.nombre > 1 ? "s" : ""} ({formatMoney(enRetard.montant)}) reste
            {enRetard.nombre > 1 ? "nt" : ""} hors projection
          </>
        )}
        .
      </Callout>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-h3 text-navy-900">Entrées attendues sur 90 jours</h3>
          <p className="text-small text-navy-400">
            Total <span className="tabular font-semibold text-navy-900">{formatMoney(total)}</span>
            {auDela.nombre > 0 && <span> · au-delà de 90 j : {formatMoney(auDela.montant)}</span>}
          </p>
        </div>

        {total === 0 ? (
          <p className="py-8 text-center text-small text-navy-400">Aucune échéance à venir sur les 90 prochains jours pour les ventes en cours.</p>
        ) : (
          <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img" aria-labelledby="projection-titre" data-testid="projection-graphique">
            <title id="projection-titre">Montants attendus par fenêtre de 30 jours, empilés par projet</title>
            {graduations.map((g) => {
              const y = 12 + hauteurUtile - (g / max) * hauteurUtile;
              return (
                <g key={g}>
                  <line x1={margeG} x2={L} y1={y} y2={y} stroke="var(--color-navy-100)" strokeDasharray="3 4" />
                  <text x={margeG - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-navy-400)" className="tabular">
                    {compact(g)}
                  </text>
                </g>
              );
            })}
            {fenetres.map((f, i) => {
              const x = margeG + i * largeurCol + (largeurCol - largeurBarre) / 2;
              let yCourant = 12 + hauteurUtile;
              return (
                <g key={f.libelle} data-testid="projection-fenetre" data-fenetre={f.libelle} data-total={Math.round(f.total)} data-nombre={f.nombre}>
                  {f.segments.map((s) => {
                    const h = (s.montant / max) * hauteurUtile;
                    yCourant -= h;
                    return (
                      <rect key={s.cle} x={x} y={yCourant} width={largeurBarre} height={Math.max(0, h)} fill={couleur.get(s.cle)} rx={2}>
                        <title>
                          {s.libelle} — {f.libelle} : {formatMoney(s.montant)}
                        </title>
                      </rect>
                    );
                  })}
                  <text x={x + largeurBarre / 2} y={12 + hauteurUtile - (f.total / max) * hauteurUtile - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-navy-900)" className="tabular">
                    {f.total > 0 ? compact(f.total) : ""}
                  </text>
                  <text x={x + largeurBarre / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--color-navy-400)">
                    {f.libelle}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {segments.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-navy-400" aria-label="Légende par projet">
            {segments.map((s) => (
              <li key={s.cle} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs" style={{ background: couleur.get(s.cle) }} aria-hidden />
                {s.libelle} <span className="tabular text-navy-900">{formatMoney(s.montant)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Version tableau pour les lecteurs d'écran et les tests */}
        <div className="sr-only">
        <table data-testid="projection-tableau">
          <caption>Montants attendus par fenêtre de 30 jours</caption>
          <thead>
            <tr>
              <th scope="col">Fenêtre</th>
              <th scope="col">Du</th>
              <th scope="col">Au</th>
              <th scope="col">Échéances</th>
              <th scope="col">Montant attendu</th>
            </tr>
          </thead>
          <tbody>
            {fenetres.map((f) => (
              <tr key={f.libelle}>
                <th scope="row">{f.libelle}</th>
                <td>{formatDate(f.debut)}</td>
                <td>{formatDate(f.fin)}</td>
                <td>{f.nombre}</td>
                <td>{formatMoney(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
