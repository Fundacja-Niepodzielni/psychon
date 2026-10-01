/**
 * Miernik struktury linii z separatorem „·”: separator należy do elementu,
 * który po nim stoi — jest jego PIERWSZYM dzieckiem i ma po sobie tekst.
 * Dzięki temu przy zawinięciu linii zawija się razem z tym elementem i nigdy
 * nie zostaje na jej końcu. Zwraca listę naruszeń (pustą, gdy struktura jest
 * poprawna); użyty w testach molekuły wiersza i sekcji spraw prowadzących,
 * z kontrolą dodatnią (struktura zła musi dać naruszenie).
 */
export function naruszeniaSeparatora(linia: Element): string[] {
  const naruszenia: string[] = [];
  const separatory = Array.from(linia.querySelectorAll('[aria-hidden="true"]')).filter(
    (element) => element.textContent?.trim() === "·",
  );
  if (separatory.length === 0) naruszenia.push("w linii nie ma żadnego separatora");
  for (const separator of separatory) {
    const wlasciciel = separator.parentElement;
    if (!wlasciciel || wlasciciel === linia) {
      naruszenia.push("separator jest osobnym elementem linii, nie częścią następnego elementu");
    } else if (wlasciciel.firstElementChild !== separator) {
      naruszenia.push("separator nie jest pierwszym dzieckiem swojego elementu");
    } else if (!wlasciciel.lastElementChild || wlasciciel.lastElementChild === separator) {
      naruszenia.push("separator nie ma po sobie tekstu");
    }
  }
  return naruszenia;
}
