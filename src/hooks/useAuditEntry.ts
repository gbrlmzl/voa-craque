"use client";

import { useState } from "react";

export function useAuditEntry() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((value) => !value) };
}
