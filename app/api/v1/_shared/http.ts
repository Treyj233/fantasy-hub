export const API_VERSION = "2026-08-10";

type JsonOptions = {
  status?: number;
  cacheControl?: string;
  requestId?: string;
};

export function apiJson(payload: unknown, options: JsonOptions = {}) {
  const requestId = options.requestId ?? crypto.randomUUID();
  return Response.json(payload, {
    status: options.status ?? 200,
    headers: {
      "Cache-Control": options.cacheControl ?? "private, no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Fantasy-Hub-API-Version": API_VERSION,
      "X-Request-Id": requestId,
    },
  });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  requestId?: string,
) {
  return apiJson({ error: { code, message }, requestId }, { status, requestId });
}

