/**
 * Re-eksport typu — patrz `lib/api/h12.ts` (`fetchAdminSupervisionSlots`,
 * `AdminSupervisionSlot`). Odczyt startowy tej trasy biegnie z
 * przeglądarki: powód identyczny jak w `nowy-front/formy-stazu/dane.ts` —
 * `@/auth` (serwerowy `NextAuth`) nie wstaje pod Vitest/jsdom na trasach
 * statycznych (`__tests__/auth-rotacja-tokenu.test.ts`).
 */
export type { AdminSupervisionSlot } from "@/lib/api/h12";
