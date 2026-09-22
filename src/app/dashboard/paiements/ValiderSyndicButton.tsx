"use client";

import { useState, useTransition } from "react";
import { validerSyndic } from "./actions";
import { Button } from "@/components/ui/Button";

export function ValiderSyndicButton({ syndicId }: { syndicId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await validerSyndic(syndicId);
            setError(res?.error ?? null);
          })
        }
      >
        {pending ? "..." : "Valider le syndic"}
      </Button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
