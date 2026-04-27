export function getFirestoreErrorCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unknown";
}

export function getFirestoreErrorMessage(error: unknown) {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "Unknown Firestore error";
}

export function isFirestoreMissingIndexError(error: unknown) {
  return (
    getFirestoreErrorCode(error) === "failed-precondition" &&
    getFirestoreErrorMessage(error).toLowerCase().includes("index")
  );
}

export function logFirestoreMissingIndexError(scope: string, error: unknown) {
  if (!isFirestoreMissingIndexError(error)) return;

  if (__DEV__) {
    console.error(`[Firestore missing index] ${scope}`, {
      code: getFirestoreErrorCode(error),
      message: getFirestoreErrorMessage(error),
    });
  }
}
