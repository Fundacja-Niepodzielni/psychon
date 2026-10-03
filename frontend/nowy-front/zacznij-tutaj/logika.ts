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

/** Odczyt fragmentu ścieżki zapisanego w adresie (`%20` → spacja); nieczytelny zostaje bez zmian. */
function odczytFragmentu(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/** Adres odtwarzacza dla identyfikatora filmu — identyfikator jako jeden zakodowany fragment ścieżki. */
function adresOdtwarzacza(identyfikator: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(identyfikator)}`;
}

/** Identyfikator filmu YouTube: od 1 do 64 znaków, wyłącznie litery łacińskie, cyfry, `-` i `_`. */
const WZOR_IDENTYFIKATORA_FILMU = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Identyfikator filmu z adresu YouTube: ścieżka `youtu.be` albo parametr `v`
 * hosta `youtube.com` (lub jego poddomeny). `null`, gdy adres nie niesie
 * identyfikatora i idzie do ramki bez zmian.
 */
function identyfikatorFilmu(adres: URL): string | null {
  if (adres.hostname === "youtu.be") return odczytFragmentu(adres.pathname.slice(1));
  if (jestHostemYoutube(adres.hostname) && adres.searchParams.has("v")) return adres.searchParams.get("v") ?? "";
  return null;
}

/**
 * Adres ramki odtwarzacza — ta sama reguła co `components/onboarding/embed-url.ts`
 * (`toEmbedUrl`): wyłącznie `youtu.be` i host `youtube.com` (albo jego
 * poddomena) z parametrem `v` przechodzą na odtwarzacz YouTube; każdy inny
 * adres zostaje bez zmian. Identyfikator filmu trafia do adresu odtwarzacza
 * zakodowany jako jeden fragment ścieżki; dla zwykłego identyfikatora (litery,
 * cyfry, `-`, `_`) wynik jest ten sam co w starej regule — zgodność pilnuje test.
 */
export function adresOsadzenia(surowy: string): string {
  try {
    const identyfikator = identyfikatorFilmu(new URL(surowy));
    return identyfikator === null ? surowy : adresOdtwarzacza(identyfikator);
  } catch {
    return surowy;
  }
}

/** Jak ekran pokazuje film: odtwarzacz osadzony, sam odnośnik albo nic. */
export type PokazanieFilmu =
  | { rodzaj: "odtwarzacz"; adres: string }
  | { rodzaj: "odnosnik"; adres: string }
  | { rodzaj: "brak" };

/** Zezwolenia ramki odtwarzacza YouTube (atrybut `sandbox`). */
export const PIASKOWNICA_ODTWARZACZA = "allow-scripts allow-same-origin allow-presentation allow-popups";

/** Odtwarzacz dostaje tylko pochodzenie strony, bez ścieżki i parametrów (atrybut `referrerpolicy`). */
export const POLITYKA_ODSYLACZA_ODTWARZACZA = "strict-origin-when-cross-origin";

/**
 * Reguła pokazania filmu. Odtwarzacz osadzony w ramce dostaje wyłącznie adres
 * `https` z hostem `youtu.be` albo `youtube.com` (lub jego poddomeną) — po
 * przeliczeniu `adresOsadzenia`, jak dotąd — i tylko wtedy, gdy identyfikator
 * filmu w adresie (jeśli adres go niesie) to od 1 do 64 liter łacińskich, cyfr,
 * `-` i `_`. Każdy inny adres `https`, także adres YouTube z innym
 * identyfikatorem, jest tylko odnośnikiem otwieranym w nowej karcie, nigdy
 * ramką. Adres bez `https` albo nieczytelny nie pokazuje niczego.
 */
export function pokazanieFilmu(surowy: string): PokazanieFilmu {
  let adres: URL;
  try {
    adres = new URL(surowy.trim());
  } catch {
    return { rodzaj: "brak" };
  }
  if (adres.protocol !== "https:") return { rodzaj: "brak" };
  if (adres.hostname === "youtu.be" || jestHostemYoutube(adres.hostname)) {
    const identyfikator = identyfikatorFilmu(adres);
    if (identyfikator === null || WZOR_IDENTYFIKATORA_FILMU.test(identyfikator)) {
      return { rodzaj: "odtwarzacz", adres: adresOsadzenia(adres.href) };
    }
  }
  return { rodzaj: "odnosnik", adres: adres.href };
}
