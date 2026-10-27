"use client";

import { useEffect, useState } from "react";

export type AppStatus = { demo: boolean; vision: boolean; semanticSearch: boolean; webSearch: boolean };

export function useAppStatus(): AppStatus | null {
  const [status, setStatus] = useState<AppStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AppStatus | null) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}
