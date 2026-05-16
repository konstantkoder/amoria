import * as FileSystem from "expo-file-system/legacy";

export class PresignedPutUploadError extends Error {
  code = "media.uploadPutFailed";
  status?: number;
  uploadUrlHost?: string;

  constructor(input: { status?: number; uploadUrl: string }) {
    const statusMessage = input.status ? `:${input.status}` : "";
    super(`media.uploadPutFailed${statusMessage}`);
    this.name = "PresignedPutUploadError";
    this.status = input.status;
    this.uploadUrlHost = getUrlHost(input.uploadUrl);
  }
}

export async function uploadFileToPresignedPut(
  uploadUrl: string,
  fileUri: string,
  headers: Record<string, string> = {}
): Promise<void> {
  const response = await FileSystem.uploadAsync(uploadUrl, fileUri, {
    httpMethod: "PUT",
    headers,
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new PresignedPutUploadError({
      status: response.status,
      uploadUrl,
    });
  }
}

function getUrlHost(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.host;
  } catch {
    return undefined;
  }
}
