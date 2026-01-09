import { VexiHttpError, VexiResponseError } from "../errors";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const relative = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relative, base).toString();
}

export async function postJson<TResponse>(
  fetcher: FetchLike,
  url: string,
  body: unknown,
  init?: { headers?: Record<string, string>; signal?: AbortSignal }
): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: init?.signal,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new VexiHttpError(`Network error while calling ${url}`, {
      url,
      status: 0,
      statusText: "NETWORK_ERROR",
      bodyText: err instanceof Error ? err.message : String(err),
    });
  }

  const bodyText = await response.text();

  if (!response.ok) {
    throw new VexiHttpError(
      `Request failed (${response.status} ${response.statusText}) for ${url}`,
      {
        url,
        status: response.status,
        statusText: response.statusText,
        bodyText: bodyText || undefined,
      }
    );
  }

  if (!bodyText) {
    // Some endpoints may legitimately return an empty body.
    return undefined as TResponse;
  }

  try {
    return JSON.parse(bodyText) as TResponse;
  } catch {
    throw new VexiResponseError(`Invalid JSON response from ${url}`, {
      url,
      bodyText,
    });
  }
}
