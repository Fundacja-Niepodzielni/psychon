import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import type { LekcjaAdmin, StanNagrania } from "../dane";
import {
  LIMIT_ZNAKOW_TRESCI,
  bledyZSerwera,
  cialoZapisu,
  czasNagrania,
  formularzZLekcji,
  formularzeRowne,
  liczZnaki,
  mozeWgrywacNagranie,
  opisLicznika,
  opisNagrania,
  powodNieaktywnegoNagrania,
  walidujLokalnie,
  zdanieBleduPliku,
  zdanieBleduZapisu,
} from "../formularz";

const LEKCJA: LekcjaAdmin = {
  id: 21,
  course_id: 3,
  title: "Wprowadzenie do wywiadu",
  description: null,
  content: null,
  sequence_order: 1,
  topic_id: 7,
  topic_position: 1,
  video_provider_id: null,
  duration_seconds: 0,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

describe("licznik znaków treści lekcji", () => {
  it("limit wynosi 20 000 znaków", () => {
    expect(LIMIT_ZNAKOW_TRESCI).toBe(20000);
  });

  it("wielobajtowe znaki liczą się po jednym, nie po bajcie", () => {
    const tekst = "ż".repeat(20000);
    expect(new TextEncoder().encode(tekst).length).toBe(40000);
    expect(liczZnaki(tekst)).toBe(20000);
    expect(opisLicznika(liczZnaki(tekst))).toBe("20 000 z 20 000 znaków.");
  });

  it("znak spoza podstawowego zakresu liczy się jako jeden znak", () => {
    expect("😀".length).toBe(2);
    expect(liczZnaki("😀a")).toBe(2);
  });

  it("20 001 znaków: opis pokazuje przekroczenie o jeden znak", () => {
    expect(opisLicznika(20001)).toBe("Przekroczono limit o 1 znak (limit: 20 000).");
    expect(opisLicznika(20003)).toBe("Przekroczono limit o 3 znaki (limit: 20 000).");
    expect(opisLicznika(20010)).toBe("Przekroczono limit o 10 znaków (limit: 20 000).");
  });

  it("pusta treść: 0 z 20 000", () => {
    expect(opisLicznika(liczZnaki(""))).toBe("0 z 20 000 znaków.");
  });
});

describe("ciało zapisu lekcji", () => {
  it("treść idzie dokładnie tak, jak wpisano: bez przycinania spacji i zmiany HTML", () => {
    const tresc = "  Wiersz z twardym łamaniem  \n<script>alert(1)</script>  ";
    const cialo = cialoZapisu({ title: "T", description: "", content: tresc, duration: "60" });
    expect(cialo.content).toBe(tresc);
  });

  it("ciało ma dokładnie cztery pola i żadnego z pól zakazanych", () => {
    const cialo = cialoZapisu(formularzZLekcji(LEKCJA));
    expect(Object.keys(cialo).sort()).toEqual(["content", "description", "duration_seconds", "title"]);
    expect(cialo).not.toHaveProperty("topic_id");
    expect(cialo).not.toHaveProperty("topic_position");
    expect(cialo).not.toHaveProperty("sequence_order");
  });

  it("pusty opis idzie jako null, czas jako liczba całkowita", () => {
    const cialo = cialoZapisu({ title: "T", description: "  ", content: "", duration: "2" });
    expect(cialo.description).toBeNull();
    expect(cialo.duration_seconds).toBe(120);
  });

  it("formularz z lekcji: pola puste zamiast null, czas jako tekst", () => {
    expect(formularzZLekcji(LEKCJA)).toEqual({
      title: "Wprowadzenie do wywiadu",
      description: "",
      content: "",
      duration: "0",
    });
  });

  it("porównanie formularzy widzi zmianę jednego znaku treści", () => {
    const a = formularzZLekcji(LEKCJA);
    expect(formularzeRowne(a, { ...a })).toBe(true);
    expect(formularzeRowne(a, { ...a, content: "x" })).toBe(false);
  });
});

describe("walidacja lokalna", () => {
  it("pusty tytuł i czas z ułamkiem dają błędy pól", () => {
    const bledy = walidujLokalnie({ title: "   ", description: "", content: "", duration: "1.5" });
    expect(bledy.title).toBe("Podaj tytuł lekcji.");
    expect(bledy.duration).toBe("Podaj czas trwania w pełnych minutach, 0 albo więcej.");
  });

  it("poprawny formularz nie ma błędów", () => {
    expect(walidujLokalnie({ title: "T", description: "", content: "", duration: "0" })).toEqual({});
  });
});

describe("błędy serwera", () => {
  it("422 z errors.content trafia do pola treści", () => {
    const blad = new ApiError({
      status: 422,
      code: "validation_failed",
      message: "Popraw zaznaczone pola.",
      errors: { content: ["Treść lekcji może mieć najwyżej 20 000 znaków."] },
    });
    expect(bledyZSerwera(blad)).toEqual({ content: "Treść lekcji może mieć najwyżej 20 000 znaków." });
  });

  it("errors.duration_seconds trafia do pola czasu", () => {
    const blad = new ApiError({
      status: 422,
      code: "validation_failed",
      message: "x",
      errors: { duration_seconds: ["Czas trwania nie może być ujemny."] },
    });
    expect(bledyZSerwera(blad)).toEqual({ duration: "Czas trwania nie może być ujemny." });
  });

  it("inny status albo błąd bez pól nie jest błędem pól", () => {
    expect(bledyZSerwera(new ApiError({ status: 500, code: "x", message: "y" }))).toBeNull();
    expect(bledyZSerwera(new Error("sieć"))).toBeNull();
    expect(
      bledyZSerwera(new ApiError({ status: 422, code: "validation_failed", message: "y", errors: { inne: ["z"] } })),
    ).toBeNull();
  });

  it("zdania błędu zapisu: rola, usunięta lekcja, sieć", () => {
    expect(zdanieBleduZapisu(new ApiError({ status: 403, code: "forbidden", message: "x" }))).toMatch(/Twojej roli/);
    expect(zdanieBleduZapisu(new ApiError({ status: 404, code: "not_found", message: "x" }))).toMatch(/usunięta/);
    expect(zdanieBleduZapisu(new TypeError("Failed to fetch"))).toBe("Nie udało się zapisać. Spróbuj ponownie.");
  });

  it("błąd pliku: komunikat pola file ma pierwszeństwo", () => {
    const blad = new ApiError({
      status: 422,
      code: "validation_failed",
      message: "Popraw zaznaczone pola.",
      errors: { file: ["Plik może mieć najwyżej 10 MB."] },
    });
    expect(zdanieBleduPliku(blad)).toBe("Plik może mieć najwyżej 10 MB.");
  });
});

describe("sekcja nagrania", () => {
  it("wgrywać nagranie może opiekun projektu i Super Admin", () => {
    expect(mozeWgrywacNagranie("project_manager")).toBe(true);
    expect(mozeWgrywacNagranie("super_admin")).toBe(true);
  });

  it("żadna inna rola, brak roli ani napis spoza słownika nie może wgrywać nagrania", () => {
    for (const rola of ["instructor", "volunteer", "student", null, "", "Super_Admin", "admin", "project_manager "]) {
      expect(mozeWgrywacNagranie(rola), `rola: ${JSON.stringify(rola)}`).toBe(false);
    }
  });

  it("powód nieaktywnej sekcji: brak dla obu ról administracji, zdanie dla pozostałych", () => {
    expect(powodNieaktywnegoNagrania("project_manager")).toBeNull();
    expect(powodNieaktywnegoNagrania("super_admin")).toBeNull();
    for (const rola of ["instructor", "volunteer", "student", "nieznana-rola"]) {
      expect(powodNieaktywnegoNagrania(rola), `rola: ${rola}`).toBe("Nagranie może wgrać Opiekun Projektu albo Super Admin.");
    }
    expect(powodNieaktywnegoNagrania(null)).toBe("Nie udało się ustalić, czy możesz wgrywać nagrania.");
  });

  it("opis stanu nagrania dla każdego stanu serwera i dla braku odpowiedzi", () => {
    const gotowe: StanNagrania = { status: "finished", duration_seconds: 125, preview_embed_url: "https://x.test/e" };
    expect(opisNagrania({ status: "no_video" })).toMatch(/nie ma jeszcze nagrania/);
    expect(opisNagrania({ ...gotowe, status: "processing" })).toMatch(/przetwarzane/);
    expect(opisNagrania({ ...gotowe, status: "error" })).toMatch(/błędem/);
    expect(opisNagrania(gotowe)).toBe("Nagranie jest gotowe. Czas trwania: 2 min 5 s.");
    expect(opisNagrania(null)).toMatch(/Nie udało się sprawdzić/);
  });

  it("czas nagrania poniżej minuty to same sekundy", () => {
    expect(czasNagrania(45)).toBe("45 s");
  });
});
