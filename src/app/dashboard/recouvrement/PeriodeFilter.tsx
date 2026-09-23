"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Filter } from "lucide-react";
import { Input } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const PERIODES = [
  { value: "", label: "Toutes" },
  { value: "aujourdhui", label: "Aujourd'hui" },
  { value: "demain", label: "Demain" },
  { value: "semaine", label: "Cette semaine" },
  { value: "semaine-prochaine", label: "Semaine prochaine" },
  { value: "mois", label: "Ce mois" },
  { value: "mois-prochain", label: "Mois prochain" },
];

/** Section 13.2 — filtres de période (navigation par searchParams, filtrage serveur). */
export function PeriodeFilter({ periode, du, au }: { periode: string; du: string; au: string }) {
  const router = useRouter();
  const [debut, setDebut] = useState(du);
  const [fin, setFin] = useState(au);

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="filtre-periode">
      <SegmentedControl
        ariaLabel="Période"
        value={periode === "perso" ? "__perso__" : periode}
        items={PERIODES.map((p) => ({
          value: p.value,
          label: p.label,
          href: p.value ? `/dashboard/recouvrement?periode=${p.value}` : "/dashboard/recouvrement",
        }))}
      />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (debut && fin) router.push(`/dashboard/recouvrement?periode=perso&du=${debut}&au=${fin}`);
        }}
      >
        <Input
          type="date"
          label="Du"
          value={debut}
          onChange={(e) => setDebut(e.target.value)}
          containerClassName="w-40"
          clearable={false}
          required
        />
        <Input
          type="date"
          label="Au"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          containerClassName="w-40"
          clearable={false}
          required
        />
        <Button type="submit" variant={periode === "perso" ? "primary" : "secondary"} className="h-12">
          <Filter className="h-4 w-4" /> Filtrer
        </Button>
      </form>
    </div>
  );
}
