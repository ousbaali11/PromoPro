import { formatMoney, formatMoneyCompact } from "@/lib/utils";

/**
 * Montant d'une carte de synthèse : forme compacte (« 2,14 Md MAD ») dès le
 * million, montant exact en info-bulle et en attribut de données. Le rendu
 * reste borné quelle que soit la croissance des chiffres (voir
 * formatMoneyCompact).
 */
export function MontantCompact({ montant, devise = "MAD", testId }: { montant: number; devise?: string; testId?: string }) {
  const exact = formatMoney(montant, devise);
  const compact = formatMoneyCompact(montant, devise);
  return (
    <span className="whitespace-nowrap" title={compact !== exact ? exact : undefined} data-montant={montant} data-testid={testId}>
      {compact}
    </span>
  );
}
