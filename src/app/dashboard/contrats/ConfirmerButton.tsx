"use client";

import { useTransition } from "react";
import { confirmerContrat } from "./actions";
import { Button } from "@/components/ui/Button";

export function ConfirmerButton({ contratId }: { contratId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" disabled={pending} onClick={() => startTransition(() => confirmerContrat(contratId))}>
      {pending ? "..." : "Vérifier et confirmer"}
    </Button>
  );
}
