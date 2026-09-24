"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Primitives";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useRecalageDansFenetre } from "@/components/ui/recalage";
import { useHydrated } from "@/components/ui/useHydrated";
import {
  PREREGLAGES,
  UNITES,
  clePlage,
  codePersonnalise,
  codeRelatif,
  decoderPlage,
  libellePersonnalise,
  libelleRelatif,
  verifierPersonnalisee,
  type Unite,
} from "@/lib/plage-dates";

/**
 * Sélecteur de plage de dates des tableaux de bord internes. Bouton fermé =
 * résumé de la plage active ; panneau à trois onglets — Rapide (préréglages
 * en un clic), Relatif (nombre + unité, derniers / prochains), Personnalisé
 * (début et fin avec l'heure, fin après le début) — puis « Appliquer ». Le
 * choix est porté par l'URL (`?plage=`) pour que la page serveur filtre, et
 * mémorisé par utilisateur dans localStorage : sans paramètre dans l'URL, la
 * dernière plage de l'utilisateur est rappelée.
 */
type Onglet = "rapide" | "relatif" | "perso";
const ONGLETS: { value: Onglet; label: string }[] = [
  { value: "rapide", label: "Rapide" },
  { value: "relatif", label: "Relatif" },
  { value: "perso", label: "Personnalisé" },
];

