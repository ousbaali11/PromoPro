import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** Élément personnalisé <model-viewer> (Google), chargé depuis son CDN dans ModelViewer.tsx. */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        "camera-controls"?: boolean | "";
        "auto-rotate"?: boolean | "";
        "shadow-intensity"?: string;
        "touch-action"?: string;
        exposure?: string;
        ar?: boolean | "";
      };
    }
  }
}
