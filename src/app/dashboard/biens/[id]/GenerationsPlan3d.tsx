"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Sparkles } from "lucide-react";
import { validerGenerationPlan3d } from "./actions";
import { Badge, Section, type Tone } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Apercu3d } from "@/components/biens/Apercu3d";
import { libelleFournisseur } from "@/lib/plan3d/provider";
import { formatDateTime } from "@/lib/utils";

const TONES: Record<string, Tone> = { EN_ATTENTE: "warning", PRET: "info", ECHEC: "danger" };
const LABELS: Record<string, string> = { EN_ATTENTE: "En cours", PRET: "À valider", ECHEC: "Échec" };

export type GenerationAffichee = {
  id: string;
  fournisseur: string;
  statut: string;
  modelUrl: string | null;
  erreurMessage: string | null;
  createdAt: Date | null;
  valideAt: Date | null;
};

/**
 * Modèles 3D générés automatiquement pour ce bien (Directeur Commercial) :
 * une ligne par tentative, aperçu, « Valider et publier » copie le modèle
 * vers le plan 3D visible du client. Tant qu'il n'est pas validé, un modèle
 * généré n'apparaît jamais dans l'espace client.
 */
export function GenerationsPlan3d({ generations, plan3dPublie }: { generations: GenerationAffichee[]; plan3dPublie: string | null }) {
  const router = useRouter();
  const enCours = generations.some((g) => g.statut === "EN_ATTENTE");
  useEffect(() => {
    if (!enCours) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [enCours, router]);

  if (generations.length === 0) return null;
  return (
    <Section
      title="Modèles 3D générés"
      count={generations.length}
      description="Générés automatiquement à partir du plan 2D. Invisibles du client tant qu'ils ne sont pas validés."
      testId="section-generations-3d"
    >
      <ul className="space-y-3" data-en-cours={enCours ? "true" : undefined}>
        {generations.map((g) => (
          <LigneGeneration key={g.id} generation={g} publiee={!!g.modelUrl && g.modelUrl === plan3dPublie} />
        ))}
      </ul>
    </Section>
  );
}

function LigneGeneration({ generation: g, publiee }: { generation: GenerationAffichee; publiee: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const valider = () =>
    startTransition(async () => {
      const r = await validerGenerationPlan3d(g.id);
      if ("error" in r) toast({ kind: "error", title: "Publication impossible", description: r.error });
      else toast({ kind: "success", title: "Modèle 3D publié", description: "Il apparaît dans l'onglet « Modèle 3D » de l'espace client." });
      router.refresh();
    });

  return (
    <li className="rounded-lg bg-white p-4 ring-1 ring-navy-100/70" data-testid="generation-ligne" data-statut={g.statut} data-publiee={publiee ? "true" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold-600" aria-hidden />
          <span className="font-medium text-navy-900">{libelleFournisseur(g.fournisseur)}</span>
          {publiee ? (
            <Badge tone="success" dot data-testid="generation-statut">
              Publié
            </Badge>
          ) : (
            <Badge tone={TONES[g.statut] ?? "neutral"} dot data-testid="generation-statut">
              {LABELS[g.statut] ?? g.statut}
            </Badge>
          )}
          <span className="text-caption text-navy-400">{formatDateTime(g.createdAt)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {g.statut === "PRET" && g.modelUrl && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setOuvert((o) => !o)} data-testid="voir-generation">
              {ouvert ? <EyeOff /> : <Eye />} {ouvert ? "Masquer" : "Aperçu"}
            </Button>
          )}
          {g.statut === "PRET" && !publiee && (
            <Button type="button" size="sm" variant="gold" loading={pending} onClick={valider} data-testid="valider-generation">
              <CheckCircle2 /> Valider et publier
            </Button>
          )}
        </div>
      </div>
      {g.statut === "ECHEC" && (
        <p className="mt-2 text-small text-danger-fg" data-testid="generation-erreur">
          {g.erreurMessage} Le dépôt manuel d&apos;un modèle 3D reste possible.
        </p>
      )}
      {g.statut === "EN_ATTENTE" && <p className="mt-2 text-small text-navy-400">Génération en cours chez le fournisseur… cette section se met à jour d&apos;elle-même.</p>}
      {ouvert && g.modelUrl && (
        <div className="mt-3 overflow-hidden rounded-md bg-blueprint" data-testid="apercu-generation">
          <Apercu3d src={g.modelUrl} alt={`Modèle 3D généré par ${libelleFournisseur(g.fournisseur)}`} className="h-72" />
        </div>
      )}
    </li>
  );
}
