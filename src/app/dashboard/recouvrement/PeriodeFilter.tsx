"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";

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
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {PERIODES.map((p) => (
          <Link
            key={p.value}
            href={p.value ? `/dashboard/recouvrement?periode=${p.value}` : "/dashboard/recouvrement"}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
              periode === p.value ? "bg-navy text-white ring-navy" : "bg-white text-navy ring-navy-100 hover:bg-navy-50",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (debut && fin) router.push(`/dashboard/recouvrement?periode=perso&du=${debut}&au=${fin}`);
        }}
      >
        <label className="text-xs text-navy-400">
          Du
          <Input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="mt-1 w-40" required />
        </label>
        <label className="text-xs text-navy-400">
          Au
          <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} className="mt-1 w-40" required />
        </label>
        <Button type="submit" size="sm" variant={periode === "perso" ? "primary" : "secondary"}>
          Filtrer
        </Button>
      </form>
    </div>
  );
}