function localISO(d: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

export function DateRangePicker({ code, userId, className }: { code?: string; userId: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const racine = useRef<HTMLDivElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const panneauId = useId();
  const [open, setOpen] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("rapide");
  const plage = decoderPlage(code, new Date());

  // Relatif
  const [nombre, setNombre] = useState(3);
  const [unite, setUnite] = useState<Unite>("mois");
  const [sens, setSens] = useState<"derniers" | "prochains">("derniers");
  // Personnalisé
  const [debut, setDebut] = useState(() => localISO(plage.debut));
  const [fin, setFin] = useState(() => localISO(plage.fin));
  const [erreur, setErreur] = useState<string | null>(null);

  const naviguer = useCallback(
    (nouveauCode: string, remplacer = false) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("plage", nouveauCode);
      const url = `${pathname}?${params.toString()}`;
      if (remplacer) router.replace(url);
      else router.push(url);
    },
    [pathname, router, searchParams],
  );

  // Sans plage dans l'URL : rappel du dernier choix de l'utilisateur
  useEffect(() => {
    if (code) return;
    try {
      const memorise = localStorage.getItem(clePlage(userId));
      if (memorise && memorise !== plage.code) naviguer(memorise, true);
    } catch {
      /* stockage indisponible : plage par défaut */
    }
  }, [code, userId, plage.code, naviguer]);

  const appliquer = (nouveauCode: string) => {
    try {
      localStorage.setItem(clePlage(userId), nouveauCode);
    } catch {
      /* stockage indisponible */
    }
    setOpen(false);
    naviguer(nouveauCode);
  };

  // Fermeture : clic à l'extérieur, Échap
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Le panneau reste dans la fenêtre même quand le bouton est replié à gauche (mobile)
  useRecalageDansFenetre(open, racine, panneau, "right");

  const appliquerPerso = () => {
    const d = new Date(debut);
    const f = new Date(fin);
    const message = verifierPersonnalisee(d, f);
    setErreur(message);
    if (message) return;
    appliquer(codePersonnalise(d, f));
  };

  return (
    <div ref={racine} className={cn("relative inline-block text-left", className)} data-testid="selecteur-plage" data-plage={plage.code}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panneauId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-small font-medium text-navy-900 ring-1 ring-inset ring-navy-100 transition-[background-color,box-shadow] duration-fast hover:bg-navy-50 focus-visible:outline-none focus-visible:shadow-focus",
          open && "bg-navy-50",
        )}
        data-testid="selecteur-plage-bouton"
      >
        <CalendarRange className="h-4 w-4 text-gold-600" />
        <span data-testid="selecteur-plage-libelle">{plage.libelle}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-navy-300 transition-transform duration-fast", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && hydrated && (
          <motion.div
            ref={panneau}
            id={panneauId}
            role="dialog"
            aria-label="Choisir une plage de dates"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg bg-white p-4 shadow-e4 ring-1 ring-navy-100"
            data-testid="selecteur-plage-panneau"
          >
            <SegmentedControl ariaLabel="Type de plage" size="sm" value={onglet} onChange={(v) => setOnglet(v as Onglet)} items={ONGLETS} className="mb-3" />

            {onglet === "rapide" && (
              <ul className="grid grid-cols-2 gap-1.5" data-testid="plages-rapides">
                {PREREGLAGES.map((p) => {
                  const actif = p.code === plage.code;
                  return (
                    <li key={p.code}>
                      <button
                        type="button"
                        onClick={() => appliquer(p.code)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-small transition-colors duration-fast hover:bg-navy-50 focus-visible:outline-none focus-visible:shadow-focus",
                          actif ? "bg-gold-50 font-medium text-navy-900 ring-1 ring-inset ring-gold-200" : "text-navy-900",
                        )}
                        data-testid={`plage-rapide-${p.code}`}
                        aria-pressed={actif}
                      >
                        {p.libelle}
                        {actif && <Check className="h-3.5 w-3.5 text-gold-600" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {onglet === "relatif" && (
              <div className="space-y-3" data-testid="plage-relative">
                <div className="grid grid-cols-[5rem_1fr_1fr] gap-2">
                  <Input id={`${panneauId}-nombre`} name="nombre" type="number" label="Nombre" min={1} max={999} value={nombre} onChange={(e) => setNombre(Math.max(1, Math.floor(e.target.valueAsNumber || 1)))} clearable={false} />
                  <Select id={`${panneauId}-unite`} name="unite" label="Unité" value={unite} onChange={(e) => setUnite(e.target.value as Unite)}>
                    {UNITES.map((u) => (
                      <option key={u.valeur} value={u.valeur}>
                        {u.pluriel}
                      </option>
                    ))}
                  </Select>
                  <Select id={`${panneauId}-sens`} name="sens" label="Sens" value={sens} onChange={(e) => setSens(e.target.value as "derniers" | "prochains")}>
                    <option value="derniers">derniers</option>
                    <option value="prochains">prochains</option>
                  </Select>
                </div>
                <p className="text-caption text-navy-400">
                  Plage : <span className="font-medium text-navy-900" data-testid="plage-relative-apercu">{libelleRelatif(nombre, unite, sens)}</span>
                </p>
                <Button size="sm" className="w-full" onClick={() => appliquer(codeRelatif(nombre, unite, sens))} data-testid="plage-appliquer">
                  Appliquer
                </Button>
              </div>
            )}

            {onglet === "perso" && (
              <div className="space-y-3" data-testid="plage-personnalisee">
                <Input id={`${panneauId}-debut`} name="debut" type="datetime-local" label="Début" value={debut} onChange={(e) => setDebut(e.target.value)} clearable={false} />
                <Input id={`${panneauId}-fin`} name="fin" type="datetime-local" label="Fin" value={fin} onChange={(e) => setFin(e.target.value)} clearable={false} />
                {!erreur && !Number.isNaN(new Date(debut).getTime()) && !Number.isNaN(new Date(fin).getTime()) && new Date(fin) > new Date(debut) && (
                  <p className="text-caption text-navy-400">
                    Plage : <span className="font-medium text-navy-900">{libellePersonnalise(new Date(debut), new Date(fin))}</span>
                  </p>
                )}
                {erreur && (
                  <p className="text-caption text-danger-fg" role="alert" data-testid="plage-erreur">
                    {erreur}
                  </p>
                )}
                <Button size="sm" className="w-full" onClick={appliquerPerso} data-testid="plage-appliquer">
                  Appliquer
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
