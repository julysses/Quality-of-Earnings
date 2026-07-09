"use client";

import { Button } from "./ui";

export function PrintButton() {
  return (
    <Button variant="secondary" type="button" onClick={() => window.print()}>
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M4 1h8v4H4V1zM2 6h12a1 1 0 011 1v5h-3v3H4v-3H1V7a1 1 0 011-1zm3 5v3h6v-3H5z" />
      </svg>
      Print / Save PDF
    </Button>
  );
}
