"use client";

import { useState, useTransition } from "react";
import { Landmark } from "lucide-react";
import { marquerTransmisNotaire } from "./actions";
import { Button } from "@/components/ui/Button";

export function NotaireButton({ bienId }: { bienId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await marquerTransmisNotaire(bienId);
            setError(res?.error ?? null);
          })
        }
      >
        <Landmark className="h-4 w-4" /> Dossier transmis au notaire
      </Button>
      {error && <p className="text-caption text-danger-fg">{error}</p>}
    </div>
  );
}
