/**
 * Logika ekranu „Zacznij tutaj” — wyjęta z `app/(uczestnik)/panel/start/page.tsx`
 * i `components/onboarding/` bez zmiany reguł. Ekran woła te funkcje, a nie
 * własne kopie warunków.
 */

export interface SekcjaFilmu {
  title: string;
  url: string | null;
  caption: string | null;
}

export interface SekcjaTekstu {
  title: string;
  body: string;
}

/** Odpowiedź `GET /onboarding`. */
export interface EkranZacznijTutaj {
  video: SekcjaFilmu;
  program: SekcjaTekstu;
  expectations: SekcjaTekstu;
  updated_at: string | null;
}

export const ROLE_ADMINISTRACJI = ["super_admin", "project_manager"];
export const ADRES_PO_PROGRAMIE = "/panel/po-programie";
export const ADRES_EDYTORA = "/admin/ekran-startowy";
export const PODPIS_BEZ_FILMU = "Film pojawi się tutaj wkrótce.";
export const KOMUNIKAT_BLEDU_WCZYTANIA = "Nie udało się wczytać ekranu. Sprawdź połączenie i spróbuj ponownie.";

/** Czy rola z `/me` widzi narzędzia administracji (edycja treści, data zmiany). */
export function czyAdministracja(rola: string | null): boolean {
  return rola !== null && ROLE_ADMINISTRACJI.includes(rola);
}

/** Czy host to `youtube.com` albo jego poddomena (porównanie hosta dokładne, nie po końcówce napisu). */
function jestHostemYoutube(host: string): boolean {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

/**
 * Adres ramki odtwarzacza — ta sama reguła co `components/onboarding/embed-url.ts`
 * (`toEmbedUrl`): wyłącznie `youtu.be` i host `youtube.com` (albo jego
 * poddomena) z parametrem `v` przechodzą na odtwarzacz YouTube; każdy inny
 * adres zostaje bez zmian. Zgodność obu funkcji pilnuje test.
 */
export function adresOsadzenia(surowy: string): string {
  try {
    const adres = new URL(surowy);
    if (adres.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${adres.pathname.slice(1)}`;
    }
    if (jestHostemYoutube(adres.hostname) && adres.searchParams.has("v")) {
      return `https://www.youtube.com/embed/${adres.searchParams.get("v")}`;
    }
    return surowy;
  } catch {
    return surowy;
  }
}
