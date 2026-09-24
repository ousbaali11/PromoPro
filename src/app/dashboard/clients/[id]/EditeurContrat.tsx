"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FileDown, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button, ConfirmButton } from "@/components/ui/Button";
import { Callout, Card, Input, Textarea } from "@/components/ui/Primitives";
import { useToast } from "@/components/ui/Toast";
import type { SectionContrat } from "@/lib/contrats-sections";
import { enregistrerEtGenererContrat, enregistrerSectionsContrat, repartirDuModele, restaurerContrat, supprimerContrat, type EtatContrat } from "./contrat-actions";

/**
 * Éditeur du contrat d'un dossier précis (Responsable Administratif) : du
 * texte simple, déjà rempli avec les données du dossier à la création,
 * modifiable comme dans un traitement de texte — aucun jeton, aucune syntaxe
 * spéciale. Titre + texte par section, réordonnancement, ajout, suppression
 * (deux temps). « Enregistrer » sauvegarde sans confirmation ; « Générer le
 * PDF » archive la version précédente. Formulaire contrôlé : rien n'est perdu
 * après une erreur serveur. Le modèle par défaut se gère sur un écran séparé.
 */
type Ligne = SectionContrat & { cle: number };

export function EditeurContrat({ contratId, sections, statut }: { contratId: string; sections: SectionContrat[]; statut: string }) {
  const [lignes, setLignes] = useState<Ligne[]>(() => sections.map((s, i) => ({ ...s, cle: i + 1 })));
  const [prochaineCle, setProchaineCle] = useState(sections.length + 1);
  const [etatSauvegarde, sauvegarder, pendingSauvegarde] = useActionState<EtatContrat, FormData>(enregistrerSectionsContrat.bind(null, contratId), undefined);
  const [etatGeneration, generer, pendingGeneration] = useActionState<EtatContrat, FormData>(enregistrerEtGenererContrat.bind(null, contratId), undefined);
  const [message, setMessage] = useState<EtatContrat>(undefined);
  const [pendingAutre, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const pending = pendingSauvegarde || pendingGeneration || pendingAutre;
  const etat = etatGeneration ?? etatSauvegarde ?? message;

  const modifier = (cle: number, champ: "titre" | "contenu", valeur: string) =>
    setLignes((l) => l.map((s) => (s.cle === cle ? { ...s, [champ]: valeur } : s)));
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
    setLignes((l) => [...l, { id: "", titre: "", contenu: "", cle: prochaineCle }]);
    setProchaineCle((n) => n + 1);
  };
  const lancer = (action: () => Promise<EtatContrat>) =>
    startTransition(async () => {
      const r = await action();
      setMessage(r);
      if (r?.success) router.refresh();
    });
  const supprimer = () =>
    startTransition(async () => {
      const r = await supprimerContrat(contratId);
      if (r?.error) {
        setMessage(r);
        return;
      }
      toast({
        kind: "success",
        title: "Contrat supprimé",
        description: "Il reste consultable dans l'historique.",
        duration: 8000,
        action: {
          label: "Annuler",
          onClick: async () => {
            const res = await restaurerContrat(contratId);
            toast(res?.error ? { kind: "error", title: "Annulation impossible", description: res.error } : { kind: "success", title: "Contrat restauré" });
            router.refresh();
          },
        },
      });
      router.refresh();
    });

  return (
    <form action={sauvegarder} className="space-y-4" data-testid="editeur-contrat">
      <ol className="space-y-3">
        {lignes.map((s, index) => (
          <li key={s.cle}>
            <Card className="space-y-3 p-4" data-testid="section-contrat" data-section-id={s.id || undefined}>
              <input type="hidden" name="sectionId" value={s.id} />
              <div className="flex items-start gap-2">
                <span className="mt-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white tabular">
                  {index + 1}
                </span>
                <Input
                  id={`section-titre-${s.cle}`}
                  name="titre"
                  label="Titre de la section"
                  value={s.titre}
                  onChange={(e) => modifier(s.cle, "titre", e.target.value)}
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
                  <ConfirmButton size="sm" variant="ghost" confirmLabel="Supprimer ?" onConfirm={() => retirer(s.cle)} aria-label="Supprimer la section" data-testid="supprimer-section">
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
              <Textarea id={`section-contenu-${s.cle}`} name="contenu" label="Texte" rows={4} value={s.contenu} onChange={(e) => modifier(s.cle, "contenu", e.target.value)} />
            </Card>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={ajouter} data-testid="ajouter-section">
          <Plus className="h-4 w-4" /> Ajouter une section
        </Button>
        <ConfirmButton size="sm" variant="ghost" confirmLabel="Remplacer toutes les sections ?" onConfirm={() => lancer(() => repartirDuModele(contratId))} disabled={pending} data-testid="repartir-modele">
          <RotateCcw className="h-4 w-4" /> Repartir du modèle par défaut
        </ConfirmButton>
      </div>

      {etat?.error && <Callout tone="danger">{etat.error}</Callout>}
      {etat?.success && (
        <Callout tone="success" testId="contrat-message">
          {etat.success}
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-50 pt-4">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" loading={pendingSauvegarde} disabled={pending} data-testid="enregistrer-sections">
            <Save className="h-4 w-4" /> Enregistrer
          </Button>
          <Button type="submit" formAction={generer} variant="gold" loading={pendingGeneration} disabled={pending} data-testid="generer-pdf">
            <FileDown className="h-4 w-4" /> {statut === "EN_ATTENTE" ? "Générer le PDF et confirmer" : "Générer un nouveau PDF"}
          </Button>
        </div>
        <ConfirmButton size="sm" variant="danger" confirmLabel="Confirmer la suppression ?" onConfirm={supprimer} disabled={pending} data-testid="supprimer-contrat">
          <Trash2 className="h-4 w-4" /> Supprimer ce contrat
        </ConfirmButton>
      </div>
    </form>
  );
}

/** Bouton « Créer un nouveau contrat » (bien vendu au client, aucun contrat actif). */
export function CreerContratButton({ bienId, clientId, creer }: { bienId: string; clientId: string; creer: (bienId: string, clientId: string) => Promise<EtatContrat> }) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="gold"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await creer(bienId, clientId);
            setErreur(r?.error ?? null);
            if (r?.success) router.refresh();
          })
        }
        data-testid="creer-contrat"
      >
        <Plus className="h-4 w-4" /> Créer un nouveau contrat
      </Button>
      {erreur && <p className="text-caption text-danger-fg">{erreur}</p>}
    </div>
  );
}

/** Bouton « Restaurer » d'un contrat supprimé (historique). */
export function RestaurerContratButton({ contratId }: { contratId: string }) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await restaurerContrat(contratId);
            setErreur(r?.error ?? null);
            if (r?.success) router.refresh();
          })
        }
        data-testid="restaurer-contrat"
      >
        <RotateCcw className="h-4 w-4" /> Restaurer
      </Button>
      {erreur && <p className="text-caption text-danger-fg">{erreur}</p>}
    </div>
  );
}
