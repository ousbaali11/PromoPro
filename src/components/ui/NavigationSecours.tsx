"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";

/**
 * Les deux issues de secours des pages d'erreur et d'introuvable :
 * - « Retour à l'accueil » pointe sur `/`, qui redirige selon la session
 *   (client → /client, Super Admin → /admin, staff → /dashboard, sinon /login) ;
 * - « Page précédente » revient dans l'historique, ou sur l'accueil s'il est vide.
 */
export function NavigationSecours({ className }: { className?: string }) {
  const router = useRouter();
  const precedente = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };
  return (
    <div className={className}>
      <LinkButton href="/" variant="primary">
        <Home className="h-4 w-4" /> Retour à l&apos;accueil
      </LinkButton>
      <Button variant="secondary" onClick={precedente}>
        <ArrowLeft className="h-4 w-4" /> Page précédente
      </Button>
    </div>
  );
}
