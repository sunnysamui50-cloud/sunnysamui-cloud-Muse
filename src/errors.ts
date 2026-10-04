export class AppApiError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code = "APP_API_ERROR"
  ) {
    super(message);
    this.name = "AppApiError";
  }
}

export function toToolError(error: unknown) {
  const body = error instanceof AppApiError
    ? { error: error.code, message: error.message }
    : {
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unexpected error"
      };

  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(body) }]
  };
}
