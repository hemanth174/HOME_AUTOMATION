"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Local hardware control is part of the main dashboard now. Keep old
// bookmarks working without maintaining a second connection state machine.
export default function LocalPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}
