"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Building2 } from "lucide-react";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gold">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-white">PromoPro</h1>
          <p className="mt-1 text-sm text-navy-100/70">Plateforme de gestion promoteur</p>
        </div>

        <form action={formAction} className="rounded-xl bg-white p-6 shadow-xl">
          <div className="space-y-4">
            <div>
              <label htmlFor="identifiant" className="mb-1.5 block text-sm font-medium text-navy-900">
                Identifiant
              </label>
              <input
                id="identifiant"
                name="identifiant"
                autoComplete="username"
                required
                placeholder="ex. PDG-DEMO"
                className="w-full rounded-md border border-navy-100 px-3 py-2 text-sm focus:border-gold focus:ring-1 focus:ring-gold"
              />
            </div>
            <div>
              <label htmlFor="motDePasse" className="mb-1.5 block text-sm font-medium text-navy-900">
                Mot de passe
              </label>
              <input
                id="motDePasse"
                name="motDePasse"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-md border border-navy-100 px-3 py-2 text-sm focus:border-gold focus:ring-1 focus:ring-gold"
              />
            </div>
          </div>

          {state?.error && (
            <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-6 w-full rounded-md bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-600 disabled:opacity-60"
          >
            {pending ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <details className="mt-6 rounded-lg bg-white/5 p-4 text-xs text-navy-100/70">
          <summary className="cursor-pointer select-none font-medium text-navy-100">
            Comptes de démonstration
          </summary>
          <div className="mt-2 space-y-1">
            <p>Super Admin — SUPERADMIN / admin1234</p>
            <p>PDG — PDG-DEMO / demo1234</p>
            <p>Directeur Commercial — DIRCOM-DEMO / demo1234</p>
            <p>Commercial — COM1-DEMO / demo1234</p>
            <p>Responsable Administratif — RESPADM-DEMO / demo1234</p>
            <p>Directeur Financier — DIRFIN-DEMO / demo1234</p>
            <p>Comptable Interne — COMPTA-DEMO / demo1234</p>
            <p>Assistant Administratif — ASSIST-DEMO / demo1234</p>
            <p>Service Après-Vente — SAV-DEMO / demo1234</p>
            <p>Recouvrement — RECOUV-DEMO / demo1234</p>
            <p>Client — CL-DEMO / demo1234</p>
          </div>
        </details>
      </div>
    </div>
  );
}
