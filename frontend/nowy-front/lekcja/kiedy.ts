/** Ile czasu temu: „przed chwilą”, „5 min temu”, „3 godz. temu”, „3 dni temu”, a dawniej data. */
export function kiedyTemu(czas: string | null, teraz: Date = new Date()): string | null {
  if (czas === null) return null;
  const moment = new Date(czas).getTime();
  if (Number.isNaN(moment)) return null;
  const sekundy = Math.max(0, Math.round((teraz.getTime() - moment) / 1000));
  if (sekundy < 60) return "przed chwilą";
  const minuty = Math.floor(sekundy / 60);
  if (minuty < 60) return `${minuty} min temu`;
  const godziny = Math.floor(minuty / 60);
  if (godziny < 24) return `${godziny} godz. temu`;
  const dni = Math.floor(godziny / 24);
  if (dni === 1) return "wczoraj";
  if (dni < 30) return `${dni} dni temu`;
  return new Date(czas).toISOString().slice(0, 10);
}
