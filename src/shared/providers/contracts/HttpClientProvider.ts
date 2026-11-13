interface HttpClientOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface HttpClientProvider {
  request<T = unknown>(options: HttpClientOptions): Promise<T | null>;
}
