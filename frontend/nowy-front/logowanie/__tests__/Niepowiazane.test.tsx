import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

/**
 * Ekran „konto nie jest jeszcze połączone”: sprawdzanie → identyfikator /
 * brak powiązania / awaria / blokada; ponowienie tylko na kliknięcie; limit
 * czasu; „Kopiuj”; wylogowanie z Kont tym samym przebiegiem co stara strona.
 */

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

const checkAccountBinding = vi.fn();
const endSession = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  checkAccountBinding: (...a: unknown[]) => checkAccountBinding(...a),
  endSession: (...a: unknown[]) => endSession(...a),
}));

const { KONTO_BINDING_AWARIA, KONTO_BINDING_LIMIT_MS, KOD_KONTO_ZABLOKOWANE } = await import("@/lib/api");
const { Niepowiazane } = await import("../Niepowiazane");

const SUB = "demo-sub-0001";
let straznik: ReturnType<typeof straznikHostow>;
const assign = vi.fn();
const writeText = vi.fn();

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<Niepowiazane />);
  });
  return wynik!;
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  checkAccountBinding.mockReset();
  endSession.mockReset();
  endSession.mockResolvedValue(undefined);
  assign.mockReset();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign } as unknown as Location);
  straznik = straznikHostow(() => ({ json: async () => ({ url: "/konta-wyloguj" }) }));
});

afterEach(() => {
  expect(straznik.obce()).toEqual([]);
  straznik.przywroc();
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("niepowiązane — stany", () => {
  it("zaraz po wejściu: „Sprawdzam…”, nagłówek bez twierdzenia, obszar ogłaszany", async () => {
    checkAccountBinding.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();
    expect(screen.getByText("Sprawdzam stan Twojego konta…")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Twoje konto w PsychON" })).toBeTruthy();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(checkAccountBinding).toHaveBeenCalledTimes(1);
    expect(checkAccountBinding.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });

  it("401 z identyfikatorem: identyfikator i „Kopiuj” wkłada do schowka tę samą wartość", async () => {
    checkAccountBinding.mockResolvedValue({ code: "konto_niepowiazane", sub: SUB });
    await pokaz();
    expect(screen.getByRole("heading", { level: 1, name: "Konto nie jest jeszcze połączone" })).toBeTruthy();
    expect(screen.getByText(SUB).tagName).toBe("CODE");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopiuj" }));
    });
    expect(writeText).toHaveBeenCalledWith(SUB);
  });

  it("401 bez identyfikatora: zdanie o braku powiązania, bez „Kopiuj”", async () => {
    checkAccountBinding.mockResolvedValue({ code: "unauthenticated" });
    await pokaz();
    expect(screen.getByText(/zalogowało się poprawnie, ale nie jest jeszcze powiązane/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kopiuj" })).toBeNull();
  });

  it("wynik null: awaria, nie zdanie o braku powiązania", async () => {
    checkAccountBinding.mockResolvedValue(null);
    await pokaz();
    expect(screen.getByText("Nie udało się sprawdzić stanu Twojego konta — spróbuj ponownie za chwilę.")).toBeTruthy();
    expect(screen.queryByText(/nie jest jeszcze powiązane z żadnym/)).toBeNull();
  });

  it("awaria: ponowienie tylko na kliknięcie, sukces pokazuje identyfikator", async () => {
    checkAccountBinding.mockResolvedValueOnce({ code: KONTO_BINDING_AWARIA });
    await pokaz();
    expect(checkAccountBinding).toHaveBeenCalledTimes(1);
    checkAccountBinding.mockResolvedValueOnce({ code: "konto_niepowiazane", sub: SUB });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(checkAccountBinding).toHaveBeenCalledTimes(2);
    expect(screen.getByText(SUB)).toBeTruthy();
  });

  it("ponowienie w trakcie ma aria-busy, a drugie kliknięcie nie wysyła drugiego zapytania", async () => {
    checkAccountBinding.mockResolvedValueOnce({ code: KONTO_BINDING_AWARIA });
    await pokaz();
    checkAccountBinding.mockReturnValue(new Promise(() => {}));
    const przycisk = screen.getByRole("button", { name: "Spróbuj ponownie" });
    await act(async () => {
      fireEvent.click(przycisk);
    });
    expect(przycisk.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      fireEvent.click(przycisk);
    });
    expect(checkAccountBinding).toHaveBeenCalledTimes(2);
  });

  it("limit czasu: przed limitem bez awarii, po limicie awaria; trwała awaria nie ponawia sama", async () => {
    vi.useFakeTimers();
    checkAccountBinding.mockReturnValue(new Promise(() => {}));
    await pokaz();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KONTO_BINDING_LIMIT_MS - 1);
    });
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(checkAccountBinding).toHaveBeenCalledTimes(1);
  });

  it("konto zablokowane: przejście na /logowanie/zablokowane, bez zdań o powiązaniu", async () => {
    checkAccountBinding.mockResolvedValue({ code: KOD_KONTO_ZABLOKOWANE });
    await pokaz();
    expect(replace).toHaveBeenCalledWith("/logowanie/zablokowane");
    expect(screen.queryByText(/powiązane/)).toBeNull();
  });
});

describe("niepowiązane — wylogowanie", () => {
  it("odczyt adresu, koniec sesji, wyjście pod adres Kont", async () => {
    checkAccountBinding.mockResolvedValue({ code: "unauthenticated" });
    await pokaz();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    });
    expect(straznik.adresy).toEqual(["/api/auth/end-session-url"]);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/konta-wyloguj");
  });

  it("adres nieodczytany: sesja się kończy, powrót na /logowanie", async () => {
    checkAccountBinding.mockResolvedValue({ code: "unauthenticated" });
    straznik.atrapa.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await pokaz();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    });
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/logowanie");
    expect(assign).not.toHaveBeenCalled();
  });
});
