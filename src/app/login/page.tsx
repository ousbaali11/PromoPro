"use client";

import { useActionState } from "react";
import { Building2, AlertCircle } from "lucide-react";
import { login } from "./actions";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";

const DEMO = [
  ["Super Admin", "SUPERADMIN / admin1234"],
  ["PDG", "PDG-DEMO / demo1234"],
  ["Directeur Commercial", "DIRCOM-DEMO / demo1234"],
  ["Commercial", "COM1-DEMO / demo1234"],
  ["Responsable Administratif", "RESPADM-DEMO / demo1234"],
  ["Directeur Financier", "DIRFIN-DEMO / demo1234"],
  ["Comptable Interne", "COMPTA-DEMO / demo1234"],
  ["Assistant Administratif", "ASSIST-DEMO / demo1234"],
  ["Service Après-Vente", "SAV-DEMO / demo1234"],
  ["Recouvrement", "RECOUV-DEMO / demo1234"],
  ["Client", "CL-DEMO / demo1234"],
];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy px-4 py-10">
      {/* Fond : calque d'architecte doré, très discret, et halo chaud derrière la carte */}
      <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-60" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--color-gold), transparent)" }}
        aria-hidden
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-gold shadow-e3">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-h1 text-white">PromoPro</h1>
          <p className="mt-1 text-small text-navy-100/70">Plateforme de gestion promoteur</p>
        </div>

        <form action={formAction} className="rounded-xl bg-white p-6 shadow-e5 ring-1 ring-white/10">
          <div className="space-y-3">
            <Input id="identifiant" name="identifiant" label="Identifiant" autoComplete="username" required autoFocus />
            <Input id="motDePasse" name="motDePasse" label="Mot de passe" type="password" autoComplete="current-password" required />
          </div>

          {state?.error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-sm border border-danger-border bg-danger-bg px-3 py-2 text-small text-danger-fg"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {state.error}
            </p>
          )}

          <Button type="submit" loading={pending} className="mt-6 w-full" size="lg">
            Se connecter
          </Button>
        </form>

        <details className="group mt-6 rounded-md bg-white/5 p-4 text-caption text-navy-100/70 ring-1 ring-inset ring-white/10">
          <summary className="cursor-pointer select-none font-medium text-navy-100 transition-colors duration-fast hover:text-white">
            Comptes de démonstration
          </summary>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {DEMO.map(([role, acces]) => (
              <div key={role} className="contents">
                <dt className="text-navy-200/80">{role}</dt>
                <dd className="font-mono text-[11px] text-navy-100">{acces}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </div>
  );
}
