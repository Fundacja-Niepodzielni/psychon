import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

/**
 * Admin screens (second half) mounted inside the admin layout
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
const { default: AuditLogPage } = await import("@/app/(administracja)/admin/dziennik/page");
const { default: ReportPage } = await import("@/app/(administracja)/admin/raport/page");
const { default: LearningTimePage } = await import("@/app/(administracja)/admin/czas-nauki/page");
const { default: OnboardingPage } = await import(
  "@/app/(administracja)/admin/ekran-startowy/page"
);
const { default: EmailsPage } = await import("@/app/(administracja)/admin/emails/page");
const { default: ProfileQueuePage } = await import("@/app/(administracja)/admin/profile/page");
const { default: ProfileDetailPage } = await import(
  "@/app/(administracja)/admin/profile/[id]/page"
);
const { default: SettingsPage } = await import("@/app/(administracja)/admin/ustawienia/page");
const { default: AdminHomePage } = await import("@/app/(administracja)/admin/page");
const { default: DocumentTemplatesPage } = await import(
  "@/app/(administracja)/admin/wzory-dokumentow/page"
);

const page = <T,>(data: T[]) => ({
  data,
  meta: { current_page: 1, per_page: 25, total: data.length, last_page: 1 },
});
const params = (id: string) => Promise.resolve({ id });

const profileApplication = {
  id: 3,
  user: { id: 9, first_name: "Anna", last_name: "Kowalska" },
  specializations: ["dzieci"],
  approach: "poznawczo-behawioralny",
  city: "Warszawa",
  bio: "Bio wniosku.",
  publication_consent_granted: true,
  status: "submitted",
  return_reason: null,
  decided_at: null,
  documents: [],
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

interface ScreenCase {
  url: string;
  /** Builds the page element. */
  element: () => ReactElement;
  /** Responses keyed by request path (query string ignored). */
  routes: Record<string, unknown>;
  /** Text that only the loaded screen shows (comes from `routes`). */
  seen: string;
  /** Where `seen` appears: rendered text (default) or a form field value. */
  seenIn?: "text" | "value";
}

const SCREENS: ScreenCase[] = [
  {
    url: "/admin/dziennik",
    element: () => <AuditLogPage />,
    routes: {
      "/admin/audit": page([
        {
          id: 7,
          action: "internship.accepted",
          actor: { id: 1, first_name: "Ola", last_name: "Nowak" },
          subject_type: "internship_entry",
          subject_id: 12,
          details: null,
          created_at: "2026-01-05T10:00:00Z",
        },
      ]),
    },
    seen: "Ola Nowak",
  },
  {
    url: "/admin/raport",
    element: () => <ReportPage />,
    routes: {
      "/admin/report": {
        summary: {
          admitted: 5,
          active: 3,
          completed: 1,
          hours_accepted_total: "113.5",
          hours_accepted_average: "37.8",
          consultations_total: 101,
          certificates_issued: 1,
        },
        people: [],
      },
    },
    seen: "113.5",
  },
  {
    url: "/admin/czas-nauki",
    element: () => <LearningTimePage />,
    routes: {
      "/admin/reliability": page([
        {
          id: 17,
          first_name: "Filip",
          last_name: "Demo",
          email: "filip@demo.test",
          reliability_percent: "15",
          below_threshold: true,
        },
      ]),
    },
    seen: "filip@demo.test",
  },
  {
    url: "/admin/ekran-startowy",
    element: () => <OnboardingPage />,
    routes: {
      "/onboarding": {
        video: { title: "Wideo powitalne", url: null, caption: null },
        program: { title: "Program", body: "Treść programu." },
        expectations: { title: "Czego oczekujemy", body: "Treść oczekiwań." },
        updated_at: null,
      },
    },
    seen: "Wideo powitalne",
  },
  {
    url: "/admin/emails",
    element: () => <EmailsPage />,
    routes: {
      "/admin/emails": page([
        {
          id: 1,
          to_email: "marta@example.test",
          subject: "Powitanie",
          status: "simulated",
          body_html: "<p>Cześć</p>",
          sent_at: "2026-09-01T10:00:00Z",
          created_at: "2026-09-01T10:00:00Z",
        },
      ]),
    },
    seen: "marta@example.test",
  },
  {
    url: "/admin/profile",
    element: () => <ProfileQueuePage />,
    routes: { "/admin/profiles": page([profileApplication]) },
    seen: "Anna Kowalska",
  },
  {
    url: "/admin/profile/[id]",
    element: () => <ProfileDetailPage params={params("3")} />,
    routes: { "/admin/profiles/3": profileApplication },
    seen: "Bio wniosku.",
  },
  {
    url: "/admin/ustawienia",
    element: () => <SettingsPage />,
    routes: {
      "/admin/edition": {
        id: 1,
        name: "Edycja 2026",
        starts_at: "2026-01-01",
        ends_at: "2026-12-31",
        seats_limit: 30,
        test_pass_threshold: 70,
        test_attempts_limit: 3,
        internship_hours_required: 40,
        supervision_required_count: 5,
        reliability_threshold: 80,
        lesson_completion_percent: 90,
      },
    },
    seen: "Edycja 2026",
    seenIn: "value",
  },
  {
    url: "/admin",
    element: () => <AdminHomePage />,
    routes: {
      "/admin/dashboard": {
        counters: { participants: 12, completed: 4, certificates: 3 },
        queues: [{ key: "applications", count: 5, link: "/admin/uczestniczki" }],
      },
    },
    seen: "Zgłoszenia rekrutacyjne",
  },
  {
    url: "/admin/wzory-dokumentow",
    element: () => <DocumentTemplatesPage />,
    routes: {
      "/document-templates/agreement": {
        type: "agreement",
        content: "Treść porozumienia wolontariackiego.",
        version: 1,
        updated_at: "2026-09-01T10:00:00Z",
        updated_by: { id: 1, name: "Anna Kowalska" },
      },
      "/document-templates/agreement/versions": [
        {
          version: 1,
          updated_at: "2026-09-01T10:00:00Z",
          updated_by: { id: 1, name: "Anna Kowalska" },
        },
      ],
    },
    seen: "Treść porozumienia wolontariackiego.",
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
  await act(async () => {
    render(<AdminLayout>{screenCase.element()}</AdminLayout>);
  });
}

function seenElements(screenCase: ScreenCase): HTMLElement[] {
  return screenCase.seenIn === "value"
    ? screen.queryAllByDisplayValue(screenCase.seen)
    : screen.queryAllByText(screenCase.seen, { exact: false });
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
    expect(seenElements(screenCase)).toHaveLength(0);
    expect(requestedPaths()).toEqual(["/me"]);
  });

  it('role "project_manager" gets the screen with data from its endpoint', async () => {
    routeTransport("project_manager", screenCase.routes);

    await renderScreen(screenCase);

    await waitFor(() =>
      expect(seenElements(screenCase).length).toBeGreaterThan(0),
    );
    expect(requestedPaths()).toEqual(expect.arrayContaining(Object.keys(screenCase.routes)));
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
