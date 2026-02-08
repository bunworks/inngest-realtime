import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./api";

describe("api", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("INNGEST_DEV", undefined);
    vi.stubEnv("NODE_ENV", undefined);
    vi.stubEnv("INNGEST_BASE_URL", undefined);
    vi.stubEnv("INNGEST_API_BASE_URL", undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  describe("getSubscriptionToken", () => {
    test("успешно получает токен подписки", async () => {
      const mockJwt = "test-jwt-token";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jwt: mockJwt }),
      });

      const result = await api.getSubscriptionToken({
        channel: "test-channel",
        topics: ["topic1", "topic2"],
        signingKey: "test-key",
        signingKeyFallback: undefined,
        apiBaseUrl: "https://api.test.com",
      });

      expect(result).toBe(mockJwt);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-key",
          }),
        }),
      );
    });

    test("использует fallback ключ при 401 ошибке", async () => {
      const mockJwt = "test-jwt-token";
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jwt: mockJwt }),
        });

      const result = await api.getSubscriptionToken({
        channel: "test-channel",
        topics: ["topic1"],
        signingKey: "test-key",
        signingKeyFallback: "fallback-key",
        apiBaseUrl: "https://api.test.com",
      });

      expect(result).toBe(mockJwt);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test("выбрасывает ошибку при неудачном запросе", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Error details",
      });

      await expect(
        api.getSubscriptionToken({
          channel: "test-channel",
          topics: ["topic1"],
          signingKey: "test-key",
          signingKeyFallback: undefined,
          apiBaseUrl: "https://api.test.com",
        }),
      ).rejects.toThrow("Failed to get subscription token");
    });

    test("использует apiBaseUrl если указан", async () => {
      const mockJwt = "test-jwt";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jwt: mockJwt }),
      });

      await api.getSubscriptionToken({
        channel: "test",
        topics: ["topic1"],
        signingKey: "key",
        signingKeyFallback: undefined,
        apiBaseUrl: "https://custom.api.com",
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[0].toString()).toContain("custom.api.com");
    });

    test("использует localhost в dev режиме", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const mockJwt = "test-jwt";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jwt: mockJwt }),
      });

      await api.getSubscriptionToken({
        channel: "test",
        topics: ["topic1"],
        signingKey: "key",
        signingKeyFallback: undefined,
        apiBaseUrl: undefined,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          href: expect.stringContaining("localhost:8288"),
        }),
        expect.any(Object),
      );
    });

    test("использует INNGEST_DEV переменную окружения", async () => {
      vi.stubEnv("INNGEST_DEV", "true");
      const mockJwt = "test-jwt";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ jwt: mockJwt }),
      });

      await api.getSubscriptionToken({
        channel: "test",
        topics: ["topic1"],
        signingKey: "key",
        signingKeyFallback: undefined,
        apiBaseUrl: undefined,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          href: expect.stringContaining("localhost:8288"),
        }),
        expect.any(Object),
      );
    });
  });
});
