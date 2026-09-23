/**
 * H14 — dokumenty generowane z profilu.
 */

import { api, apiPaged } from "./klient";

export type DocumentType = "volunteer_agreement" | "internship_certificate";

export interface DocumentDto {
  id: number;
  type: DocumentType;
  number: string;
  generated_at: string;
  signature_status: "none" | "signed_offline" | "e_signed";
  download_url: string;
}

export interface DocumentTypeAvailability {
  available: boolean;
  reason?: "profile_incomplete" | "conditions_not_met" | "already_generated" | null;
  missing_fields?: string[];
  hours_accepted?: string;
  hours_required?: string;
  document_id?: number;
}

export type DocumentAvailableTypes = Record<DocumentType, DocumentTypeAvailability>;

export async function fetchDocuments(): Promise<{
  documents: DocumentDto[];
  availableTypes: DocumentAvailableTypes | null;
}> {
  const { data, meta } = await apiPaged<DocumentDto>("/documents");
  const availableTypes =
    (meta?.extra?.available_types as DocumentAvailableTypes | undefined) ?? null;

  return { documents: data, availableTypes };
}

export function generateDocument(type: DocumentType): Promise<DocumentDto> {
  return api<DocumentDto>("/documents/generate", {
    method: "POST",
    body: { type },
  });
}
