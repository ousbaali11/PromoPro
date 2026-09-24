"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/Primitives";
import { Skeleton } from "@/components/ui/Skeleton";

/*
 * Graphiques des tableaux de bord (recharts, couleurs du système : navy et
 * gold). Chaque graphique reçoit des lignes prêtes (une par intervalle) et la
 * liste des séries ; le total est exposé en attribut pour les tests.
 */
export type SerieGraphique = { cle: string; libelle: string };
export type LigneGraphique = { intervalle: string } & Record<string, number | string>;
export type Unite = "nombre" | "mad";

const COULEURS = ["#12283f", "#b08d57", "#587393", "#e2cda0"];

function formatValeur(v: number, unite: Unite) {
  if (unite === "mad") {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
    return v.toLocaleString("fr-FR");
  }
  return v.toLocaleString("fr-FR");
}
function formatComplet(v: number, unite: Unite) {
  return unite === "mad" ? `${Math.round(v).toLocaleString("fr-FR")} MAD` : v.toLocaleString("fr-FR");
}

function Cadre({ titre, description, total, unite, testId, children }: { titre: string; description?: string; total: number; unite: Unite; testId: string; children: React.ReactNode }) {
  return (
    <Card className="p-5" data-testid={testId} data-total={total}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-h3 text-navy-900">{titre}</h3>
          {description && <p className="text-caption text-navy-400">{description}</p>}
        </div>
        <span className="text-small font-semibold tabular text-navy-900" data-testid={`${testId}-total`}>
          {formatComplet(total, unite)}
        </span>
      </div>
      <div className="h-60 w-full">{children}</div>
    </Card>
  );
}

/** Contenu d'infobulle maison : le contenu par défaut de recharts porte aria-live="assertive", proscrit dans l'application. */
function Infobulle({ active, payload, label, unite }: { active?: boolean; payload?: { name?: string; value?: number | string; color?: string }[]; label?: string; unite: Unite }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-navy-100 bg-white px-3 py-2 text-caption shadow-e3">
      <p className="mb-1 font-medium text-navy-900">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-navy-400">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
          {p.name} : <span className="font-medium tabular text-navy-900">{formatComplet(Number(p.value ?? 0), unite)}</span>
        </p>
      ))}
    </div>
  );
}

const axes = { tick: { fontSize: 11, fill: "#587393" }, axisLine: { stroke: "#d7e0e9" }, tickLine: false as const };

export function GraphiqueBarres({
  titre,
  description,
  lignes,
  series,
  unite = "nombre",
  total,
  testId = "graphique-barres",
}: {
  titre: string;
  description?: string;
  lignes: LigneGraphique[];
  series: SerieGraphique[];
  unite?: Unite;
  total: number;
  testId?: string;
}) {
  return (
    <Cadre titre={titre} description={description} total={total} unite={unite} testId={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={lignes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="intervalle" {...axes} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axes} width={44} allowDecimals={unite === "mad"} tickFormatter={(v: number) => formatValeur(v, unite)} />
          <Tooltip content={<Infobulle unite={unite} />} cursor={{ fill: "#faf6ee" }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar key={s.cle} dataKey={s.cle} name={s.libelle} fill={COULEURS[i % COULEURS.length]} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Cadre>
  );
}

export function GraphiqueCourbe({
  titre,
  description,
  lignes,
  series,
  unite = "nombre",
  total,
  testId = "graphique-courbe",
}: {
  titre: string;
  description?: string;
  lignes: LigneGraphique[];
  series: SerieGraphique[];
  unite?: Unite;
  total: number;
  testId?: string;
}) {
  return (
    <Cadre titre={titre} description={description} total={total} unite={unite} testId={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={lignes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="intervalle" {...axes} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axes} width={44} allowDecimals={unite === "mad"} tickFormatter={(v: number) => formatValeur(v, unite)} />
          <Tooltip content={<Infobulle unite={unite} />} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Line key={s.cle} type="monotone" dataKey={s.cle} name={s.libelle} stroke={COULEURS[(i + 1) % COULEURS.length]} strokeWidth={2} dot={lignes.length <= 31} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Cadre>
  );
}

/** Squelette affiché pendant le calcul des graphiques (changement de plage). */
export function GraphiquesSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-busy="true" aria-label="Chargement des graphiques" data-testid="graphiques-skeleton">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
