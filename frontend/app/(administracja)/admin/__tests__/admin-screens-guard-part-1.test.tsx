import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { dwaTerminyPrawdziwyKsztalt } from "@/components/h12/__tests__/fixture";

/**
 * Admin screens (first half) mounted inside the admin layout
 * (`RequireRole allowedRoles={["project_manager", "super_admin"]}`), the same
 * way `prowadzacy/pytania/__tests__/pytania-dostep.test.tsx` mounts an
 * instructor screen under its layout.
 *
 * Only the HTTP transport (`@/lib/api/klient`) is replaced, so the real
 * guard, the real per-module fetchers and the real screen components run.
 * For every screen:
 * - role "instructor" gets the shared "Brak dostępu" screen, the fixture
 *   content never appears and no request other than `/me` is made;
 * - role "project_manager" gets the screen with content from its endpoint.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error("notFound() called");
  },
}));

const { ApiError } = await import("@/lib/api/klient");
const { default: AdminLayout } = await import("@/app/(administracja)/admin/layout");
const { default: CoursesPage } = await import("@/app/(administracja)/admin/kursy/page");
const { default: CoursePage } = await import("@/app/(administracja)/admin/kursy/[id]/page");
const { default: UsersPage } = await import("@/app/(administracja)/admin/uczestniczki/page");
const { default: UserPage } = await import("@/app/(administracja)/admin/uczestniczki/[id]/page");
const { default: QuestionBankPage } = await import(
  "@/app/(administracja)/admin/testy/[id]/pytania/page"
);
const { default: CertificatesPage } = await import("@/app/(administracja)/admin/certyfikaty/page");
const { default: InternshipPage } = await import("@/app/(administracja)/admin/staz/page");
const { default: SupervisionPage } = await import("@/app/(administracja)/admin/superwizje/page");
const { default: CasesPage } = await import("@/app/(administracja)/admin/sprawy/page");

const page = <T,>(data: T[]) => ({
  data,
  meta: { current_page: 1, per_page: 25, total: data.length, last_page: 1 },
});
const params = (id: string) => Promise.resolve({ id });

const course = {
  id: 4,
  title: "Praca z emocjami",
  slug: "praca-z-emocjami",
  description: null,
  type: "course",
  product_group: "psychon",
  sequence_order: 1,
  edition_id: null,
  is_published: true,
  lessons_count: 0,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

const userCard = {
  profile: {
    id: 91,
    first_name: "Marta",
    last_name: "Nowicka",
    email: "marta@example.com",
    role: "volunteer",
    phone: null,
    pesel: null,
    address: { street: null, city: null, zip: null },
    access_expires_at: null,
    program_completed_at: null,
    product_group: "psychon",
  },
  progress: {
    courses_done: 4,
    courses_total: 9,
    hours_accepted: "37",
    supervision_present: 12,
    workshop_done: true,
  },
  documents: [],
  recent_notifications: [],
  audit_entries: [],
};

interface ScreenCase {
  url: string;
  /** Builds the page element; async server pages are awaited first. */
  element: () => ReactElement | Promise<ReactElement>;
  /** Responses keyed by request path (query string ignored). */
  routes: Record<string, unknown>;
  /** Text that only the loaded screen shows (comes from `routes`). */
  seen: string;
}

