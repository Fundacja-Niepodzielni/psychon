import { describe, expect, it } from "vitest";
import { jedenMain } from "./jeden-main";

describe("jedenMain (pomocnik świadka szablonów)", () => {
  it("przechodzi, gdy jest dokładnie jeden main z id=tresc i tabIndex=-1", () => {
    const kontener = document.createElement("div");
    kontener.innerHTML = '<main id="tresc" tabindex="-1">treść</main>';
    expect(() => jedenMain(kontener)).not.toThrow();
  });

  it("KONTROLA DODATNIA NA STAŁE: rzuca, gdy w treści pojawia się drugi main", () => {
    const kontener = document.createElement("div");
    kontener.innerHTML =
      '<main id="tresc" tabindex="-1">pierwszy</main><main>drugi, nie powinien tu być</main>';
    expect(() => jedenMain(kontener)).toThrow(/dokładnie jednego/);
  });

  it("rzuca, gdy main nie ma id=tresc", () => {
    const kontener = document.createElement("div");
    kontener.innerHTML = '<main tabindex="-1">treść</main>';
    expect(() => jedenMain(kontener)).toThrow(/id="tresc"/);
  });

  it("rzuca, gdy main ma tabIndex różny od -1", () => {
    const kontener = document.createElement("div");
    kontener.innerHTML = '<main id="tresc" tabindex="0">treść</main>';
    expect(() => jedenMain(kontener)).toThrow(/tabIndex/);
  });

  it("rzuca, gdy w treści nie ma żadnego main", () => {
    const kontener = document.createElement("div");
    kontener.innerHTML = "<div>bez punktu orientacyjnego</div>";
    expect(() => jedenMain(kontener)).toThrow(/dokładnie jednego/);
  });
});
