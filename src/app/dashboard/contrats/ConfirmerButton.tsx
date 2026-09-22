"use client";

import { useState, useTransition } from "react";
import { confirmerContrat } from "./actions";
import { Button } from "@/components/ui/Button";

export function ConfirmerButton({ contratId }: { contratId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await confirmerContrat(contratId);
            setError(res?.error ?? null);
          })
        }
      >
        {pending ? "Génération du PDF..." : "Vérifier et confirmer"}
      </Button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
