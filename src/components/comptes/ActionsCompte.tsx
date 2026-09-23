"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { Button, ConfirmButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  suspendreClient,
  supprimerClient,
  restaurerClient,
  suspendreUtilisateur,
  supprimerUtilisateur,
  restaurerUtilisateur,
  type ResultatCompte,
} from "@/lib/actions/comptes-actions";
import type { EtatCompteValeur } from "@/lib/comptes";

/** Délai pendant lequel le toast propose d'annuler une suspension / suppression. */
export const DELAI_ANNULATION_MS = 8000;

type Geste = "suspendre" | "supprimer" | "restaurer";

/**
 * Boutons Suspendre / Supprimer / Réactiver d'un compte (client ou interne).
 * Suspension et suppression passent par une confirmation en deux temps ; une
 * fois faites, un toast propose « Annuler » pendant 8 secondes, qui restaure
 * l'état précédent sans recréer le compte.
 *
 * Le bouton « Annuler » du toast passe par POST /api/comptes/restaurer et non
 * par une Server Action : le toast survit aux navigations, et une Server
 * Action n'est résolue que sur la page qui l'importe.
 */
export function ActionsCompte({
  type,
  id,
  nom,
  etat,
  venteEnCours = false,
  compact = false,
}: {
  type: "client" | "user";
  id: string;
  nom: string;
  etat: EtatCompteValeur;
  /** Client avec une vente en cours : suppression refusée, suspension proposée. */
  venteEnCours?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [enCours, setEnCours] = useState<Geste | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const pending = enCours !== null;

  const actions = type === "client"
    ? { suspendre: suspendreClient, supprimer: supprimerClient, restaurer: restaurerClient }
    : { suspendre: suspendreUtilisateur, supprimer: supprimerUtilisateur, restaurer: restaurerUtilisateur };

  const rafraichir = () => startTransition(() => router.refresh());

  const annuler = async () => {
    let r: ResultatCompte;
    try {
      const rep = await fetch("/api/comptes/restaurer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      r = (await rep.json()) as ResultatCompte;
    } catch {
      r = { error: "L'annulation n'a pas pu être envoyée. Réessayez depuis la fiche (bouton Réactiver)." };
    }
    if ("error" in r) toast({ kind: "error", title: "Annulation impossible", description: r.error });
    else toast({ kind: "success", title: "Action annulée", description: `${nom} est de nouveau actif.` });
    rafraichir();
  };

  const lancer = async (geste: Geste) => {
    if (pending) return;
    setEnCours(geste);
    setErreur(null);
    let res: ResultatCompte;
    try {
      res = await actions[geste](id);
    } catch {
      res = { error: "L'action n'a pas pu être exécutée. Réessayez." };
    }
    setEnCours(null);
    if ("error" in res) {
      setErreur(res.error);
      toast({ kind: "error", title: "Action impossible", description: res.error });
      return;
    }
    if (geste === "restaurer") {
      toast({ kind: "success", title: "Compte réactivé", description: nom });
    } else {
      toast({
        kind: geste === "supprimer" ? "info" : "success",
        title: geste === "supprimer" ? "Compte supprimé" : "Compte suspendu",
        description: geste === "supprimer" ? `${nom} — historique conservé.` : `${nom} ne peut plus se connecter.`,
        duration: DELAI_ANNULATION_MS,
        action: { label: "Annuler", onClick: annuler },
      });
    }
    rafraichir();
  };

  const taille = compact ? "sm" : "md";

  if (etat !== "actif") {
    return (
      <div className="inline-flex flex-col items-end gap-1" data-testid="actions-compte">
        <Button size={taille} variant="secondary" loading={enCours === "restaurer"} disabled={pending} onClick={() => lancer("restaurer")}>
          <RotateCcw /> Réactiver
        </Button>
        {erreur && <p className="text-caption text-danger-fg">{erreur}</p>}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1" data-testid="actions-compte">
      <div className="flex flex-wrap justify-end gap-2">
        <ConfirmButton
          size={taille}
          variant="secondary"
          confirmLabel="Confirmer la suspension ?"
          loading={enCours === "suspendre"}
          disabled={pending}
          onConfirm={() => lancer("suspendre")}
          data-testid="bouton-suspendre"
        >
          <Ban /> Suspendre
        </ConfirmButton>
        {venteEnCours ? (
          <Button size={taille} variant="ghost" disabled title="Vente en cours : suspendez le compte plutôt que de le supprimer" data-testid="bouton-supprimer">
            <Trash2 /> Supprimer
          </Button>
        ) : (
          <ConfirmButton
            size={taille}
            variant="danger"
            confirmLabel="Confirmer la suppression ?"
            loading={enCours === "supprimer"}
            disabled={pending}
            onConfirm={() => lancer("supprimer")}
            data-testid="bouton-supprimer"
          >
            <Trash2 /> Supprimer
          </ConfirmButton>
        )}
      </div>
      {venteEnCours && (
        <p className="text-caption text-navy-400" data-testid="vente-en-cours">
          Vente en cours : la suppression est bloquée, la suspension reste possible.
        </p>
      )}
      {erreur && <p className="text-caption text-danger-fg">{erreur}</p>}
    </div>
  );
}
