"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Eye, EyeOff } from "lucide-react";
import { lancerEssai, type EssaiState } from "./actions";
import { Card, Callout, Badge, type Tone } from "@/components/ui/Primitives";
import { Select } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { Apercu3d } from "@/components/biens/Apercu3d";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";
import { useHydrated } from "@/components/ui/useHydrated";
import { FOURNISSEURS, libelleFournisseur } from "@/lib/plan3d/provider";
import { formatDateTime } from "@/lib/utils";

/** Formulaire d'essai : image du plan, fournisseur à tester (indépendant du fournisseur actif), Générer. */
export function BacASable({ fournisseursConfigures }: { fournisseursConfigures: string[] }) {
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState<EssaiState, FormData>(lancerEssai, undefined);
  const [cle, setCle] = useState(0);
  return (
    <Card className="p-5" data-testid="bac-a-sable">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-50 text-navy [&_svg]:h-4 [&_svg]:w-4">
          <FlaskConical />
        </span>
        <div>
          <h2 className="text-h3 text-navy-900">Bac à sable</h2>
          <p className="text-caption text-navy-400">Testez le même plan chez chaque fournisseur. Aucun bien ni client n&apos;est touché.</p>
        </div>
      </div>
      <form key={cle} action={formAction} onSubmit={soumettreSansReinitialiser(formAction)} className="space-y-3" data-testid="form-essai" data-hydrated={hydrated ? "true" : undefined}>
        <FileUpload name="planUrl" type="plans" label="Image du plan 2D (PNG ou JPEG)" accept=".png,.jpg,.jpeg" hint="Le PDF n'est pas lu par les fournisseurs." />
        <Select id="fournisseur" name="fournisseur" label="Fournisseur à tester" defaultValue={fournisseursConfigures[0] ?? ""}>
          {FOURNISSEURS.map((f) => (
            <option key={f.code} value={f.code} disabled={!fournisseursConfigures.includes(f.code)}>
              {f.libelle}
              {fournisseursConfigures.includes(f.code) ? "" : f.necessiteCle ? " (clé manquante)" : " (modèle non installé)"}
            </option>
          ))}
        </Select>
        {state?.error && <Callout tone="danger">{state.error}</Callout>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" loading={pending} disabled={fournisseursConfigures.length === 0}>
            Générer
          </Button>
          {state?.success && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setCle((k) => k + 1)}>
              Nouvel essai
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

const TONES: Record<string, Tone> = { EN_ATTENTE: "warning", PRET: "success", ECHEC: "danger" };
const LABELS: Record<string, string> = { EN_ATTENTE: "En cours", PRET: "Prêt", ECHEC: "Échec" };

export type EssaiAffiche = {
  id: string;
  fournisseur: string;
  planUrl: string;
  statut: string;
  resultatUrl: string | null;
  erreurMessage: string | null;
  dureeMs: number | null;
  createdAt: Date | null;
};

/** Historique des essais ; se rafraîchit tant qu'un essai est en cours. */
export function ListeEssais({ essais }: { essais: EssaiAffiche[] }) {
  const router = useRouter();
  const enCours = essais.some((e) => e.statut === "EN_ATTENTE");
  useEffect(() => {
    if (!enCours) return;
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [enCours, router]);

  if (essais.length === 0) {
    return (
      <p className="text-small text-navy-400" data-testid="essais-vides">
        Aucun essai pour l&apos;instant.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="liste-essais" data-en-cours={enCours ? "true" : undefined}>
      {essais.map((e) => (
        <LigneEssai key={e.id} essai={e} />
      ))}
    </ul>
  );
}

function LigneEssai({ essai }: { essai: EssaiAffiche }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <li className="rounded-lg bg-white p-4 ring-1 ring-navy-100/70" data-testid="essai-ligne" data-statut={essai.statut} data-fournisseur={essai.fournisseur}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-navy-900">{libelleFournisseur(essai.fournisseur)}</span>
          <Badge tone={TONES[essai.statut] ?? "neutral"} dot data-testid="essai-statut">
            {LABELS[essai.statut] ?? essai.statut}
          </Badge>
          <span className="text-caption text-navy-400">{formatDateTime(essai.createdAt)}</span>
          {essai.dureeMs !== null && essai.statut !== "EN_ATTENTE" && (
            <span className="text-caption tabular text-navy-400" data-testid="essai-duree">
              {(essai.dureeMs / 1000).toFixed(1)} s
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={essai.planUrl} target="_blank" rel="noreferrer" className="text-caption text-navy-500 underline-offset-2 hover:underline">
            Plan déposé
          </a>
          {essai.statut === "PRET" && essai.resultatUrl && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setOuvert((o) => !o)} data-testid="voir-modele">
              {ouvert ? <EyeOff /> : <Eye />} {ouvert ? "Masquer" : "Voir le modèle"}
            </Button>
          )}
        </div>
      </div>
      {essai.statut === "ECHEC" && (
        <p className="mt-2 text-small text-danger-fg" data-testid="essai-erreur">
          {essai.erreurMessage}
        </p>
      )}
      {essai.statut === "EN_ATTENTE" && <p className="mt-2 text-small text-navy-400">Génération en cours chez le fournisseur… la page se met à jour d&apos;elle-même.</p>}
      {ouvert && essai.resultatUrl && (
        <div className="mt-3 overflow-hidden rounded-md bg-blueprint" data-testid="apercu-essai">
          <Apercu3d src={essai.resultatUrl} alt={`Modèle généré par ${libelleFournisseur(essai.fournisseur)}`} className="h-72" />
        </div>
      )}
    </li>
  );
}
