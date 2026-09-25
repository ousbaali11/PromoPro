"use client";

import { Component, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Primitives";

/**
 * Frontière d'erreur de la section graphiques : un calcul qui échoue (données
 * incohérentes, panne) n'emporte plus toute la page vers error.tsx — le reste du
 * tableau de bord reste utilisable, la section affiche un message et un bouton
 * « Réessayer » qui recharge les données du serveur.
 */
class Frontiere extends Component<{ children: ReactNode; surReessai: () => void }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() {
    return { erreur: true };
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <Callout tone="danger" title="Les graphiques n'ont pas pu être calculés" className="mt-8" testId="graphiques-erreur">
        <p>Le reste du tableau de bord reste disponible. Réessayez ; si le problème persiste, contactez votre administrateur.</p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            this.setState({ erreur: false });
            this.props.surReessai();
          }}
          data-testid="graphiques-reessayer"
        >
          <RotateCcw className="h-4 w-4" /> Réessayer
        </Button>
      </Callout>
    );
  }
}

export function ErreurGraphiques({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <Frontiere surReessai={() => router.refresh()}>{children}</Frontiere>;
}
