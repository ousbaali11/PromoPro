"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { angleDeLaVue, nombreDeVues } from "@/lib/plan3d/rendu-vues";

/**
 * Visionneuse tournante d'un rendu 3D en images : la planche contient
 * plusieurs vues de la même maquette (dessus, puis tournée de 90°, 180°,
 * 270°). Glisser horizontalement fait tourner la maquette d'une vue à
 * l'autre ; la molette et les boutons zooment ; une fois zoomé, glisser
 * déplace la vue. Au repos, la maquette tourne lentement d'elle-même, comme
 * le visualiseur des modèles .glb, jusqu'au premier geste.
 */
export function RenduTournant({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [nbVues, setNbVues] = useState(1);
  const [vue, setVue] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [decalage, setDecalage] = useState({ x: 0, y: 0 });
  const [charge, setCharge] = useState(false);
  const [autoRotation, setAutoRotation] = useState(true);
  const glisser = useRef<{ x: number; y: number; vue: number; decalage: { x: number; y: number }; tourne: boolean } | null>(null);

  useEffect(() => {
    if (!autoRotation || nbVues < 2) return;
    const id = setInterval(() => setVue((v) => (v + 1) % nbVues), 1800);
    return () => clearInterval(id);
  }, [autoRotation, nbVues]);

  const arreter = () => setAutoRotation(false);

  const surPointeur = (e: ReactPointerEvent<HTMLDivElement>) => {
    arreter();
    e.currentTarget.setPointerCapture(e.pointerId);
    glisser.current = { x: e.clientX, y: e.clientY, vue, decalage, tourne: zoom <= 1.001 };
  };
  const surMouvement = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = glisser.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.tourne) {
      // Une vue tous les 80 px, vers la droite = sens horaire
      const pas = Math.round(dx / 80);
      setVue((((g.vue + pas) % nbVues) + nbVues) % nbVues);
    } else {
      setDecalage({ x: g.decalage.x + dx, y: g.decalage.y + dy });
    }
  };
  const finGlisser = () => {
    glisser.current = null;
  };
  const surMolette = (e: ReactWheelEvent<HTMLDivElement>) => {
    arreter();
    changerZoom(e.deltaY < 0 ? 1.2 : 1 / 1.2);
  };
  const changerZoom = (facteur: number) => {
    setZoom((z) => {
      const nz = Math.min(4, Math.max(1, z * facteur));
      if (nz <= 1.001) setDecalage({ x: 0, y: 0 });
      return nz;
    });
  };
  const reinitialiser = () => {
    arreter();
    setZoom(1);
    setDecalage({ x: 0, y: 0 });
    setVue(0);
  };
  const tourner = (sens: 1 | -1) => {
    arreter();
    setVue((v) => (((v + sens) % nbVues) + nbVues) % nbVues);
  };

  return (
    <div className={className} data-testid="rendu-tournant" data-vue={vue} data-nb-vues={nbVues} data-zoom={zoom.toFixed(2)}>
      <div className="relative h-full min-h-64 select-none overflow-hidden bg-white">
        <div
          className="h-full w-full touch-none"
          style={{ cursor: zoom > 1 ? "grab" : "ew-resize" }}
          onPointerDown={surPointeur}
          onPointerMove={surMouvement}
          onPointerUp={finGlisser}
          onPointerCancel={finGlisser}
          onWheel={surMolette}
          role="img"
          aria-label={`${alt} — vue ${vue + 1} sur ${nbVues}, ${angleDeLaVue(vue, nbVues)}°`}
        >
          {/* La planche entière est chargée une fois ; seule la vue courante est visible, par décalage */}
          <div className="relative h-full w-full overflow-hidden" style={{ transform: `translate(${decalage.x}px, ${decalage.y}px) scale(${zoom})`, transformOrigin: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- planche servie par l'application, dimensions connues après chargement */}
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => {
                setNbVues(nombreDeVues(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight));
                setCharge(true);
              }}
              className="absolute left-0 top-0 h-full max-w-none"
              style={{ width: `${nbVues * 100}%`, transform: `translateX(-${(100 * vue) / nbVues}%)`, opacity: charge ? 1 : 0 }}
            />
          </div>
          {!charge && <p className="absolute inset-0 flex items-center justify-center text-caption text-navy-300">Chargement du rendu…</p>}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/90 px-1 py-0.5 shadow-sm ring-1 ring-navy-100">
            <button type="button" className="rounded-full p-1 text-navy-600 hover:bg-navy-50" onClick={() => tourner(-1)} aria-label="Vue précédente" data-testid="rendu-precedent" disabled={nbVues < 2}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-14 text-center text-caption tabular text-navy-600" data-testid="rendu-angle">
              {angleDeLaVue(vue, nbVues)}°
            </span>
            <button type="button" className="rounded-full p-1 text-navy-600 hover:bg-navy-50" onClick={() => tourner(1)} aria-label="Vue suivante" data-testid="rendu-suivant" disabled={nbVues < 2}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/90 px-1 py-0.5 shadow-sm ring-1 ring-navy-100">
            <button type="button" className="rounded-full p-1 text-navy-600 hover:bg-navy-50" onClick={() => { arreter(); changerZoom(1 / 1.2); }} aria-label="Zoom arrière">
              <Minus className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-full p-1 text-navy-600 hover:bg-navy-50" onClick={() => { arreter(); changerZoom(1.2); }} aria-label="Zoom avant">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-full p-1 text-navy-600 hover:bg-navy-50" onClick={reinitialiser} aria-label="Vue initiale">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
