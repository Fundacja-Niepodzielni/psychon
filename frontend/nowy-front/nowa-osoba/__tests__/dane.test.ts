import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import {
  PUSTY_FORMULARZ,
  bladPola,
  bledyPozostale,
  cialoZalozenia,
  etykietaRoli,
  klasyfikujBlad,
  opcjeRol,
  skutekRoli,
  uprawnieniaZProfilu,
} from "../dane";

function blad(status: number, code: string, reszta: Record<string, unknown> = {}) {
  return new ApiError({ status, code, message: "Komunikat serwera.", ...reszta });
}

describe("uprawnieniaZProfilu", () => {
  it("rola sekcji to project_manager albo super_admin; Super Admin tylko z tokenu Super Admina", () => {
    expect(uprawnieniaZProfilu({ role: "project_manager", roles: ["project_manager"] })).toEqual({
      administracja: true,
      superAdmin: false,
    });
    expect(uprawnieniaZProfilu({ role: "super_admin", roles: ["super_admin"] })).toEqual({
      administracja: true,
      superAdmin: true,
    });
    expect(uprawnieniaZProfilu({ role: "volunteer", roles: [] })).toEqual({ administracja: false, superAdmin: false });
  });

  it("bez listy ról czyta pojedynczą rolę", () => {
    expect(uprawnieniaZProfilu({ role: "super_admin" }).superAdmin).toBe(true);
  });
});

describe("opcjeRol i etykiety", () => {
  it("opcje to tylko role nadawane w PsychON, z polskimi etykietami; bez ról administracji", () => {
    expect(opcjeRol()).toEqual([
      { wartosc: "volunteer", etykieta: "Wolontariusz" },
      { wartosc: "student", etykieta: "Student" },
      { wartosc: "instructor", etykieta: "Psycholog prowadzący" },
    ]);
    expect(opcjeRol().map((opcja) => opcja.wartosc)).not.toContain("super_admin");
    expect(opcjeRol().map((opcja) => opcja.wartosc)).not.toContain("project_manager");
  });

  it("każda rola ma zdanie o skutku, rola spoza słownika nie ma", () => {
    for (const opcja of opcjeRol()) expect(skutekRoli(opcja.wartosc)).toBeTruthy();
    expect(skutekRoli("")).toBeUndefined();
    expect(etykietaRoli("student")).toBe("Student");
  });
});

describe("cialoZalozenia", () => {
  it("przycina białe znaki i niesie dokładnie cztery pola", () => {
    expect(
      cialoZalozenia({ first_name: " Marta ", last_name: "Demo ", email: " marta@demo.pl", role: "student" }),
    ).toEqual({ first_name: "Marta", last_name: "Demo", email: "marta@demo.pl", role: "student" });
    expect(Object.keys(cialoZalozenia(PUSTY_FORMULARZ))).toEqual(["first_name", "last_name", "email", "role"]);
  });
});

describe("klasyfikujBlad", () => {
  it("422 z polami, 409 z istniejącym kontem, 403, 401, 404 i reszta", () => {
    expect(klasyfikujBlad(blad(422, "validation_failed", { errors: { email: ["x"] } }))).toEqual({
      rodzaj: "walidacja",
      pola: { email: ["x"] },
    });
    expect(
      klasyfikujBlad(blad(409, "email_already_registered", { reason: { existing_user_id: 44 } })),
    ).toEqual({ rodzaj: "duplikat", komunikat: "Komunikat serwera.", istniejacaOsoba: 44 });
    expect(klasyfikujBlad(blad(409, "email_already_registered"))).toMatchObject({ istniejacaOsoba: null });
    expect(klasyfikujBlad(blad(403, "forbidden")).rodzaj).toBe("zakazane");
    expect(klasyfikujBlad(blad(401, "unauthenticated")).rodzaj).toBe("brak-sesji");
    expect(klasyfikujBlad(blad(404, "not_found")).rodzaj).toBe("nie-znaleziono");
    expect(klasyfikujBlad(blad(500, "unknown_error")).rodzaj).toBe("blad");
    expect(klasyfikujBlad(new Error("sieć")).rodzaj).toBe("blad");
  });

  it("bladPola i bledyPozostale rozdzielają pola ekranu od pól spoza ekranu", () => {
    const zapis = klasyfikujBlad(
      blad(422, "validation_failed", { errors: { role: ["Nieznana rola."], phone: ["Numer jest za długi."] } }),
    );
    expect(bladPola(zapis, "role")).toBe("Nieznana rola.");
    expect(bladPola(zapis, "email")).toBeUndefined();
    expect(bledyPozostale(zapis)).toEqual(["Numer jest za długi."]);
    expect(bladPola(null, "role")).toBeUndefined();
  });
});
