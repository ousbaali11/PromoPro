"use client";

import { ErrorFallback, type ErrorProps } from "@/components/ui/ErrorFallback";

export default function AdminError(props: ErrorProps) {
  return <ErrorFallback {...props} espace="admin" />;
}
