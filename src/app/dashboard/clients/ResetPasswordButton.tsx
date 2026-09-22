"use client";

import { useState, useTransition } from "react";
import { KeyRound } from "lucide-react";
import { resetClientPassword } from "./actions";

export function ResetPasswordButton({ clientId }: { clientId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {result && <span className="rounded bg-gold-50 px-2 py-1 font-mono text-xs text-gold-600">{result}</span>}
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await resetClientPassword(clientId);
            if ("password" in res) setResult(res.password);
          })
        }
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-navy-400 hover:bg-navy-50 hover:text-navy-900"
        title="Réinitialiser le mot de passe"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Réinitialiser
      </button>
    </div>
  );
}
