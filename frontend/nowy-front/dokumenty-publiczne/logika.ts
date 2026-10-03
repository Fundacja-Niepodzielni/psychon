/**
 * Akapity treści dokumentu prawnego — treść jest zwykłym tekstem, akapity
 * rozdziela pusta linia (jak w `app/dokumenty-prawne/[typ]/page.tsx`).
 * Akapity puste po obcięciu są pomijane.
 */
export function akapityTresci(tresc: string): string[] {
  return tresc
    .split(/\n{2,}/)
    .map((akapit) => akapit.trim())
    .filter((akapit) => akapit.length > 0);
}
