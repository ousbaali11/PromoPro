"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button, ConfirmButton } from "@/components/ui/Button";
import { Callout, Card, Input } from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import { useHydrated } from "@/components/ui/useHydrated";
import type { SectionModele } from "@/lib/contrats-sections";
import { EditeurSegments } from "./EditeurSegments";
import { enregistrerModele, repartirDuJeuIntegre, type EtatModele } from "@/app/dashboard/contrats/modele/actions";

type Ligne = SectionModele & { cle: number };

/**
 * Écran « Gérer le modèle par défaut » : sections ordonnées du modèle du
 * promoteur, chacune avec un titre et un contenu où les champs dynamiques
 * sont des étiquettes insérées par un bouton. Enregistrer ne demande pas de
 * confirmation ; repartir du jeu intégré, oui (deux temps).
 */
export function EditeurModele({ sections, existant }: { sections: SectionModele[]; existant: boolean }) {
  const [lignes, setLignes] = useState<Ligne[]>(() => sections.map((s, i) => ({ ...s, cle: i + 1 })));
  const [prochaineCle, setProchaineCle] = useState(sections.length + 1);
  const [titres, setTitres] = useState<Record<number, string>>(() => Object.fromEntries(sections.map((s, i) => [i + 1, s.titre])));
  const { toast } = useToast();
  const hydrated = useHydrated();
  // Succès signalé par un toast : la page revalidée remonte l'éditeur (clé = date du modèle) avec les sections enregistrées
  const [state, formAction, pending] = useActionState<EtatModele, FormData>(async (prev, formData) => {
    const r = await enregistrerModele(prev, formData);
    if (r?.success) toast({ kind: "success", title: "Modèle enregistré", description: r.success, duration: 6000 });
    return r;
  }, undefined);
  const [etatReset, reset, pendingReset] = useActionState<EtatModele, FormData>(async () => {
    const r = await repartirDuJeuIntegre();
    if (r?.success) toast({ kind: "success", title: "Modèle remplacé", description: r.success, duration: 6000 });
    return r;
  }, undefined);
  const etat = etatReset ?? state;

  const deplacer = (index: number, sens: -1 | 1) =>
    setLignes((l) => {
      const cible = index + sens;
      if (cible < 0 || cible >= l.length) return l;
      const copie = [...l];
      [copie[index], copie[cible]] = [copie[cible], copie[index]];
      return copie;
    });
  const retirer = (cle: number) => setLignes((l) => l.filter((s) => s.cle !== cle));
  const ajouter = () => {
    setLignes((l) => [...l, { cle: prochaineCle, titre: "", segments: [] }]);
    setTitres((t) => ({ ...t, [prochaineCle]: "" }));
    setProchaineCle((n) => n + 1);
  };

  return (
    <form action={formAction} className="space-y-4" data-testid="editeur-modele" data-hydrated={hydrated ? "true" : undefined}>
      <ol className="space-y-3">
        <AnimatePresence initial={false}>
        {lignes.map((s, index) => (
          <motion.li key={s.cle} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}>
            <Card className="space-y-3 p-4" data-testid="section-modele">
              <div className="flex items-start gap-2">
                <span className="mt-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white tabular">{index + 1}</span>
                <Input
                  id={`modele-titre-${s.cle}`}
                  name="titre"
                  label="Titre de la section"
                  value={titres[s.cle] ?? ""}
                  onChange={(e) => setTitres((t) => ({ ...t, [s.cle]: e.target.value }))}
                  containerClassName="flex-1"
                  clearable={false}
                  required
                />
                <div className="mt-1 flex shrink-0 items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => deplacer(index, -1)} disabled={index === 0} aria-label="Monter la section">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => deplacer(index, 1)} disabled={index === lignes.length - 1} aria-label="Descendre la section">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <ConfirmButton size="sm" variant="ghost" confirmLabel="Supprimer ?" onConfirm={() => retirer(s.cle)} aria-label="Supprimer la section" data-testid="supprimer-section-modele">
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
              <EditeurSegments nom="segments" segments={s.segments} label="Contenu" testId="contenu-modele" />
            </Card>
          </motion.li>
        ))}
        </AnimatePresence>
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={ajouter} data-testid="ajouter-section-modele">
          <Plus className="h-4 w-4" /> Ajouter une section
        </Button>
      </div>

      {etat?.error && <Callout tone="danger" testId="modele-erreur">{etat.error}</Callout>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-50 pt-4">
        <Button type="submit" loading={pending} disabled={pending || pendingReset} data-testid="enregistrer-modele">
          <Save className="h-4 w-4" /> {existant ? "Enregistrer le modèle" : "Enregistrer comme modèle par défaut"}
        </Button>
        <ConfirmButton size="sm" variant="ghost" confirmLabel="Remplacer par le jeu intégré ?" onConfirm={() => reset(new FormData())} disabled={pending || pendingReset} data-testid="repartir-jeu-integre">
          <RotateCcw className="h-4 w-4" /> Repartir du jeu de sections intégré
        </ConfirmButton>
      </div>
    </form>
  );
}
