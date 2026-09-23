"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { KeyRound } from "lucide-react";
import { resetClientPassword } from "./actions";
import { ConfirmButton } from "@/components/ui/Button";

/**
 * Réinitialisation du mot de passe client : action sensible, donc confirmation
 * en deux temps ; le nouveau mot de passe s'affiche à côté, à communiquer.
 */
export function ResetPasswordButton({ clientId }: { clientId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      <AnimatePresence>
        {result && (
          <motion.span
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="rounded-xs bg-gold-50 px-2 py-1 font-mono text-caption text-gold-700 ring-1 ring-inset ring-gold-200"
            data-testid="mot-de-passe-reinitialise"
          >
            {result}
          </motion.span>
        )}
      </AnimatePresence>
      <ConfirmButton
        size="sm"
        variant="ghost"
        loading={pending}
        confirmLabel="Confirmer la réinitialisation ?"
        onConfirm={() =>
          startTransition(async () => {
            const res = await resetClientPassword(clientId);
            if ("password" in res) setResult(res.password);
          })
        }
      >
        <KeyRound className="h-3.5 w-3.5" /> Réinitialiser
      </ConfirmButton>
    </div>
  );
}
