"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FileSpreadsheet, Upload, CheckCircle2, X } from "lucide-react";
import { analyserImportBiens, confirmerImportBiens } from "../actions";
import { Button } from "@/components/ui/Button";
import { Callout, Card, Badge } from "@/components/ui/Primitives";
import { soumettreSansReinitialiser } from "@/components/ui/soumission";
import { useRecalageDansFenetre } from "@/components/ui/recalage";
import { formatMoney } from "@/lib/utils";

/**
 * Import Excel des biens d'un projet (Directeur Commercial), sur le modèle de
 * l'import des prospects : choix du fichier → aperçu (biens valides, lignes
 * ignorées avec motif) → confirmation. Le fichier est lu en mémoire côté
 * serveur, rien n'est écrit avant « Confirmer ».
 */
export function ImportBiens({ projetId }: { projetId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [analyse, analyserAction, analysePending] = useActionState(analyserImportBiens, undefined);
  const [confirmation, confirmerAction, confirmationPending] = useActionState(confirmerImportBiens, undefined);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const idFichier = useId();
  const racine = useRef<HTMLDivElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  useRecalageDansFenetre(ouvert, racine, panneau, "right");

  // Une fois l'import écrit, rafraîchir la liste des biens de la page
  useEffect(() => {
    if (confirmation?.resultat) startTransition(() => router.refresh());
  }, [confirmation?.resultat, router]);

  const apercu = analyse?.apercu;
  const resultat = confirmation?.resultat;
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

  return (
    <div ref={racine} className="relative" data-testid="import-biens">
      <Button variant="gold" size="sm" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} data-testid="bouton-import-biens">
        <FileSpreadsheet className="h-4 w-4" /> Importer depuis un fichier Excel
      </Button>
      <AnimatePresence initial={false}>
        {ouvert && (
          <motion.div
            ref={panneau}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
            className="absolute right-0 z-20 mt-2 w-[min(92vw,44rem)]"
          >
            <Card className="space-y-4 p-5 shadow-lg" data-testid="panneau-import-biens">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-h3 text-navy-900">Importer des biens</h2>
                  <p className="text-caption text-navy-400">
                    Classeur .xlsx ou .xls, première feuille, en-têtes <span className="font-medium">désignation</span>,{" "}
                    <span className="font-medium">nature</span>, <span className="font-medium">prix</span>, <span className="font-medium">surface</span> (ordre libre,
                    accents et majuscules indifférents). La nature doit être l&apos;une des natures de la liste du site. Les lignes invalides sont ignorées
                    et comptées avec leur motif ; rien n&apos;est enregistré avant la confirmation.
                  </p>
                </div>
                <Button variant="ghost" size="sm" aria-label="Fermer l'import" onClick={() => setOuvert(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {resultat ? (
                <div className="space-y-3" data-testid="import-biens-resultat">
                  <Callout tone="success" testId="import-biens-succes">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> {pluriel(resultat.importes, "bien")} importé{resultat.importes > 1 ? "s" : ""}
                      {resultat.ignorees > 0 && ` (${pluriel(resultat.ignorees, "ligne")} ignorée${resultat.ignorees > 1 ? "s" : ""})`}, au statut « Disponible ».
                    </span>
                  </Callout>
                  <Button size="sm" variant="secondary" onClick={() => setOuvert(false)}>
                    Fermer
                  </Button>
                </div>
              ) : (
                <>
                  <form action={analyserAction} onSubmit={soumettreSansReinitialiser(analyserAction)} className="flex flex-wrap items-end gap-3" data-testid="form-import-biens">
                    <input type="hidden" name="projetId" value={projetId} />
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
                        data-testid="fichier-import-biens"
                        className="block w-full text-small text-navy-900 file:mr-3 file:rounded-sm file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-small file:font-medium file:text-navy-900 hover:file:bg-navy-100"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="secondary" loading={analysePending}>
                      <Upload className="h-4 w-4" /> Analyser le fichier
                    </Button>
                  </form>
                  {analyse?.error && (
                    <Callout tone="danger" testId="import-biens-erreur">
                      {analyse.error}
                    </Callout>
                  )}

                  {apercu && (
                    <div className="space-y-3 border-t border-navy-50 pt-4" data-testid="import-biens-apercu">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="success" data-testid="apercu-biens-valides">
                          {pluriel(apercu.valides.length, "bien")} valide{apercu.valides.length > 1 ? "s" : ""}
                        </Badge>
                        <Badge tone={apercu.ignorees.length ? "warning" : "neutral"} data-testid="apercu-biens-ignorees">
                          {pluriel(apercu.ignorees.length, "ligne")} ignorée{apercu.ignorees.length > 1 ? "s" : ""}
                        </Badge>
                        <span className="text-caption text-navy-400">{apercu.nomFichier}</span>
                      </div>
                      {apercu.ignorees.length > 0 && (
                        <ul className="max-h-32 space-y-0.5 overflow-auto rounded-md bg-navy-50 p-3 text-caption text-navy-900" data-testid="apercu-biens-motifs">
                          {apercu.ignorees.map((i) => (
                            <li key={i.ligne}>
                              Ligne {i.ligne} : {i.motif}
                            </li>
                          ))}
                        </ul>
                      )}
                      <ul className="max-h-48 divide-y divide-navy-50 overflow-auto rounded-md ring-1 ring-navy-100/70" data-testid="apercu-biens-liste">
                        {apercu.valides.map((b, i) => (
                          <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-small" data-testid="apercu-bien" data-nature={b.nature}>
                            <span className="font-medium text-navy-900">{b.designation}</span>
                            <span className="text-caption text-navy-400">
                              {b.nature} <span className="mx-1 text-navy-300">·</span> {formatMoney(b.prix)} <span className="mx-1 text-navy-300">·</span> {b.surface} m²
                            </span>
                          </li>
                        ))}
                      </ul>
                      <form action={confirmerAction} onSubmit={soumettreSansReinitialiser(confirmerAction)} className="space-y-2">
                        <input type="hidden" name="projetId" value={projetId} />
                        <input type="hidden" name="nomFichier" value={apercu.nomFichier} />
                        <input type="hidden" name="lignes" value={JSON.stringify(apercu.valides)} />
                        <input type="hidden" name="ignorees" value={apercu.ignorees.length} />
                        {confirmation?.error && <Callout tone="danger">{confirmation.error}</Callout>}
                        <Button type="submit" size="sm" variant="gold" loading={confirmationPending} data-testid="confirmer-import-biens">
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
