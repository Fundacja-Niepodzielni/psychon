import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZlecenieWgrania } from "../dane";
import { odczytajPrzesuniecie, wgrajNagranie, wyslijKawalki } from "../tus";

const ZLECENIE: ZlecenieWgrania = {
  video_id: "vid-1",
  upload_url: "https://video.test/tusupload",
  library_id: "77",
  expiration_time: 1790000000,
  signature: "podpis",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

type Wywolanie = [string, { method: string; headers: Record<string, string>; body?: Blob }];

function atrapaDostawcy(odpowiedzi: Response[]) {
  const kolejka = [...odpowiedzi];
  const atrapa = vi.fn(async () => {
    const nastepna = kolejka.shift();
    if (!nastepna) throw new Error("Zabrakło odpowiedzi atrapy");
    return nastepna;
  });
  vi.stubGlobal("fetch", atrapa);
  return atrapa;
}

const UTWORZONO = () => new Response(null, { status: 201, headers: { Location: "/tusupload/abc" } });

describe("wgrywanie nagrania protokołem TUS", () => {
  it("utworzenie wgrania niesie pozwolenie, długość i metadane w base64", async () => {
    const atrapa = atrapaDostawcy([UTWORZONO(), new Response(null, { status: 204, headers: { "Upload-Offset": "5" } })]);
    await wgrajNagranie(new File(["12345"], "n.mp4", { type: "video/mp4" }), ZLECENIE, "Wstęp ż");

    const [adres, opcje] = atrapa.mock.calls[0] as unknown as Wywolanie;
    expect(adres).toBe("https://video.test/tusupload");
    expect(opcje.method).toBe("POST");
    expect(opcje.headers).toMatchObject({
      "Tus-Resumable": "1.0.0",
      AuthorizationSignature: "podpis",
      AuthorizationExpire: "1790000000",
      VideoId: "vid-1",
      LibraryId: "77",
      "Upload-Length": "5",
    });
    const metadane = opcje.headers["Upload-Metadata"];
    expect(metadane).toContain(`filetype ${btoa("video/mp4")}`);
    const tytul = metadane.split(",").find((czesc) => czesc.startsWith("title "))!.slice(6);
    expect(new TextDecoder().decode(Uint8Array.from(atob(tytul), (znak) => znak.charCodeAt(0)))).toBe("Wstęp ż");
  });

  it("wysyłka idzie pod adres z Location, z przesunięciem i typem offset+octet-stream", async () => {
    const atrapa = atrapaDostawcy([UTWORZONO(), new Response(null, { status: 204, headers: { "Upload-Offset": "5" } })]);
    await wgrajNagranie(new File(["12345"], "n.mp4", { type: "video/mp4" }), ZLECENIE, "T");

    const [adres, opcje] = atrapa.mock.calls[1] as unknown as Wywolanie;
    expect(adres).toBe("https://video.test/tusupload/abc");
    expect(opcje.method).toBe("PATCH");
    expect(opcje.headers["Content-Type"]).toBe("application/offset+octet-stream");
    expect(opcje.headers["Upload-Offset"]).toBe("0");
    expect(opcje.headers.VideoId).toBe("vid-1");
  });

  it("plik większy niż kawałek idzie w dwóch żądaniach z rosnącym przesunięciem i postępem", async () => {
    const kawalek = 5 * 1024 * 1024;
    const atrapa = atrapaDostawcy([
      UTWORZONO(),
      new Response(null, { status: 204, headers: { "Upload-Offset": String(kawalek) } }),
      new Response(null, { status: 204, headers: { "Upload-Offset": String(kawalek + 10) } }),
    ]);
    const postepy: number[] = [];
    await wgrajNagranie(
      new File([new Uint8Array(kawalek + 10)], "duze.mp4", { type: "video/mp4" }),
      ZLECENIE,
      "T",
      (postep) => postepy.push(postep.wyslano),
    );
    const przesuniecia = atrapa.mock.calls.slice(1).map((wywolanie) => (wywolanie as unknown as Wywolanie)[1].headers["Upload-Offset"]);
    expect(przesuniecia).toEqual(["0", String(kawalek)]);
    expect(postepy).toEqual([0, kawalek, kawalek + 10]);
  });

  it("odmowa dostawcy przy utworzeniu: błąd z polskim zdaniem, bez wysyłki", async () => {
    const atrapa = atrapaDostawcy([new Response(null, { status: 401 })]);
    await expect(wgrajNagranie(new File(["1"], "n.mp4", { type: "video/mp4" }), ZLECENIE, "T")).rejects.toThrow(
      "Nie udało się rozpocząć wgrywania nagrania.",
    );
    expect(atrapa).toHaveBeenCalledTimes(1);
  });

  it("przerwana wysyłka kawałka: błąd z polskim zdaniem", async () => {
    atrapaDostawcy([UTWORZONO(), new Response(null, { status: 500 })]);
    await expect(wgrajNagranie(new File(["1"], "n.mp4", { type: "video/mp4" }), ZLECENIE, "T")).rejects.toThrow(
      "Wgrywanie nagrania zostało przerwane.",
    );
  });

  it("sygnał przerwania idzie na oba rodzaje żądań; przerwanie w trakcie kawałka odrzuca wysyłkę", async () => {
    const kontroler = new AbortController();
    const sygnaly: (AbortSignal | undefined)[] = [];
    const atrapa = vi.fn(
      (_adres: string, opcje: { method: string; signal?: AbortSignal }) =>
        new Promise<Response>((ok, blad) => {
          sygnaly.push(opcje.signal);
          if (opcje.method === "POST") {
            ok(UTWORZONO());
            return;
          }
          opcje.signal?.addEventListener("abort", () => blad(new DOMException("Przerwano", "AbortError")));
          kontroler.abort();
        }),
    );
    vi.stubGlobal("fetch", atrapa);

    await expect(
      wgrajNagranie(new File(["12345"], "n.mp4", { type: "video/mp4" }), ZLECENIE, "T", undefined, kontroler.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sygnaly).toEqual([kontroler.signal, kontroler.signal]);
    expect(atrapa).toHaveBeenCalledTimes(2);
  });

  it("pusty plik nie wywołuje dostawcy", async () => {
    const atrapa = atrapaDostawcy([]);
    await expect(wgrajNagranie(new File([], "pusty.mp4", { type: "video/mp4" }), ZLECENIE, "T")).rejects.toThrow(
      "Plik nagrania jest pusty.",
    );
    expect(atrapa).not.toHaveBeenCalled();
  });
});

describe("dokończenie wgrania: pytanie o postęp i wysyłka reszty", () => {
  const ADRES = "https://video.test/tusupload/abc";

  it("pytanie o postęp idzie metodą HEAD pod adres wgrania, z pozwoleniem, i zwraca liczbę bajtów dostawcy", async () => {
    const atrapa = atrapaDostawcy([new Response(null, { status: 200, headers: { "Upload-Offset": "3" } })]);
    expect(await odczytajPrzesuniecie(ADRES, ZLECENIE, 5)).toBe(3);
    const [adres, opcje] = atrapa.mock.calls[0] as unknown as Wywolanie;
    expect(adres).toBe(ADRES);
    expect(opcje.method).toBe("HEAD");
    expect(opcje.headers).toMatchObject({ "Tus-Resumable": "1.0.0", AuthorizationSignature: "podpis", VideoId: "vid-1" });
  });

  it.each([
    ["dostawca nie zna wgrania", new Response(null, { status: 404 })],
    ["odpowiedź bez liczby bajtów", new Response(null, { status: 200 })],
    ["liczba bajtów nie jest liczbą całkowitą", new Response(null, { status: 200, headers: { "Upload-Offset": "3.5" } })],
    ["dostawca ma więcej bajtów, niż ma plik", new Response(null, { status: 200, headers: { "Upload-Offset": "6" } })],
  ])("%s: brak przesunięcia, czyli wysyłka od zera", async (_opis, odpowiedz) => {
    atrapaDostawcy([odpowiedz]);
    expect(await odczytajPrzesuniecie(ADRES, ZLECENIE, 5)).toBeNull();
  });

  it("wysyłka od przesunięcia niesie tylko resztę pliku", async () => {
    const atrapa = atrapaDostawcy([new Response(null, { status: 204, headers: { "Upload-Offset": "5" } })]);
    const postepy: number[] = [];
    await wyslijKawalki(new File(["12345"], "n.mp4", { type: "video/mp4" }), ADRES, ZLECENIE, 3, (postep) => postepy.push(postep.wyslano));
    const [adres, opcje] = atrapa.mock.calls[0] as unknown as Wywolanie;
    expect(adres).toBe(ADRES);
    expect(opcje.headers["Upload-Offset"]).toBe("3");
    expect(opcje.body!.size).toBe(2);
    expect(postepy).toEqual([3, 5]);
  });

  it("dostawca ma już cały plik: żadnego żądania z bajtami", async () => {
    const atrapa = atrapaDostawcy([]);
    await wyslijKawalki(new File(["12345"], "n.mp4", { type: "video/mp4" }), ADRES, ZLECENIE, 5);
    expect(atrapa).not.toHaveBeenCalled();
  });
});
