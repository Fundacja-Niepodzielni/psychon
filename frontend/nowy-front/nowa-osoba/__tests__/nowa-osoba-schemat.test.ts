import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUSTY_FORMULARZ, cialoZalozenia } from "../dane";

/**
 * Atrapy odpowiedzi w testach ekranu mają klucze schematu: klucze zasobów
 * i reguł czyta ten test wprost z plików zaplecza. Usunięty klucz w zasobie
 * albo w regułach zapisu daje czerwień.
 */
const ZAPLECZE = join(process.cwd(), "..", "backend");

function odczyt(sciezka: string): string {
  return readFileSync(join(ZAPLECZE, sciezka), "utf-8");
}

/** Klucze tablicy `'klucz' =>` z pliku PHP. */
function kluczePhp(tekst: string): string[] {
  return [...tekst.matchAll(/'([a-z_]+)'\s*=>/g)].map((dopasowanie) => dopasowanie[1]);
}

function brakujace(potrzebne: string[], dostepne: string[]): string[] {
  return potrzebne.filter((klucz) => !dostepne.includes(klucz));
}

describe("Nowa osoba — klucze odpowiedzi i ciała żądania zgodne z zapleczem", () => {
  it("karta osoby: atrapa 201/200 używa kluczy AdminUserCardResource (profile) i ProfileResource (id, email)", () => {
    const karta = kluczePhp(odczyt("app/Http/Resources/AdminUserCardResource.php"));
    const profil = kluczePhp(odczyt("app/Http/Resources/ProfileResource.php"));
    expect(brakujace(["profile"], karta)).toEqual([]);
    expect(brakujace(["id", "email", "first_name", "last_name", "role"], profil)).toEqual([]);
  });

  it("GET /me: ekran czyta role i roles z ProfileResource", () => {
    const profil = kluczePhp(odczyt("app/Http/Resources/ProfileResource.php"));
    expect(brakujace(["role", "roles"], profil)).toEqual([]);
    const schemat = JSON.parse(odczyt("openapi.json")).components.schemas.ProfileResource.properties;
    expect(brakujace(["role", "roles"], Object.keys(schemat))).toEqual([]);
  });

  it("ciało POST /admin/users: klucze mieszczą się w regułach StoreUserRequest, a pola wymagane są wysłane", () => {
    const reguly = odczyt("app/Http/Requests/H18/StoreUserRequest.php");
    const regulyRules = reguly.slice(reguly.indexOf("function rules"), reguly.indexOf("function messages"));
    const klucze = kluczePhp(regulyRules);
    const cialo = Object.keys(cialoZalozenia({ ...PUSTY_FORMULARZ, role: "student" }));
    expect(brakujace(cialo, klucze)).toEqual([]);
    const wymagane = [...regulyRules.matchAll(/'([a-z_]+)'\s*=>\s*\['required'/g)].map((d) => d[1]);
    expect(brakujace(wymagane, cialo)).toEqual([]);
  });

  it("ciało PATCH /admin/users/{id}: klucz role istnieje w regułach UpdateUserRequest", () => {
    const reguly = odczyt("app/Http/Requests/H18/UpdateUserRequest.php");
    expect(brakujace(["role"], kluczePhp(reguly))).toEqual([]);
  });

  it("kontrola dodatnia: usunięty klucz schematu jest wykrywany", () => {
    const profil = kluczePhp(odczyt("app/Http/Resources/ProfileResource.php")).filter((klucz) => klucz !== "roles");
    expect(brakujace(["role", "roles"], profil)).toEqual(["roles"]);
  });
});
