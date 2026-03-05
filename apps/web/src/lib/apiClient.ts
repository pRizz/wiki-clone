import { startHttpSpan } from "./observability";

const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.toString() ?? "http://localhost:4000/api";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
};

export class ApiClient {
  private token: string | null;

  constructor(token: string | null) {
    this.token = token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const requestName = `${method} ${path}`;

    return startHttpSpan(requestName, async () => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        const maybeJson = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(maybeJson.error ?? `Request failed with ${response.status}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    });
  }
}
