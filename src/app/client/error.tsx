"use client";

import { ErrorFallback, type ErrorProps } from "@/components/ui/ErrorFallback";

export default function ClientError(props: ErrorProps) {
  return <ErrorFallback {...props} espace="client" />;
}
