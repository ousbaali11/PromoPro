import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autonome (.next/standalone) : serveur Node minimal + dépendances
  // tracées, utilisé par le Dockerfile pour le déploiement conteneurisé.
  output: "standalone",
};

export default nextConfig;
