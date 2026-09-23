"use client";

import { useState } from "react";
import { ExternalLink, FileImage } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PlanPreview } from "@/components/ui/PlanPreview";
import { LinkButton } from "@/components/ui/Button";
import { ModelViewer } from "./ModelViewer";

export type Plans = { plan2dUrl: string | null; plan3dUrl: string | null; visiteVirtuelleUrl: string | null };

/**
 * Plans d'un bien : onglets « Plan 2D », « Modèle 3D », « Visite virtuelle »,
 * chacun présent seulement si la donnée existe. Sans aucun plan, un état vide.
 */
export function PlansBien({ plans, designation, className }: { plans: Plans; designation: string; className?: string }) {
  const onglets = [
    plans.plan2dUrl ? { value: "2d", label: "Plan 2D" } : null,
    plans.plan3dUrl ? { value: "3d", label: "Modèle 3D" } : null,
    plans.visiteVirtuelleUrl ? { value: "visite", label: "Visite virtuelle" } : null,
  ].filter((o): o is { value: string; label: string } => !!o);
  const [actif, setActif] = useState(onglets[0]?.value ?? "");

  if (onglets.length === 0) {
    return (
      <div className={className} data-testid="plans-vides">
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-navy-300">
          <FileImage className="h-8 w-8" />
          <p className="text-caption">Aucun plan importé.</p>
        </div>
      </div>
    );
  }

  const courant = onglets.some((o) => o.value === actif) ? actif : onglets[0].value;

  return (
    <div className={className} data-testid="plans-bien">
      {onglets.length > 1 && (
        <div className="border-b border-navy-50 p-2">
          <SegmentedControl ariaLabel="Plans du bien" size="sm" value={courant} onChange={setActif} items={onglets} testId="onglets-plans" />
        </div>
      )}
      <div className="min-h-64 bg-blueprint" data-onglet={courant}>
        {courant === "2d" && plans.plan2dUrl && (
          <div className="flex min-h-64 items-center justify-center">
            <PlanPreview url={plans.plan2dUrl} />
          </div>
        )}
        {courant === "3d" && plans.plan3dUrl && <ModelViewer src={plans.plan3dUrl} alt={`Modèle 3D — ${designation}`} className="h-72" />}
        {courant === "visite" && plans.visiteVirtuelleUrl && (
          <div className="flex flex-col">
            <iframe
              src={plans.visiteVirtuelleUrl}
              title={`Visite virtuelle — ${designation}`}
              className="h-72 w-full bg-white"
              sandbox="allow-scripts allow-same-origin allow-popups"
              allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer"
              loading="lazy"
              data-testid="visite-virtuelle"
            />
            <div className="flex justify-end p-2">
              <LinkButton href={plans.visiteVirtuelleUrl} variant="secondary" size="sm" target="_blank">
                <ExternalLink className="h-3.5 w-3.5" /> Ouvrir la visite dans un nouvel onglet
              </LinkButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
