"use client";

import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Plus, X } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { cn } from "@/lib/utils";
import { CHAMPS, libelleChamp, type Segment } from "@/lib/contrats-sections";

/**
 * Éditeur d'une section de modèle : une zone de texte libre (contentEditable)
 * dans laquelle les champs dynamiques apparaissent comme des étiquettes
 * encadrées, non éditables, dotées d'une croix de suppression. Le bouton
 * « Insérer un champ » ouvre la liste des champs (libellés humains) et insère
 * l'étiquette à la position du curseur (ou à la fin). Aucune syntaxe à
 * taper : le contenu est sérialisé en segments { texte | champ } dans un
 * champ caché à chaque modification.
 */
export function EditeurSegments({ nom, segments, label, testId }: { nom: string; segments: Segment[]; label: string; testId?: string }) {
  const zone = useRef<HTMLDivElement>(null);
  const derniereSelection = useRef<Range | null>(null);
  const id = useId();
  // Valeur soumise au serveur : un état React (un champ caché écrit à la main serait remis à sa valeur par défaut à chaque rendu)
  const [json, setJson] = useState(() => JSON.stringify(segments));
  const [vide, setVide] = useState(segments.length === 0);

  const serialiser = () => {
    const el = zone.current;
    if (!el) return;
    const resultat: Segment[] = [];
    for (const noeud of el.childNodes) {
      if (noeud.nodeType === Node.TEXT_NODE) {
        const valeur = (noeud.textContent ?? "").replace(/​/g, ""); // caractères de largeur nulle posés après une étiquette pour le curseur
        const precedent = resultat[resultat.length - 1];
        if (precedent && precedent.type === "texte") precedent.valeur += valeur;
        else if (valeur) resultat.push({ type: "texte", valeur });
      } else if (noeud instanceof HTMLElement && noeud.dataset.cle) {
        resultat.push({ type: "champ", cle: noeud.dataset.cle });
      } else if (noeud instanceof HTMLElement) {
        // Balise inattendue (collage riche…) : on garde son texte
        const valeur = noeud.textContent ?? "";
        if (valeur) resultat.push({ type: "texte", valeur });
      }
    }
    setJson(JSON.stringify(resultat));
    setVide(resultat.length === 0);
  };

  const etiquette = (cle: string) => {
    const span = document.createElement("span");
    span.contentEditable = "false";
    span.dataset.cle = cle;
    span.dataset.testid = "champ-etiquette";
    // Même rendu que le Badge (ton gold) : pastille arrondie, ring, typographie caption
    span.className = "mx-0.5 inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full bg-gold-50 px-2.5 py-0.5 align-baseline text-caption font-medium text-gold-700 ring-1 ring-inset ring-gold-200";
    span.textContent = libelleChamp(cle);
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.dataset.supprimer = "1";
    bouton.setAttribute("aria-label", `Retirer le champ ${libelleChamp(cle)}`);
    bouton.className = "rounded-full text-gold-700 transition-colors duration-fast hover:bg-gold-100 focus-visible:outline-none focus-visible:shadow-focus";
    bouton.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    span.appendChild(bouton);
    return span;
  };

  // Contenu initial construit hors de React (contentEditable) ; la valeur soumise initiale est déjà JSON.stringify(segments)
  useEffect(() => {
    const el = zone.current;
    if (!el || el.childNodes.length) return;
    for (const s of segments) el.appendChild(s.type === "texte" ? document.createTextNode(s.valeur) : etiquette(s.cle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mémorise la position du curseur tant qu'elle est dans la zone (le clic sur le menu la fait perdre)
  useEffect(() => {
    const onSelection = () => {
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || !zone.current) return;
      const range = sel.getRangeAt(0);
      if (zone.current.contains(range.commonAncestorContainer)) derniereSelection.current = range.cloneRange();
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  const inserer = (cle: string) => {
    const el = zone.current;
    if (!el) return;
    const span = etiquette(cle);
    const range = derniereSelection.current;
    if (range && el.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(span);
      const apres = document.createTextNode("​"); // largeur nulle : le curseur peut se placer après l'étiquette sans espace visible
      span.after(apres);
      range.setStart(apres, 1);
      range.collapse(true);
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      derniereSelection.current = range.cloneRange();
    } else {
      el.appendChild(span);
      el.appendChild(document.createTextNode("​"));
    }
    el.focus();
    serialiser();
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const bouton = (e.target as HTMLElement).closest("button[data-supprimer]");
    if (!bouton) return;
    e.preventDefault();
    bouton.closest("span[data-cle]")?.remove();
    serialiser();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.execCommand("insertText", false, "\n");
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  };

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-small font-medium text-navy-900">
          {label}
        </label>
        <Dropdown
          align="right"
          label="Insérer un champ"
          trigger={
            <span className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-caption font-medium text-navy-900 ring-1 ring-inset ring-navy-100 transition-colors duration-fast hover:bg-navy-50" data-testid="inserer-champ">
              <Plus className="h-3.5 w-3.5" /> Insérer un champ
            </span>
          }
          items={CHAMPS.map((c) => ({ label: c.libelle, onSelect: () => inserer(c.cle) }))}
        />
      </div>
      <div
        id={id}
        ref={zone}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        onInput={serialiser}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className={cn(
          "min-h-24 w-full whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-body leading-relaxed text-navy-900 ring-1 ring-inset ring-navy-100 focus:outline-none focus:shadow-focus",
          vide && "before:text-navy-300 before:content-['Texte_de_la_section…']",
        )}
        data-testid="zone-segments"
      />
      <input type="hidden" name={nom} value={json} readOnly />
      <p className="text-caption text-navy-400">
        <X className="mr-0.5 inline h-3 w-3" aria-hidden /> Les étiquettes sont remplacées par les vraies données du dossier à la création d&apos;un contrat.
      </p>
    </div>
  );
}
