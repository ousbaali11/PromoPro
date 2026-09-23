"use client";

import { useState, useTransition } from "react";
import { FileCheck2 } from "lucide-react";
import { confirmerContrat } from "./actions";
import { Button } from "@/components/ui/Button";

export function ConfirmerButton({ contratId }: { contratId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        loading={pending}
        title="Génère le contrat PDF"
        onClick={() =>
          startTransition(async () => {
            const res = await confirmerContrat(contratId);
            setError(res?.error ?? null);
          })
        }
      >
        <FileCheck2 className="h-4 w-4" /> Vérifier et confirmer
      </Button>
      {error && <p className="text-caption text-danger-fg">{error}</p>}
    </div>
  );
}
