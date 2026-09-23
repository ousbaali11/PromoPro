"use client";

import { useEffect, useState, useTransition } from "react";
import { Camera, Clock } from "lucide-react";
import { demanderPhotos } from "./actions";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

function compteARebours(cible: number) {
  const diff = Math.max(0, cible - Date.now());
  const jours = Math.floor(diff / 86_400_000);
  const heures = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (jours > 0) return `${jours} j ${heures} h`;
  if (heures > 0) return `${heures} h ${minutes} min`;
  return `${minutes} min`;
}

/**
 * Section 11.3 — bouton « Demander des photos » : grisé pendant 6 mois après
 * une demande, avec la date de prochaine disponibilité et un compte à rebours.
 */
export function DemandePhotosButton({
  bienId,
  prochaineDisponibiliteISO,
  bloque,
  demandeEnAttente,
}: {
  bienId: string;
  prochaineDisponibiliteISO: string | null;
  /** Calculé côté serveur : une demande a été faite il y a moins de 6 mois */
  bloque: boolean;
  demandeEnAttente: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cible = prochaineDisponibiliteISO ? new Date(prochaineDisponibiliteISO).getTime() : 0;
  const [reste, setReste] = useState("");

  // Compte à rebours calculé côté client uniquement, rafraîchi chaque minute
  useEffect(() => {
    if (!bloque || !cible) return;
    const update = () => setReste(compteARebours(cible));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [bloque, cible]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={bloque}
          loading={pending}
          title={bloque ? "Une demande par période de 6 mois" : undefined}
          onClick={() =>
            startTransition(async () => {
              const res = await demanderPhotos(bienId);
              setError(res?.error ?? null);
            })
          }
        >
          <Camera className="h-4 w-4" /> Demander des photos
        </Button>
        {demandeEnAttente && <StatusBadge statut="EN_ATTENTE" label="Demande transmise au SAV" tone="warning" />}
      </div>
      {bloque && (
        <p className="inline-flex items-center gap-1.5 text-caption text-navy-400">
          <Clock className="h-3.5 w-3.5" />
          Prochaine demande possible le{" "}
          {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(cible))}
          {" · "}dans {reste}
        </p>
      )}
      {error && <p className="text-caption text-danger-fg">{error}</p>}
    </div>
  );
}
