"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, Plus, Save, Trash2 } from "lucide-react";
import { Badge, Callout, Card, Input } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { addMonths, formatMoney } from "@/lib/utils";
import { NB_TRANCHES_MAX, ymd } from "@/lib/echeancier";
import { modifierEcheancier, type EtatEcheancier } from "./echeancier-actions";

export type TrancheEditable = { id: string; numero: number; pourcentage: number; montantPaye: number; statut: string; date: string };
type Ligne = { cle: number; id: string | null; pourcentage: number; montantPaye: number; statut: string; date: string };

const ECH_LABEL: Record<string, string> = { EN_ATTENTE: "En attente", PARTIELLE: "Partielle", PAYEE: "Payée" };
const ECH_TONE = { EN_ATTENTE: "warning", PARTIELLE: "info", PAYEE: "success" } as const;

/**
 * Modification de l'échéancier d'une vente conclue, par le commercial du bien
 * (fiche client, onglet Échéancier & Paiements). Seules les tranches encore
 * EN_ATTENTE peuvent être retirées ; une tranche payée ou partielle reste en
 * place et son montant ne peut pas descendre sous ce qui a été payé. Total en
 * temps réel ; toutes les règles sont revérifiées côté serveur. Formulaire
 * contrôlé : rien n'est perdu après une erreur.
 */
export function EditeurEcheancier({ bienId, prix, tranches }: { bienId: string; prix: number; tranches: TrancheEditable[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [lignes, setLignes] = useState<Ligne[]>(() => tranches.map((t, i) => ({ cle: i + 1, id: t.id, pourcentage: t.pourcentage, montantPaye: t.montantPaye, statut: t.statut, date: t.date })));
  const [prochaineCle, setProchaineCle] = useState(tranches.length + 1);
  const { toast } = useToast();
  // Succès signalé par un toast : le composant est remonté par la fiche (clé sur les tranches) avec les données fraîches, formulaire replié
  const [state, formAction, pending] = useActionState<EtatEcheancier, FormData>(async (prev, formData) => {
    const r = await modifierEcheancier(bienId, prev, formData);
    if (r?.success) toast({ kind: "success", title: "Échéancier enregistré", description: r.success, duration: 6000 });
    return r;
  }, undefined);
  const total = Math.round(lignes.reduce((s, t) => s + (Number.isFinite(t.pourcentage) ? t.pourcentage : 0), 0) * 100) / 100;

  const modifier = (cle: number, champ: "pourcentage" | "date", valeur: number | string) =>
    setLignes((l) => l.map((t) => (t.cle === cle ? { ...t, [champ]: valeur } : t)));
  const ajouter = () => {
    const derniere = lignes[lignes.length - 1];
    const base = derniere?.date ? new Date(derniere.date) : new Date();
    setLignes((l) => [...l, { cle: prochaineCle, id: null, pourcentage: 0, montantPaye: 0, statut: "EN_ATTENTE", date: ymd(addMonths(Number.isNaN(base.getTime()) ? new Date() : base, 6)) }]);
    setProchaineCle((n) => n + 1);
  };
  const retirer = (cle: number) => setLignes((l) => l.filter((t) => t.cle !== cle));

  if (!ouvert) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => setOuvert(true)} data-testid="modifier-echeancier">
          <CalendarClock className="h-4 w-4" /> Modifier l&apos;échéancier
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3" data-testid="form-echeancier">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-small text-navy-900">
            Seules les tranches <span className="font-medium">en attente</span> peuvent être retirées ou redécoupées ; une tranche déjà payée garde au moins son montant payé.
          </p>
          <Badge tone={total === 100 ? "success" : "danger"} dot className="tabular" data-testid="total-pourcentages-edition">
            Total {total}%
          </Badge>
        </div>
        <ol className="space-y-2">
          <AnimatePresence initial={false}>
          {lignes.map((t, i) => {
            const n = i + 1;
            const verrouillee = t.statut !== "EN_ATTENTE";
            const montant = Math.round((prix * (Number.isFinite(t.pourcentage) ? t.pourcentage : 0)) / 100);
            return (
              <motion.li
                key={t.cle}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
                className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-3 overflow-hidden rounded-md bg-navy-50 p-3"
                data-testid="tranche-edition"
                data-statut={t.statut}
              >
                <input type="hidden" name="trancheId" value={t.id ?? ""} />
                <div className="flex flex-col items-center gap-1 pr-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white tabular">{n}</span>
                  <span className="text-caption text-navy-400 tabular">{formatMoney(montant)}</span>
                  {verrouillee && <StatusBadge statut={t.statut} label={ECH_LABEL[t.statut] ?? t.statut} tone={ECH_TONE[t.statut as keyof typeof ECH_TONE] ?? "neutral"} />}
                </div>
                <Input
                  id={`edition-tranche${n}Pourcentage`}
                  name="tranchePourcentage"
                  type="number"
                  label={verrouillee ? `Pourcentage (payé ${formatMoney(t.montantPaye)})` : "Pourcentage"}
                  min={0}
                  max={100}
                  step={0.01}
                  value={Number.isFinite(t.pourcentage) ? t.pourcentage : ""}
                  onChange={(e) => modifier(t.cle, "pourcentage", e.target.valueAsNumber)}
                  clearable={false}
                  required
                />
                <Input id={`edition-tranche${n}Date`} name="trancheDate" type="date" label="Date" value={t.date} onChange={(e) => modifier(t.cle, "date", e.target.value)} clearable={false} required />
                {verrouillee ? (
                  <span className="w-9" aria-hidden />
                ) : (
                  <Button type="button" size="sm" variant="ghost" onClick={() => retirer(t.cle)} aria-label={`Retirer la tranche ${n}`} data-testid="retirer-tranche">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </motion.li>
            );
          })}
          </AnimatePresence>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={ajouter} disabled={lignes.length >= NB_TRANCHES_MAX} data-testid="ajouter-tranche">
            <Plus className="h-4 w-4" /> Ajouter une tranche
          </Button>
        </div>
        {state?.error && <Callout tone="danger" testId="echeancier-erreur">{state.error}</Callout>}
        <div className="flex flex-wrap gap-2 border-t border-navy-50 pt-3">
          <Button type="submit" loading={pending} data-testid="enregistrer-echeancier">
            <Save className="h-4 w-4" /> Enregistrer l&apos;échéancier
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOuvert(false)}>
            Annuler
          </Button>
        </div>
      </Card>
    </form>
  );
}
