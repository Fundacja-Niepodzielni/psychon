import { ApiError, api } from "@/lib/api/klient";
import { pobierzJa } from "@/lib/api/h01-wspolpraca";

/**
 * Warstwa danych ekranu „Lekcja: treść, nagranie, materiały”. Trasy wyłącznie
 * z `backend/routes/api/h08.php` i `video.php`:
 *  - odczyt lekcji: `GET /admin/courses/{course}/lessons` (`h08.php:43`) — lista
 *    lekcji kursu; trasy „jedna lekcja po identyfikatorze” dla administracji
 *    nie ma, więc lekcję wybiera się z listy kursu;
 *  - zapis: `PATCH /admin/lessons/{lesson}` (`h08.php:45`);
 *  - materiał: `POST /admin/lessons/{lesson}/materials` (`h08.php:66`);
 *  - nagranie: `POST /admin/lessons/{lesson}/video-uploads` (`video.php:23`,
 *    wyłącznie `super_admin`) i `GET /admin/lessons/{lesson}/video-status`
 *    (`video.php:27`, `project_manager` i `super_admin`);
 *  - rola osoby: `GET /me` (`h01.php:27`).
 *
 * Kształt lekcji to `AdminLessonResource::toArray`
 * (`backend/app/Http/Resources/H08/AdminLessonResource.php:24-36`), materiału
 * — `AdminMaterialResource::toArray` (`…/AdminMaterialResource.php:22-28`).
 */

/** `AdminLessonResource` (w. 24-36). */
export interface LekcjaAdmin {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  content: string | null;
  sequence_order: number | null;
  topic_id: number | null;
  topic_position: number | null;
  video_provider_id: string | null;
  duration_seconds: number;
  materials_count: number;
  created_at: string | null;
  updated_at: string | null;
}

/** `AdminMaterialResource` (w. 22-28). */
export interface MaterialAdmin {
  id: number;
  name: string;
  mime: string | null;
  size: number | null;
  lesson_id: number | null;
  course_id: number | null;
  created_at: string | null;
}

/**
 * Ciało `PATCH /admin/lessons/{lesson}` — wyłącznie pola, które ten ekran
 * zapisuje (`UpdateLessonRequest::rules`, `…/UpdateLessonRequest.php:32-39`).
 * `topic_id` i `topic_position` są tam `prohibited`, `sequence_order`
 * przy kursie z wieloma tematami też — ekran ich nie wysyła.
 */
export interface CialoLekcji {
  title: string;
  description: string | null;
  content: string;
  duration_seconds: number;
}

/** `BunnyVideoAdminController::status` (w. 116-146). */
export type StanNagrania =
  | { status: "no_video" }
  | {
      status: "processing" | "finished" | "error";
      duration_seconds: number;
      preview_embed_url: string | null;
    };

/** `BunnyVideoAdminController::createUpload` (w. 47-112, dane w. 106-112): pozwolenie TUS. */
export interface ZlecenieWgrania {
  video_id: string;
  upload_url: string;
  library_id: string;
  expiration_time: number;
  signature: string;
}

/** Rola z `GET /me` (`DaneJa.role`) — wyłącznie do decyzji o sekcji nagrania. */
export async function pobierzRole(): Promise<string> {
  const ja = await pobierzJa();
  return ja.role;
}

/** Wszystkie lekcje kursu (bez paginacji — `LessonIndex::response`). */
export function pobierzLekcjeKursu(idKursu: number): Promise<LekcjaAdmin[]> {
  return api<LekcjaAdmin[]>(`/admin/courses/${idKursu}/lessons`);
}

export function pobierzStanNagrania(idLekcji: number): Promise<StanNagrania> {
  return api<StanNagrania>(`/admin/lessons/${idLekcji}/video-status`);
}

/**
 * Ten plik jest jedynym miejscem nowego frontu z adresem lekcji administracji
 * (zapis, usunięcie, materiały, nagranie). Pełne
 * ciało wysyła formularz edycji lekcji; samo `title` — zmiana nazwy w drzewie
 * tematów (każde pole trasy jest opcjonalne).
 */
export function zapiszLekcje(
  idLekcji: number,
  cialo: CialoLekcji | Pick<CialoLekcji, "title">,
): Promise<LekcjaAdmin> {
  return api<LekcjaAdmin>(`/admin/lessons/${idLekcji}`, { method: "PATCH", body: cialo });
}

/**
 * Ciało `POST /admin/courses/{course}/lessons` — pola nowej lekcji z ekranu
 * kursu (`StoreLessonRequest::rules`). `topic_id` wskazuje temat, w którym
 * osoba wybrała „Dodaj lekcję”; pozycję w temacie nadaje serwer.
 */
export interface CialoNowejLekcji {
  title: string;
  description: string | null;
  duration_seconds: number;
  topic_id: number;
}

export function dodajLekcje(idKursu: number, cialo: CialoNowejLekcji): Promise<LekcjaAdmin> {
  return api<LekcjaAdmin>(`/admin/courses/${idKursu}/lessons`, { method: "POST", body: cialo });
}

/** `DELETE /admin/lessons/{lesson}` → 200 `{ id, deleted: true }`. */
export function usunLekcje(idLekcji: number): Promise<{ id: number; deleted: boolean }> {
  return api<{ id: number; deleted: boolean }>(`/admin/lessons/${idLekcji}`, { method: "DELETE" });
}

function cialoPliku(plik: File): FormData {
  const cialo = new FormData();
  cialo.append("file", plik);
  return cialo;
}

/** Multipart z polem `file` (`StoreMaterialRequest::rules`, w. 31). */
export function wgrajMaterial(idLekcji: number, plik: File): Promise<MaterialAdmin> {
  return api<MaterialAdmin>(`/admin/lessons/${idLekcji}/materials`, { method: "POST", body: cialoPliku(plik) });
}

/** Materiał całego kursu, bez lekcji — to samo ciało co materiał lekcji. */
export function wgrajMaterialKursu(idKursu: number, plik: File): Promise<MaterialAdmin> {
  return api<MaterialAdmin>(`/admin/courses/${idKursu}/materials`, { method: "POST", body: cialoPliku(plik) });
}

/** `DELETE /admin/materials/{material}` → 200 `{ id, deleted: true }`. */
export function usunMaterial(idMaterialu: number): Promise<{ id: number; deleted: boolean }> {
  return api<{ id: number; deleted: boolean }>(`/admin/materials/${idMaterialu}`, { method: "DELETE" });
}

/** Ciało dokładnie `{ title }` — trasa odrzuca każde inne pole (w. 64-70). */
export function zlecWgranieNagrania(idLekcji: number, title: string): Promise<ZlecenieWgrania> {
  return api<ZlecenieWgrania>(`/admin/lessons/${idLekcji}/video-uploads`, {
    method: "POST",
    body: { title },
  });
}

/** Odmowa z powodu uprawnień: 401 albo 403 z API. */
export function czyBrakUprawnien(blad: unknown): boolean {
  return blad instanceof ApiError && (blad.status === 401 || blad.status === 403);
}

export function czyNieZnaleziono(blad: unknown): boolean {
  return blad instanceof ApiError && blad.status === 404;
}
