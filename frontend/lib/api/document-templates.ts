/**
 * Wzory dokumentów — treść wzorów generowanych dokumentów (porozumienie,
 * zaświadczenie, certyfikat) i ich historia wersji. Edycja z panelu
 * administracji: `/admin/wzory-dokumentow`. Pośrednicy backendu:
 * `auth:keycloak`, `access.active`, `role:project_manager,super_admin`.
 */

import { api } from "./klient";

/** Jeden z trzech typów wzoru dokumentu — zgodnie z kontraktem backendu. */
export type DocumentTemplateType = "agreement" | "attendance_certificate" | "certificate";

/** Osoba, która ostatnio zapisała wzór (albo daną wersję z historii). */
export interface DocumentTemplateAuthor {
  id: number;
  name: string;
}

export interface DocumentTemplate {
  type: DocumentTemplateType;
  content: string;
  version: number;
  updated_at: string;
  updated_by: DocumentTemplateAuthor;
}

/** Jeden wpis historii wersji — bez treści (sam odczyt, lista dat i osób). */
export interface DocumentTemplateVersion {
  version: number;
  updated_at: string;
  updated_by: DocumentTemplateAuthor;
}

export function fetchDocumentTemplate(type: DocumentTemplateType): Promise<DocumentTemplate> {
  return api<DocumentTemplate>(`/document-templates/${type}`);
}

/** `content` musi mieć co najmniej 1 znak — backend odmawia `422` z komunikatem przy polu `content`. */
export function updateDocumentTemplate(
  type: DocumentTemplateType,
  content: string,
): Promise<DocumentTemplate> {
  return api<DocumentTemplate>(`/document-templates/${type}`, {
    method: "PUT",
    body: { content },
  });
}

export function fetchDocumentTemplateVersions(
  type: DocumentTemplateType,
): Promise<DocumentTemplateVersion[]> {
  return api<DocumentTemplateVersion[]>(`/document-templates/${type}/versions`);
}
