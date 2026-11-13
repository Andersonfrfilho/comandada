class N8nHttpClientProviderImplementation implements HttpClientProvider {
  async request<T = unknown>(options: HttpClientOptions): Promise<T | null> {
    try {
      const raw = await _httpRequest({
        method: options.method,
        url: options.url,
        headers: options.headers || {},
        ...(options.body !== undefined ? { body: options.body } : {}),
      });
      return typeof raw === 'string' ? JSON.parse(raw) as T : raw as T;
    } catch(error) { return null; }
  }
}
