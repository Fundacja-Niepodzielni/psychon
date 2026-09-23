import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek ekranu `/panel/superwizja` po przepięciu na `ListTemplate` — sama
 * trasa (`page.tsx` → `SupervisionSlots`), nie logika zapisów na terminy (ma
 * własne testy w `components/h12/__tests__/SupervisionSlots.test.tsx`).
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
// `PageHeader` (przez `ListTemplate`), nie tylko istnieć w drzewie — spy na
// komponencie, nie na klasach ani strukturze DOM.
vi.mock("@/components/molecules/PageHeader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/molecules/PageHeader")>();
  return { ...actual, default: vi.fn(actual.default) };
});

const { default: PageHeader } = await import("@/components/molecules/PageHeader");
const { default: SuperwizjaPage } = await import(
  "@/app/(uczestnik)/panel/superwizja/page"
);

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  vi.mocked(PageHeader).mockClear();
});

describe("SuperwizjaPage", () => {
  it("nagłówek H1 pochodzi z PageHeader ('Superwizja') po wczytaniu pustej listy terminów", async () => {
    apiPaged.mockResolvedValue({ data: [] });

    render(<SuperwizjaPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Superwizja" }),
      ).toBeInTheDocument(),
    );
    // Pozytywna noga: nie samo "nagłówek jest", tylko "TEN komponent go
    // wyrenderował" — ręcznie wpisany `<h1>` zostawiłby ten spy niewywołanym.
    expect(vi.mocked(PageHeader).mock.calls.at(-1)?.[0]).toMatchObject({
      title: "Superwizja",
    });
  });
});
