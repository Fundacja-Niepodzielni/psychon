import { api } from "@/lib/api/klient";

export interface FormaStazu {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * `GET /admin/internship/forms` (`AdminInternshipFormController::index`,
 * `backend/routes/api/h11.php:42`) — słownik form stażu w całości, bez
 * paginacji (kontroler jej nie stosuje). Wołane z przeglądarki: strona nie
 * używa `@/auth` (serwerowego `NextAuth`) — ta trasa jest statyczna (bez
 * segmentu dynamicznego), a moduł `@/auth` pod jego pełnym importem
 * (`next-auth` → `next/server`) nie wstaje pod Vitest/jsdom, co byłby
 * zmierzone jako regresja przyrządu `punkty-orientacyjne-tresc.test.tsx`
 * na trasach statycznych — patrz ten sam gap nazwany w
 * `__tests__/auth-rotacja-tokenu.test.ts`. Token płynie więc tak samo, jak
 * na reszcie aplikacji: przez `lib/api/klient.ts` (`/api/auth/session`).
 */
export function pobierzFormyStazu(): Promise<FormaStazu[]> {
  return api<FormaStazu[]>("/admin/internship/forms");
}
