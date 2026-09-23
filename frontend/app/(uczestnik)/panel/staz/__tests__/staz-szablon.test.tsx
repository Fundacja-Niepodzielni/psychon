import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek ekranu `/panel/staz` po przepięciu na `PageTemplate` — sama trasa
 * (`page.tsx` → `InternshipJournal`), nie logika dziennika (ma własne testy w
 * `components/h11/__tests__/InternshipJournal.test.tsx`).
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

// Ta sama kontrola co w świadku `panel/pulpit`: nagłówek ma POCHODZIĆ z
// `PageHeader`, nie tylko istnieć w drzewie — spy na komponencie, nie na
// klasach ani strukturze DOM (zakaz sprzęgania z układem).
vi.mock("@/components/molecules/PageHeader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/molecules/PageHeader")>();
  return { ...actual, default: vi.fn(actual.default) };
});

const { default: PageHeader } = await import("@/components/molecules/PageHeader");
const { default: StazPage } = await import("@/app/(uczestnik)/panel/staz/page");

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  vi.mocked(PageHeader).mockClear();
});

describe("StazPage", () => {
  it("nagłówek H1 pochodzi z PageHeader ('Dziennik stażu') po wczytaniu pustego dziennika", async () => {
    apiPaged.mockResolvedValue({
      data: [],
      meta: {
        current_page: 1,
        per_page: 25,
        total: 0,
        last_page: 1,
        extra: { accepted_hours: "0", required_hours: "40" },
      },
    });

    render(<StazPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Dziennik stażu" }),
      ).toBeInTheDocument(),
    );
    // Pozytywna noga: nie samo "nagłówek jest", tylko "TEN komponent go
    // wyrenderował" — ręcznie wpisany `<h1>` zostawiłby ten spy niewywołanym.
    expect(vi.mocked(PageHeader).mock.calls.at(-1)?.[0]).toMatchObject({
      title: "Dziennik stażu",
    });
  });
});
