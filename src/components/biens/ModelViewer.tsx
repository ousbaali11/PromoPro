"use client";

import Script from "next/script";
import { useState } from "react";
import { Box } from "lucide-react";

/** Version épinglée du composant web <model-viewer> de Google (module ES, ~0 dépendance côté projet). */
export const MODEL_VIEWER_SRC = "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";

/**
 * Modèle 3D (.glb / .gltf) d'un bien : rotation à la souris ou au doigt,
 * rotation automatique au repos. Le script est chargé une seule fois, à la
 * demande, depuis le CDN Google ; tant qu'il n'est pas prêt, un état
 * d'attente discret est affiché.
 */
export function ModelViewer({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [pret, setPret] = useState(false);
  return (
    <div className={className} data-testid="modele-3d">
      <Script src={MODEL_VIEWER_SRC} type="module" strategy="lazyOnload" onLoad={() => setPret(true)} onReady={() => setPret(true)} />
      {!pret && (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-navy-300" aria-live="polite">
          <Box className="h-8 w-8" />
          <p className="text-caption">Chargement du visualiseur 3D…</p>
        </div>
      )}
      <model-viewer
        src={src}
        alt={alt}
        camera-controls=""
        auto-rotate=""
        touch-action="pan-y"
        shadow-intensity="1"
        style={{ width: "100%", height: "100%", minHeight: "16rem", display: pret ? "block" : "none" }}
      />
    </div>
  );
}
