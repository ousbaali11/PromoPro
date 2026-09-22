"use client";

import { ErrorFallback, type ErrorProps } from "@/components/ui/ErrorFallback";

export default function DashboardError(props: ErrorProps) {
  return <ErrorFallback {...props} espace="dashboard" />;
}
