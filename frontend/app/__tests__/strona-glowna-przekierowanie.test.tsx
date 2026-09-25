import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/` — server component bez własnego UI: wyłącznie przekierowuje do
 * `/logowanie` (starter nie ma strony publicznej). Wzorem
 * `app/(uczestnik)/panel/__tests__/panel-index-redirect.test.tsx`: brak tu
 * nagłówka, stanu ładowania czy błędu do zmierzenia, więc świadek pilnuje
 * wyłącznie celu przekierowania i tego, że strona nic nie renderuje, gdy
 * (negatywnie) atrapa przekierowania NIE przerywa wykonania tak, jak robi to
 * prawdziwy `redirect()` z Next.js.
 */

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const { default: HomePage } = await import("@/app/page");

beforeEach(() => {
  redirect.mockClear();
});

describe("HomePage", () => {
  it("przekierowuje na /logowanie", () => {
    expect(() => HomePage()).toThrow("NEXT_REDIRECT:/logowanie");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/logowanie");
  });

  it("nie renderuje żadnej treści, gdy przekierowanie (wbrew normalnemu działaniu Next.js) nie przerywa wykonania", () => {
    redirect.mockImplementationOnce(() => undefined as never);

    const wynik = HomePage();

    // Bez przerwania wykonania jedyny bezpieczny wynik to brak treści —
    // ekran startowy nie ma nic do pokazania poza przekierowaniem, więc
    // "pusta odpowiedź" jest tu poprawnym stanem granicznym, nie usterką.
    expect(wynik).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith("/logowanie");
  });
});
