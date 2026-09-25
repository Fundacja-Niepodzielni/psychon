/**
 * Barrel klienta API — re-eksportuje wszystko z `./lib/api/*` pod
 * niezmienionymi nazwami, żeby żaden import gdzie indziej w froncie się nie
 * zmienił. Implementacja rozbita per moduł: `lib/api/klient.ts` (fetch
 * wrapper, nagłówek autoryzacji, typ błędu) + `lib/api/logowanie.ts`
 * (whoami, powiązanie konta, rozstrzygnięcie 401) + `lib/api/<h-numer>.ts`
 * per domena (H10, H12, H14, H18, H20).
 */

// H10 — reset limitu podejść do testu
export { type TestAttemptsReset, resetTestAttempts } from "./api/h10";

// H12 — administracja terminami superwizji + sprawy zgłaszane administracji przez prowadzącego
export {
  type AdminSupervisionSignup,
  type AdminSupervisionSlot,
  fetchAdminSupervisionSlots,
  type SupervisionCasePerson,
  type SupervisionCase,
  type CreateInstructorCasePayload,
  createInstructorCase,
  fetchAdminSupervisionCases,
} from "./api/h12";

// H14 — dokumenty generowane z profilu
export {
  type DocumentType,
  type DocumentDto,
  type DocumentTypeAvailability,
  type DocumentAvailableTypes,
  fetchDocuments,
  generateDocument,
} from "./api/h14";

// H18 — panel osób i karta osoby
export {
  type UserRole,
  type UserStatus,
  type AdminUserListItem,
  type AdminUserProfile,
  type AdminUserCard,
  type AdminUserFilters,
  fetchAdminUsers,
  type SupervisorAssignment,
  assignSupervisor,
  fetchAdminUser,
  createAdminUser,
  updateAdminUser,
  blockAdminUser,
  downloadAdminUsersCsv,
} from "./api/h18";

// H20 — raporty i dziennik działań
export {
  type ReportSummaryData,
  type ReportPersonRow,
  type ReportData,
  type ReportFilters,
  fetchReport,
  downloadReportCsv,
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditActor,
  type AuditLogEntryDto,
  type AuditFilters,
  fetchAuditLog,
  downloadAuditLogCsv,
} from "./api/h20";

// klient — fetch wrapper, nagłówek autoryzacji, typ błędu (współdzielone przez wszystkie moduły)
export {
  type PaginationMeta,
  type ApiErrorBody,
  ApiError,
  getToken,
  endSession,
  type ApiOptions,
  api,
  apiPaged,
} from "./api/klient";

// logowanie — whoami, powiązanie konta z Kontami Niepodzielni, rozstrzygnięcie 401
export {
  type WhoAmI,
  fetchWhoAmI,
  type AccountBindingCheck,
  KONTO_BINDING_AWARIA,
  KONTO_BINDING_LIMIT_MS,
  checkAccountBinding,
} from "./api/logowanie";

// pliki — pobieranie plików chronionych autoryzacją (CSV, dokumenty)
export { downloadFile } from "./api/pliki";

// pomoc — zgloszenie do pomocy z dowolnego ekranu zalogowanej strefy
export { type HelpMessagePayload, type HelpMessage, sendHelpMessage } from "./api/help";
