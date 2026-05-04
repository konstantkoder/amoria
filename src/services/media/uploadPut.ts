import * as FileSystem from "expo-file-system/legacy";

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
    throw new Error(`media.uploadPutFailed:${response.status}`);
  }
}
