"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

/**
 * Wspolna logika zamykania rozwijanego panelu (np. okna pomocy, dzwonka
 * powiadomien) po kliknieciu poza nim lub po klawiszu Escape.
 *
 * Wydzielone z `HelpWidget` i `NotificationBell`, ktore obie potrzebowaly
 * dokladnie tego samego mechanizmu — pojedyncze miejsce zamiast dwoch kopii
 * tego samego efektu.
 */
export default function useCloseOnOutsideOrEscape(
  containerRef: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, containerRef, setOpen]);
}
