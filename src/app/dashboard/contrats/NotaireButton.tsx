"use client";

import { useState, useTransition } from "react";
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
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await marquerTransmisNotaire(bienId);
            setError(res?.error ?? null);
          })
        }
      >
        {pending ? "..." : "Dossier transmis au notaire"}
      </Button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
