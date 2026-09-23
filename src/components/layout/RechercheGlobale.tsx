"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Search, Building2, Contact, FolderKanban, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Primitives";
import { LONGUEUR_MIN, type GroupeRecherche, type TypeResultat } from "@/lib/recherche";

const ICONES: Record<TypeResultat, typeof Building2> = { bien: Building2, client: Contact, projet: FolderKanban };

const rien = () => () => {};
/** Plateforme Apple ? (faux côté serveur, évalué après hydratation : pas de désaccord de rendu) */
function useMac() {
  return useSyncExternalStore(rien, () => /Mac|iPhone|iPad/.test(navigator.platform), () => false);
}

/**
 * Recherche globale (en-tête du dashboard) : bouton + raccourci Ctrl/Cmd+K,
 * champ dans une modale, résultats groupés (biens, clients, projets) avec
 * lien direct vers la fiche. Les données viennent de GET /api/recherche,
 * cloisonnée par promoteur et par rôle.
 */
export function RechercheGlobale() {
  const [ouvert, setOuvert] = useState(false);
  const [requete, setRequete] = useState("");
  const [groupes, setGroupes] = useState<GroupeRecherche[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const derniere = useRef(0);
  const mac = useMac();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOuvert(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const fermer = useCallback(() => setOuvert(false), []);

  const saisir = (valeur: string) => {
    setRequete(valeur);
    if (valeur.trim().length < LONGUEUR_MIN) {
      derniere.current++; // invalide une réponse en vol
      setGroupes([]);
      setChargement(false);
      setErreur(null);
    }
  };

  // Recherche avec léger délai ; la réponse la plus récente gagne
  useEffect(() => {
    if (!ouvert) return;
    const q = requete.trim();
    if (q.length < LONGUEUR_MIN) return;
    const id = ++derniere.current;
    const t = setTimeout(async () => {
      setChargement(true);
      setErreur(null);
      try {
        const r = await fetch(`/api/recherche?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { groupes: GroupeRecherche[] };
        if (id === derniere.current) setGroupes(data.groupes);
      } catch {
        if (id === derniere.current) setErreur("La recherche a échoué. Réessayez.");
      } finally {
        if (id === derniere.current) setChargement(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [requete, ouvert]);

  const total = groupes.reduce((s, g) => s + g.resultats.length, 0);
  const assezLong = requete.trim().length >= LONGUEUR_MIN;

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex h-9 items-center gap-2 rounded-md border border-navy-100 bg-white px-3 text-small text-navy-400 transition-colors duration-fast hover:border-navy-300 hover:text-navy-900 focus-visible:outline-none focus-visible:shadow-focus"
        aria-label="Rechercher un bien, un client ou un projet"
        data-testid="ouvrir-recherche"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Rechercher…</span>
        <kbd className="hidden rounded-xs border border-navy-100 bg-cream-100 px-1.5 py-0.5 font-mono text-[10px] text-navy-400 sm:inline" aria-hidden>
          {mac ? "⌘" : "Ctrl"}+K
        </kbd>
      </button>

      <Modal open={ouvert} onClose={fermer} title="Recherche" description="Biens, clients et projets de votre promoteur, par nom ou désignation." size="md">
        <div className="space-y-4" data-testid="recherche-globale">
          <Input
            type="search"
            label="Nom, désignation ou identifiant"
            value={requete}
            onChange={(e) => saisir(e.target.value)}
            onClear={() => saisir("")}
            leading={chargement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            autoComplete="off"
            data-testid="champ-recherche"
          />
          <div aria-live="polite" className="min-h-10">
            {erreur && <p className="text-small text-danger-fg">{erreur}</p>}
            {!erreur && assezLong && !chargement && total === 0 && (
              <p className="text-small text-navy-400" data-testid="recherche-vide">
                Aucun résultat pour « {requete.trim()} ».
              </p>
            )}
            {!assezLong && <p className="text-caption text-navy-400">Saisissez au moins {LONGUEUR_MIN} caractères.</p>}
            {groupes.map((g) => {
              const Icone = ICONES[g.type];
              return (
                <section key={g.type} className="mb-3" data-testid={`groupe-${g.type}`} aria-label={g.libelle}>
                  <h3 className="mb-1 flex items-center gap-1.5 text-label uppercase text-navy-400">
                    <Icone className="h-3.5 w-3.5" /> {g.libelle}
                    <span className="tabular">({g.resultats.length})</span>
                  </h3>
                  <ul className="divide-y divide-navy-50 rounded-md ring-1 ring-navy-100/70">
                    {g.resultats.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={r.href}
                          onClick={fermer}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-small text-navy-900 transition-colors duration-fast hover:bg-cream-100 focus-visible:outline-none focus-visible:shadow-focus"
                          data-testid="resultat-recherche"
                        >
                          <span className="font-medium">{r.titre}</span>
                          {r.sousTitre && <span className="truncate text-caption text-navy-400">{r.sousTitre}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </Modal>
    </>
  );
}
