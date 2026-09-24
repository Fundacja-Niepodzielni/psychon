// Sonda zdrowia kontenera frontu.
//
// Trasa nie czyta bazy, nie wola API i nie sprawdza sesji - odpowiada 200 i
// tyle. To jest celowe: sonda ma odroznic "serwer Next nie odpowiada" od
// wszystkiego innego. Gdyby pytala o backend, czerwien frontu zapalalaby sie
// przy awarii cudzego kontenera i przestalaby mowic, czyja to awaria.
//
// `force-dynamic` jest tu koniecznym warunkiem, a nie ozdoba: odpowiedz
// zbudowana przy budowaniu obrazu wracalaby takze wtedy, gdy serwer nie
// potrafi juz uruchomic zadnej obslugi zadania - czyli sonda swiecilaby na
// zielono w awarii, ktora ma wykrywac.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "cache-control": "no-store", "content-type": "text/plain" },
  });
}
