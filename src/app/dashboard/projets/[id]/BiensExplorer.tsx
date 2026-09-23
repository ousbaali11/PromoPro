"use client";

import Link from "next/link";
import { startTransition as transitionGlobale, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Building2,
  FileText,
  LayoutGrid,
  List,
  Lock,
  LockOpen,
  Search,
  SearchX,
  Send,
  Star,
  Trash2,
} from "lucide-react";
import { cn, formatMoney, STATUT_BIEN_LABELS, STATUT_BIEN_TONES } from "@/lib/utils";
import { Card, EmptyState } from "@/components/ui/Primitives";
import { Input, Select, Textarea } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Dropdown, type MenuItem } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { blockBien, unblockBien } from "@/app/dashboard/biens/[id]/actions";
import { deleteBien, toggleEpingle } from "../actions";

export type BienCarte = {
  id: string;
  designation: string;
  nature: string;
  prix: number;
  surface: number;
  plan2dUrl: string | null;
  statut: string;
  epingle: boolean;
};

type Vue = "grille" | "liste";
type Filtres = { q: string; statut: string; nature: string; prixMin: string; prixMax: string };
const FILTRES_VIDES: Filtres = { q: "", statut: "", nature: "", prixMin: "", prixMax: "" };

/* ------------------------------------------------------------------------ */
/* Zone image : le plan s'il existe (image), une vignette PDF sinon, sinon un */
/* fond « calque d'architecte » aux couleurs de la marque.                    */
/* ------------------------------------------------------------------------ */
function ZoneImage({ bien, compact = false }: { bien: BienCarte; compact?: boolean }) {
  const estImage = !!bien.plan2dUrl && !bien.plan2dUrl.toLowerCase().endsWith(".pdf");
  const estPdf = !!bien.plan2dUrl && !estImage;
  return (
    <div className={cn("relative overflow-hidden bg-blueprint", compact ? "h-14 w-20 rounded-md" : "aspect-[4/3] w-full")}>
      {estImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bien.plan2dUrl!} alt="" className="h-full w-full object-cover transition-transform duration-slow ease-out-soft group-hover:scale-[1.03]" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-gold/70">
          {estPdf ? (
            <FileText className={compact ? "h-6 w-6" : "h-10 w-10"} strokeWidth={1.25} />
          ) : (
            <Building2 className={compact ? "h-6 w-6" : "h-12 w-12"} strokeWidth={1} />
          )}
        </div>
      )}
      {!compact && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-navy-900/50 to-transparent" />}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Actions rapides : dépendent du rôle et du statut du bien.                  */
/* ------------------------------------------------------------------------ */
function useActions(bien: BienCarte, role: string, ouvrirBlocage: () => void, ouvrirSuppression: () => void) {
  const [, startTransition] = useTransition();
  const items: MenuItem[] = [];
  if (role === "PDG" && bien.statut === "DISPONIBLE") {
    items.push({ label: "Bloquer ce bien", icon: <Lock />, onSelect: ouvrirBlocage });
  }
  if (role === "PDG" && bien.statut === "BLOQUE_PDG") {
    items.push({ label: "Débloquer", icon: <LockOpen />, onSelect: () => startTransition(() => unblockBien(bien.id)) });
  }
  if (["COMMERCIAL", "RESPONSABLE_COMMERCIAL"].includes(role) && bien.statut === "DISPONIBLE") {
    items.push({ label: "Envoyer une proposition", icon: <Send />, href: `/dashboard/propositions/nouvelle?bienId=${bien.id}` });
  }
  if (role === "DIRECTEUR_COMMERCIAL" && ["DISPONIBLE", "BLOQUE_PDG"].includes(bien.statut)) {
    items.push({ label: "Supprimer le bien", icon: <Trash2 />, danger: true, separator: items.length > 0, onSelect: ouvrirSuppression });
  }
  return items;
}

function BoutonEpingle({ bien, onToggle, className }: { bien: BienCarte; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={bien.epingle}
      aria-label={bien.epingle ? "Désépingler" : "Épingler pour un accès rapide"}
      data-testid="bien-epingle"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-sm transition-[color,background-color,transform] duration-fast focus-visible:outline-none focus-visible:shadow-focus active:scale-90",
        bien.epingle ? "text-gold" : "text-navy-300 hover:text-gold",
        className,
      )}
    >
      <Star className="h-4 w-4" fill={bien.epingle ? "currentColor" : "none"} />
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/* Carte (vue grille) et ligne (vue liste) : même information, deux densités */
/* ------------------------------------------------------------------------ */
function CarteBien({
  bien,
  actions,
  onToggle,
}: {
  bien: BienCarte;
  actions: MenuItem[];
  onToggle: () => void;
}) {
  const principale = actions.find((a) => !a.danger);
  return (
    <Card as="article" interactive className="group flex h-full flex-col overflow-hidden" data-testid="bien-carte">
      <div className="relative">
        <ZoneImage bien={bien} />
        <StatusBadge
          className="absolute left-3 top-3 inline-flex rounded-full bg-white/92 shadow-e1 backdrop-blur-sm"
          statut={bien.statut}
          label={STATUT_BIEN_LABELS[bien.statut]}
          tone={STATUT_BIEN_TONES[bien.statut] ?? "neutral"}
        />
        <div className="absolute right-2 top-2 rounded-sm bg-white/90 shadow-e1 backdrop-blur-sm">
          <BoutonEpingle bien={bien} onToggle={onToggle} />
        </div>
        {/* Actions rapides : révélées au survol ou au focus clavier */}
        {actions.length > 0 && (
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 opacity-0 transition-opacity duration-normal ease-linear group-hover:opacity-100 group-focus-within:opacity-100">
            {principale ? (
              principale.href ? (
                <Link
                  href={principale.href}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-white px-3 text-small font-medium text-navy shadow-e2 transition-colors duration-fast hover:bg-gold hover:text-white [&_svg]:h-3.5 [&_svg]:w-3.5"
                >
                  {principale.icon}
                  {principale.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => principale.onSelect?.()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-white px-3 text-small font-medium text-navy shadow-e2 transition-colors duration-fast hover:bg-gold hover:text-white [&_svg]:h-3.5 [&_svg]:w-3.5"
                >
                  {principale.icon}
                  {principale.label}
                </button>
              )
            ) : (
              <span />
            )}
            {actions.length > 1 && (
              <div className="rounded-sm bg-white shadow-e2">
                <Dropdown items={actions} />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/dashboard/biens/${bien.id}`}
            data-testid="bien-lien"
            className="text-h3 text-navy-900 transition-colors duration-fast hover:text-gold-600"
          >
            {bien.designation}
          </Link>
        </div>
        <p className="text-price tabular text-navy-900">
          {formatMoney(bien.prix).replace(/\s?MAD$/, "")}
          <span className="ml-1 text-caption font-medium text-navy-400">MAD</span>
        </p>
        {/* Liste de définitions valide : un <div> dt/dd par donnée, filets de séparation en bordure */}
        <dl className="mt-auto flex items-center text-caption text-navy-400 [&>div+div]:ml-4 [&>div+div]:border-l [&>div+div]:border-navy-100 [&>div+div]:pl-4">
          <div>
            <dt className="sr-only">Nature</dt>
            <dd>{bien.nature}</dd>
          </div>
          <div>
            <dt className="sr-only">Surface</dt>
            <dd className="tabular">{bien.surface} m²</dd>
          </div>
          <div>
            <dt className="sr-only">Prix au mètre carré</dt>
            <dd className="tabular">{Math.round(bien.prix / bien.surface).toLocaleString("fr-FR")} MAD/m²</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

function LigneBien({ bien, actions, onToggle }: { bien: BienCarte; actions: MenuItem[]; onToggle: () => void }) {
  return (
    <div
      data-testid="bien-ligne"
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-md px-3 py-2.5 transition-colors duration-fast hover:bg-navy-50/60 sm:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
    >
      <ZoneImage bien={bien} compact />
      <div className="min-w-0">
        <Link href={`/dashboard/biens/${bien.id}`} data-testid="bien-lien" className="block truncate text-body font-medium text-navy-900 transition-colors duration-fast hover:text-gold-600">
          {bien.designation}
        </Link>
        <p className="text-caption text-navy-400 sm:hidden">
          {bien.nature} · {bien.surface} m²
        </p>
      </div>
      <p className="hidden text-small text-navy-400 sm:block">
        {bien.nature} · <span className="tabular">{bien.surface} m²</span>
      </p>
      <p className="hidden text-body font-semibold tabular text-navy-900 sm:block">{formatMoney(bien.prix)}</p>
      <StatusBadge statut={bien.statut} label={STATUT_BIEN_LABELS[bien.statut]} tone={STATUT_BIEN_TONES[bien.statut] ?? "neutral"} />
      <div className="flex items-center gap-1">
        <BoutonEpingle bien={bien} onToggle={onToggle} />
        {actions.length > 0 && <Dropdown items={actions} />}
      </div>
    </div>
  );
}

function SquelettesBiens({ vue }: { vue: Vue }) {
  return vue === "grille" ? (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </Card>
      ))}
    </div>
  ) : (
    <Card className="divide-y divide-navy-50 p-1" aria-busy>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3">
          <Skeleton className="h-14 w-20" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Explorateur                                                                */
/* ------------------------------------------------------------------------ */
export function BiensExplorer({ biens: initiaux, projetId, role }: { biens: BienCarte[]; projetId: string; role: string; userId: string }) {
  const { toast } = useToast();
  // État local (optimiste) resynchronisé quand le serveur renvoie de nouvelles données
  const [biens, setBiens] = useState(initiaux);
  const [source, setSource] = useState(initiaux);
  if (source !== initiaux) {
    setSource(initiaux);
    setBiens(initiaux);
  }

  // Préférence d'affichage mémorisée dans le navigateur (lue après l'hydratation, en transition)
  const [vue, setVue] = useState<Vue>("grille");
  useEffect(() => {
    try {
      const v = localStorage.getItem("promopro.biens.vue");
      if (v === "liste" || v === "grille") transitionGlobale(() => setVue(v));
    } catch {}
  }, []);
  const changerVue = (v: Vue) => {
    setVue(v);
    try {
      localStorage.setItem("promopro.biens.vue", v);
    } catch {}
  };

  // Filtres saisis → filtres appliqués après un court délai (squelettes entre les deux)
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [appliques, setAppliques] = useState<Filtres>(FILTRES_VIDES);
  const [enCours, setEnCours] = useState(false);
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    setEnCours(true);
    const t = setTimeout(() => {
      setAppliques(filtres);
      setEnCours(false);
    }, 220);
    return () => clearTimeout(t);
  }, [filtres]);

  const natures = useMemo(() => [...new Set(biens.map((b) => b.nature))].sort(), [biens]);
  const statuts = useMemo(() => [...new Set(biens.map((b) => b.statut))], [biens]);

  const visibles = useMemo(() => {
    const q = appliques.q.trim().toLowerCase();
    const min = Number(appliques.prixMin) || 0;
    const max = Number(appliques.prixMax) || Infinity;
    return biens.filter(
      (b) =>
        (!q || b.designation.toLowerCase().includes(q)) &&
        (!appliques.statut || b.statut === appliques.statut) &&
        (!appliques.nature || b.nature === appliques.nature) &&
        b.prix >= min &&
        b.prix <= max,
    );
  }, [biens, appliques]);

  const filtresActifs = Object.values(appliques).some((v) => v !== "");

  // Modales d'action
  const [blocage, setBlocage] = useState<BienCarte | null>(null);
  const [suppression, setSuppression] = useState<BienCarte | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmerBlocage = () => {
    if (!blocage) return;
    const fd = new FormData();
    fd.set("bienId", blocage.id);
    fd.set("commentaire", commentaire);
    startTransition(async () => {
      const res = await blockBien(undefined, fd);
      if (res?.error) {
        setErreur(res.error);
        return;
      }
      setBiens((l) => l.map((b) => (b.id === blocage.id ? { ...b, statut: "BLOQUE_PDG" } : b)));
      setBlocage(null);
      setCommentaire("");
      toast({ kind: "success", title: "Bien bloqué", description: `${blocage.designation} est retiré de la vente.` });
    });
  };

  const confirmerSuppression = () => {
    if (!suppression) return;
    const cible = suppression;
    startTransition(async () => {
      await deleteBien(cible.id, projetId);
      setBiens((l) => l.filter((b) => b.id !== cible.id));
      setSuppression(null);
      toast({ kind: "info", title: "Bien supprimé", description: cible.designation });
    });
  };

  const basculerEpingle = (bien: BienCarte) => {
    setBiens((l) => l.map((b) => (b.id === bien.id ? { ...b, epingle: !b.epingle } : b)));
    startTransition(async () => {
      const res = await toggleEpingle(bien.id);
      if (res.error) {
        setBiens((l) => l.map((b) => (b.id === bien.id ? { ...b, epingle: bien.epingle } : b)));
        toast({ kind: "error", title: "Impossible d'épingler", description: res.error });
        return;
      }
      toast({
        kind: "success",
        title: res.epingle ? "Bien épinglé" : "Bien désépinglé",
        description: res.epingle ? `${bien.designation} est accessible depuis votre tableau de bord.` : bien.designation,
      });
    });
  };

  return (
    <LayoutGroup>
      {/* Barre d'outils */}
      <Card elevation={0} className="mb-5 flex flex-wrap items-end gap-3 p-3" data-testid="biens-toolbar">
        <Input
          label="Rechercher un bien"
          leading={<Search />}
          value={filtres.q}
          onChange={(e) => setFiltres({ ...filtres, q: e.target.value })}
          onClear={() => setFiltres({ ...filtres, q: "" })}
          containerClassName="min-w-56 flex-1"
          data-testid="filtre-recherche"
        />
        <Select
          label="Statut"
          value={filtres.statut}
          onChange={(e) => setFiltres({ ...filtres, statut: e.target.value })}
          containerClassName="w-44"
          data-testid="filtre-statut"
        >
          <option value="">Tous</option>
          {statuts.map((s) => (
            <option key={s} value={s}>
              {STATUT_BIEN_LABELS[s] ?? s}
            </option>
          ))}
        </Select>
        <Select
          label="Nature"
          value={filtres.nature}
          onChange={(e) => setFiltres({ ...filtres, nature: e.target.value })}
          containerClassName="w-40"
          data-testid="filtre-nature"
        >
          <option value="">Toutes</option>
          {natures.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
        <Input
          label="Prix min."
          type="number"
          inputMode="numeric"
          value={filtres.prixMin}
          onChange={(e) => setFiltres({ ...filtres, prixMin: e.target.value })}
          onClear={() => setFiltres({ ...filtres, prixMin: "" })}
          containerClassName="w-32"
        />
        <Input
          label="Prix max."
          type="number"
          inputMode="numeric"
          value={filtres.prixMax}
          onChange={(e) => setFiltres({ ...filtres, prixMax: e.target.value })}
          onClear={() => setFiltres({ ...filtres, prixMax: "" })}
          containerClassName="w-32"
        />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-caption text-navy-400 tabular" data-testid="biens-compteur">
            {visibles.length} / {biens.length}
          </span>
          <div className="relative flex rounded-sm bg-navy-50 p-0.5" role="group" aria-label="Affichage">
            {(["grille", "liste"] as Vue[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => changerVue(v)}
                aria-pressed={vue === v}
                aria-label={v === "grille" ? "Vue grille" : "Vue liste"}
                data-testid={`vue-${v}`}
                className={cn(
                  "relative z-10 flex h-8 w-9 items-center justify-center rounded-xs transition-colors duration-fast",
                  vue === v ? "text-navy-900" : "text-navy-400 hover:text-navy",
                )}
              >
                {vue === v && (
                  <motion.span
                    layoutId="vue-indicateur"
                    className="absolute inset-0 rounded-xs bg-white shadow-e1"
                    transition={{ type: "spring", stiffness: 500, damping: 34 }}
                  />
                )}
                <span className="relative">{v === "grille" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Contenu */}
      {enCours ? (
        <SquelettesBiens vue={vue} />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={filtresActifs ? <SearchX /> : <Building2 />}
          title={filtresActifs ? "Aucun bien ne correspond" : "Aucun bien saisi"}
          description={
            filtresActifs
              ? "Essayez un autre terme ou élargissez les filtres de statut, de nature ou de prix."
              : "Ajoutez le tableau de contenance ci-dessous pour commencer à commercialiser ce projet."
          }
          action={
            filtresActifs ? (
              <Button variant="secondary" size="sm" onClick={() => setFiltres(FILTRES_VIDES)}>
                Réinitialiser les filtres
              </Button>
            ) : undefined
          }
        />
      ) : (
        <motion.ul
          layout
          data-testid={`biens-${vue}`}
          className={cn(
            vue === "grille"
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
              : "flex flex-col divide-y divide-navy-50 rounded-lg bg-white p-1 ring-1 ring-navy-100/70 shadow-e2",
          )}
        >
          <AnimatePresence initial={false}>
            {visibles.map((bien) => (
              <ItemBien
                key={bien.id}
                bien={bien}
                vue={vue}
                role={role}
                onToggle={() => basculerEpingle(bien)}
                ouvrirBlocage={() => {
                  setErreur(null);
                  setBlocage(bien);
                }}
                ouvrirSuppression={() => setSuppression(bien)}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {/* Blocage (PDG) */}
      <Modal
        open={!!blocage}
        onClose={() => setBlocage(null)}
        title={blocage ? `Bloquer ${blocage.designation}` : "Bloquer"}
        description="Le bien sera retiré de la vente pour tous les commerciaux. Votre commentaire reste privé."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlocage(null)}>
              Annuler
            </Button>
            <Button onClick={confirmerBlocage} loading={pending} data-testid="confirmer-blocage">
              Bloquer ce bien
            </Button>
          </>
        }
      >
        <Textarea
          label="Commentaire (visible par vous seul)"
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          error={erreur}
          name="commentaire"
        />
      </Modal>

      {/* Suppression (Directeur Commercial) */}
      <Modal
        open={!!suppression}
        onClose={() => setSuppression(null)}
        title={suppression ? `Supprimer ${suppression.designation} ?` : "Supprimer"}
        description="Le bien disparaît du tableau de contenance. Cette action est irréversible."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuppression(null)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={confirmerSuppression} loading={pending} icon={<Trash2 />}>
              Supprimer
            </Button>
          </>
        }
      >
        <p className="text-small text-navy-400">Seul un bien encore disponible (ou bloqué) peut être supprimé.</p>
      </Modal>
    </LayoutGroup>
  );
}

function ItemBien({
  bien,
  vue,
  role,
  onToggle,
  ouvrirBlocage,
  ouvrirSuppression,
}: {
  bien: BienCarte;
  vue: Vue;
  role: string;
  onToggle: () => void;
  ouvrirBlocage: () => void;
  ouvrirSuppression: () => void;
}) {
  const actions = useActions(bien, role, ouvrirBlocage, ouvrirSuppression);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
      className="list-none"
    >
      {vue === "grille" ? (
        <CarteBien bien={bien} actions={actions} onToggle={onToggle} />
      ) : (
        <LigneBien bien={bien} actions={actions} onToggle={onToggle} />
      )}
    </motion.li>
  );
}
