/**
 * Oceny adresu zbudowanego przez `URL` — druga i trzecia linia obrony strażnika
 * ścieżek klienta API (`adresApi` w `./klient`). Pierwsza linia to reguły na
 * napisanej ścieżce; te dwie porównują to, co zrobi z adresem parser `URL`
 * (ten sam co w przeglądarce i w `fetch`) — z tym, co napisano.
 *
 * Osobny moduł, żeby wywołanie każdej oceny w `adresApi` dało się sprawdzić
 * osobno: próba podstawia wynik oceny i widzi, czy `adresApi` go respektuje.
 * Bez tego usunięcie wywołania jednej oceny nie zmieniałoby żadnego wyniku, bo
 * pozostałe linie obrony łapią te same ścieżki.
 */

/**
 * Czy adres zbudowany przez `URL` leży w bazie API: ten sam origin i
 * przedrostek `pathname` bazy (baza z końcowym ukośnikiem). Ścieżka, która po
 * normalizacji wychodzi nad bazę (np. sam segment `..` z końcową spacją), nie
 * ma przedrostka bazy. To druga linia obrony obok {@link zgodnaZLiteralem}:
 * tamta porównuje strukturę segmentów, ta pilnuje samej bazy, więc ma własną
 * próbę jednostkową.
 */
export function adresWBazie(adres: URL, baza: URL): boolean {
  return adres.origin === baza.origin && adres.pathname.startsWith(baza.pathname);
}

/**
 * Znacznik doklejany do każdego segmentu w widoku odniesienia (patrz
 * {@link zgodnaZLiteralem}): segment `_..` nie jest segmentem kropkowym, więc
 * parser URL nie zwija go i niczego nie przycina z jego końca.
 */
const ZNACZNIK_SEGMENTU = "_";

/**
 * Czy ścieżka, którą wyśle przeglądarka (`rzeczywisty`: adres zbudowany przez
 * `URL` z sklejonego napisu), ma dokładnie tę strukturę segmentów, którą
 * napisano. Parser `URL` — ten sam co w `fetch` — przed rozbiorem usuwa z końca
 * całego adresu spacje i znaki sterujące, a potem zwija segmenty `.` i `..`
 * (także jako `%2e`, `.%2E` itd.). Ostatni segment `.. ` albo `%2e%2e ` jest
 * więc dla parsera segmentem `..`, choć przed normalizacją nim nie wyglądał.
 *
 * Widok odniesienia to ten sam adres z doklejonym znacznikiem na początku
 * każdego segmentu ścieżki: parser koduje go tak samo, ale niczego nie zwija ani
 * nie przycina z jego końca. Po zdjęciu znacznika musi wyjść dokładnie
 * ścieżka rzeczywista — ta sama liczba segmentów i ta sama treść każdego.
 */
export function zgodnaZLiteralem(
  czysta: string,
  literal: string,
  zapytanie: string,
  rzeczywisty: URL,
  wzglednyOrigin: string,
): boolean {
  const odcinki = literal.split("/");
  const liczba = odcinki.length - 1;
  const zeZnacznikiem = odcinki.map((odcinek, indeks) => (indeks === 0 ? odcinek : `${ZNACZNIK_SEGMENTU}${odcinek}`));
  const odniesienie = new URL(`${czysta}${zeZnacznikiem.join("/")}${zapytanie}`, wzglednyOrigin);
  const segmentyOdniesienia = odniesienie.pathname.split("/");
  const poczatek = segmentyOdniesienia.length - liczba;
  if (poczatek < 1) return false;
  const ogon = segmentyOdniesienia.slice(poczatek);
  if (!ogon.every((segment) => segment.startsWith(ZNACZNIK_SEGMENTU))) return false;
  const oczekiwana = [...segmentyOdniesienia.slice(0, poczatek), ...ogon.map((segment) => segment.slice(ZNACZNIK_SEGMENTU.length))];
  return oczekiwana.join("/") === rzeczywisty.pathname;
}
