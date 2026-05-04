import { request } from "@/services/api/apiClient";
import type {
  CompleteUploadRequest,
  CompleteUploadResponse,
  PrepareUploadRequest,
  PrepareUploadResponse,
} from "@/services/api/types";

export function prepareUpload(
  input: PrepareUploadRequest
): Promise<PrepareUploadResponse> {
  return request<PrepareUploadResponse>(
    "POST",
    "/media/uploads/prepare",
    input
  );
}

export function completeUpload(
  uploadId: string,
  input: CompleteUploadRequest
): Promise<CompleteUploadResponse> {
  return request<CompleteUploadResponse>(
    "POST",
    `/media/uploads/${encodeURIComponent(uploadId)}/complete`,
    input
  );
}

export async function deleteMedia(mediaId: string): Promise<{ ok: boolean }> {
  const response = await request<{ ok?: boolean } | undefined>(
    "DELETE",
    `/media/${encodeURIComponent(mediaId)}`
  );

  return { ok: response?.ok ?? true };
}