const SCREENS: ScreenCase[] = [
  {
    url: "/admin/kursy",
    element: () => <CoursesPage />,
    routes: { "/admin/courses": page([course]) },
    seen: "Praca z emocjami",
  },
  {
    url: "/admin/kursy/[id]",
    element: () => <CoursePage params={params("4")} />,
    routes: { "/admin/courses/4": course, "/admin/courses/4/lessons": [] },
    seen: "Praca z emocjami",
  },
  {
    url: "/admin/uczestniczki",
    element: () => <UsersPage />,
    routes: {
      "/admin/users": page([
        {
          id: 3,
          first_name: "Marta",
          last_name: "Kowalska",
          email: "marta.kowalska@example.com",
          role: "volunteer",
          status: "active",
        },
      ]),
    },
    seen: "marta.kowalska@example.com",
  },
  {
    url: "/admin/uczestniczki/[id]",
    element: () => <UserPage params={params("91")} />,
    routes: { "/admin/users/91": userCard },
    seen: "Marta Nowicka",
  },
  {
    url: "/admin/testy/[id]/pytania",
    element: () => QuestionBankPage({ params: params("12") }),
    routes: {
      "/admin/tests/12/questions": [
        {
          id: 101,
          body: "Ile wynosi suma kątów w trójkącie?",
          sequence_order: 1,
          answers: [
            { id: 1, body: "180°", is_correct: true },
            { id: 2, body: "90°", is_correct: false },
          ],
        },
      ],
    },
    seen: "Ile wynosi suma kątów w trójkącie?",
  },
  {
    url: "/admin/certyfikaty",
    element: () => <CertificatesPage />,
    routes: {
      "/admin/certificates": page([
        {
          id: 1,
          number: "NP/2026/001",
          issued_at: "2026-06-01T10:00:00Z",
          status: "valid",
          edition: "Edycja 2026",
          user: { id: 5, first_name: "Marta", last_name: "Testowa" },
          revoked_at: null,
          revoked_reason: null,
          revoked_by: null,
        },
      ]),
    },
    seen: "NP/2026/001",
  },
  {
    url: "/admin/staz",
    element: () => <InternshipPage />,
    routes: {
      "/admin/internship/pending": page([
        {
          id: 9,
          date: "2026-01-05",
          hours: "2.5",
          form: "phone_duty",
          consultations_count: 3,
          description: "Dyżur telefoniczny w poniedziałek.",
          status: "submitted",
          review_comment: null,
          decided_at: null,
          created_at: "2026-01-05T10:00:00Z",
          updated_at: "2026-01-05T10:00:00Z",
          user: { id: 4, first_name: "Kasia", last_name: "Wolna" },
        },
      ]),
    },
    seen: "Dyżur telefoniczny w poniedziałek.",
  },
  {
    url: "/admin/superwizje",
    element: () => <SupervisionPage />,
    routes: { "/admin/supervision/slots": dwaTerminyPrawdziwyKsztalt("present") },
    seen: "Bartek Drugi",
  },
  {
    url: "/admin/sprawy",
    element: () => <CasesPage />,
    routes: {
      "/admin/supervision/cases": {
        data: [
          {
            id: 7,
            subject: "Nieobecność na dyżurze",
            body: "Osoba nie pojawiła się na dwóch dyżurach.",
            created_at: "2026-09-01T10:00:00Z",
            reporter: { id: 5, first_name: "Joanna", last_name: "Demo" },
            volunteer: null,
          },
        ],
      },
    },
    seen: "Nieobecność na dyżurze",
  },
];

function routeTransport(role: string, routes: Record<string, unknown>) {
  const respond = (url: string) => {
    const path = url.split("?")[0];
    if (path === "/me") return Promise.resolve({ role });
    if (path === "/notifications") return Promise.resolve(page([]));
    if (path in routes) return Promise.resolve(routes[path]);
    // Side panels outside the screen under test fail loudly but locally.
    return Promise.reject(
      new ApiError({ status: 500, code: "test_unrouted", message: `unrouted: ${path}` }),
    );
  };
  api.mockImplementation(respond);
  apiPaged.mockImplementation(respond);
}

async function renderScreen(screenCase: ScreenCase) {
  const element = await screenCase.element();
  await act(async () => {
    render(<AdminLayout>{element}</AdminLayout>);
  });
}

function requestedPaths(): string[] {
  return [...api.mock.calls, ...apiPaged.mock.calls].map(([url]) => String(url).split("?")[0]);
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe.each(SCREENS)("$url under the admin role guard", (screenCase) => {
  it('role "instructor" gets "Brak dostępu" and the screen fetches nothing but /me', async () => {
    routeTransport("instructor", screenCase.routes);

    await renderScreen(screenCase);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Brak dostępu" })).toBeInTheDocument(),
    );
    expect(screen.queryAllByText(screenCase.seen, { exact: false })).toHaveLength(0);
    expect(requestedPaths()).toEqual(["/me"]);
  });

  it('role "project_manager" gets the screen with data from its endpoint', async () => {
    routeTransport("project_manager", screenCase.routes);

    await renderScreen(screenCase);

    await waitFor(() =>
      expect(screen.getAllByText(screenCase.seen, { exact: false }).length).toBeGreaterThan(0),
    );
    expect(requestedPaths()).toEqual(expect.arrayContaining(Object.keys(screenCase.routes)));
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
