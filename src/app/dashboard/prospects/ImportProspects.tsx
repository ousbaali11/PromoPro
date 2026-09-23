"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FileSpreadsheet, Upload, CheckCircle2, X } from "lucide-react";
import { analyserImportProspects, confirmerImportProspects, type RepartitionApercu } from "./actions";
import { Button } from "@/components/ui/Button";
import { Callout, Card, Badge } from "@/components/ui/Primitives";

/**
 * Import Excel des prospects (Assistant Administratif) : choix du fichier →
 * aperçu (valides, ignorées avec motif, répartition prévue) → confirmation.
 * Le fichier est lu en mémoire côté serveur, rien n'est écrit avant « Confirmer ».
 */
export function ImportProspects() {
  const [ouvert, setOuvert] = useState(false);
  const [analyse, analyserAction, analysePending] = useActionState(analyserImportProspects, undefined);
  const [confirmation, confirmerAction, confirmationPending] = useActionState(confirmerImportProspects, undefined);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const idFichier = useId();

  // Une fois l'import écrit, rafraîchir les cartes et le tableau de la page
  useEffect(() => {
    if (confirmation?.resultat) startTransition(() => router.refresh());
  }, [confirmation?.resultat, router]);

  const apercu = analyse?.apercu;
  const resultat = confirmation?.resultat;

  return (
    <div className="relative" data-testid="import-prospects">
      <Button variant="gold" size="sm" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} data-testid="bouton-import">
        <FileSpreadsheet className="h-4 w-4" /> Importer un fichier Excel
      </Button>
      <AnimatePresence initial={false}>
        {ouvert && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="absolute right-0 z-20 mt-2 w-[min(92vw,44rem)]"
          >
            <Card className="space-y-4 p-5 shadow-lg" data-testid="panneau-import">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-h3 text-navy-900">Importer des prospects</h2>
                  <p className="text-caption text-navy-400">
                    Classeur .xlsx ou .xls, première feuille, en-têtes <span className="font-medium">nom</span>,{" "}
                    <span className="font-medium">telephone</span>, <span className="font-medium">source</span> (ordre libre). Les lignes
                    invalides sont ignorées et comptées ; rien n&apos;est enregistré avant la confirmation.
                  </p>
                </div>
                <Button variant="ghost" size="sm" aria-label="Fermer l'import" onClick={() => setOuvert(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {resultat ? (
                <div className="space-y-3" data-testid="import-resultat">
                  <Callout tone="success" testId="import-succes">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> {resultat.importes} prospect{resultat.importes > 1 ? "s" : ""} importé
                      {resultat.importes > 1 ? "s" : ""}
                      {resultat.ignorees > 0 && ` (${resultat.ignorees} ligne${resultat.ignorees > 1 ? "s" : ""} ignorée${resultat.ignorees > 1 ? "s" : ""})`}.
                      Chaque commercial concerné a été notifié.
                    </span>
                  </Callout>
                  <Repartition repartition={resultat.repartition} ecart={resultat.ecart} testId="resultat-commercial" />
                  <Button size="sm" variant="secondary" onClick={() => setOuvert(false)}>
                    Fermer
                  </Button>
                </div>
              ) : (
                <>
                  <form action={analyserAction} className="flex flex-wrap items-end gap-3" data-testid="form-import">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={idFichier} className="mb-1 block text-caption font-medium text-navy-900">
                        Fichier Excel
                      </label>
                      <input
                        id={idFichier}
                        name="fichier"
                        type="file"
                        accept=".xlsx,.xls"
                        required
                        data-testid="fichier-import"
                        className="block w-full text-small text-navy-900 file:mr-3 file:rounded-sm file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-small file:font-medium file:text-navy-900 hover:file:bg-navy-100"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="secondary" loading={analysePending}>
                      <Upload className="h-4 w-4" /> Analyser le fichier
                    </Button>
                  </form>
                  {analyse?.error && (
                    <Callout tone="danger" testId="import-erreur">
                      {analyse.error}
                    </Callout>
                  )}

                  {apercu && (
                    <div className="space-y-3 border-t border-navy-50 pt-4" data-testid="import-apercu">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="success" data-testid="apercu-valides">
                          {apercu.valides.length} prospect{apercu.valides.length > 1 ? "s" : ""} valide{apercu.valides.length > 1 ? "s" : ""}
                        </Badge>
                        <Badge tone={apercu.ignorees.length ? "warning" : "neutral"} data-testid="apercu-ignorees">
                          {apercu.ignorees.length} ligne{apercu.ignorees.length > 1 ? "s" : ""} ignorée{apercu.ignorees.length > 1 ? "s" : ""}
                        </Badge>
                        <span className="text-caption text-navy-400">{apercu.nomFichier}</span>
                      </div>
                      {apercu.ignorees.length > 0 && (
                        <ul className="max-h-32 space-y-0.5 overflow-auto rounded-md bg-navy-50 p-3 text-caption text-navy-900" data-testid="apercu-motifs">
                          {apercu.ignorees.map((i) => (
                            <li key={i.ligne}>
                              Ligne {i.ligne} : {i.motif}
                            </li>
                          ))}
                        </ul>
                      )}
                      <Repartition repartition={apercu.repartition} ecart={apercu.ecart} testId="apercu-commercial" />
                      <form action={confirmerAction} className="space-y-2">
                        <input type="hidden" name="nomFichier" value={apercu.nomFichier} />
                        <input type="hidden" name="lignes" value={JSON.stringify(apercu.valides)} />
                        <input type="hidden" name="ignorees" value={apercu.ignorees.length} />
                        {confirmation?.error && <Callout tone="danger">{confirmation.error}</Callout>}
                        <Button type="submit" size="sm" variant="gold" loading={confirmationPending} data-testid="confirmer-import">
                          <CheckCircle2 className="h-4 w-4" /> Confirmer l&apos;import
                        </Button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Répartition par commercial : charge actuelle, nouveaux attribués, total à contacter. */
function Repartition({ repartition, ecart, testId }: { repartition: RepartitionApercu[]; ecart: number; testId: string }) {
  return (
    <div className="space-y-2">
      <p className="text-caption text-navy-400">
        Répartition équilibrée sur les prospects « non contactés » (écart final : {ecart}) —{" "}
        {ecart <= 1 ? "charges égalisées à 1 près." : "le lot ne suffit pas à combler l'écart de départ ; tout va au moins chargé."}
      </p>
      <ul className="divide-y divide-navy-50 rounded-md ring-1 ring-navy-100/70">
        {repartition.map((c) => (
          <li key={c.commercialId} className="px-3 py-2" data-testid={testId} data-commercial-id={c.commercialId} data-total={c.total} data-nouveaux={c.attribues.length}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-small">
              <span className="font-medium text-navy-900">
                {c.nom}
                {c.role === "RESPONSABLE_COMMERCIAL" && <span className="ml-1.5 text-caption font-normal text-navy-400">Responsable commercial</span>}
              </span>
              <span className="tabular text-navy-400">
                {c.chargeInitiale} à contacter <span className="mx-1 text-navy-300">·</span>
                <span className={c.attribues.length > 0 ? "font-semibold text-gold-600" : ""}>+{c.attribues.length}</span>
                <span className="mx-1 text-navy-300">→</span>
                <span className="font-semibold text-navy-900">{c.total}</span>
              </span>
            </div>
            {c.attribues.length > 0 && (
              <p className="mt-0.5 line-clamp-2 text-caption text-navy-400">
                {c.attribues.map((n, i) => (
                  <span key={i} data-testid="apercu-attribue">
                    {i > 0 && ", "}
                    {n}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
