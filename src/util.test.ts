import { describe, test, expect, vi } from "vitest";
import {
  createDeferredPromise,
  fetchWithAuthFallback,
  parseAsBoolean,
} from "./util";

describe("util", () => {
  describe("createDeferredPromise", () => {
    test("создает промис с внешними resolve и reject", async () => {
      const deferred = createDeferredPromise<string>();

      expect(deferred.promise).toBeInstanceOf(Promise);
      expect(typeof deferred.resolve).toBe("function");
      expect(typeof deferred.reject).toBe("function");

      deferred.resolve("test");
      await expect(deferred.promise).resolves.toBe("test");
    });

    test("resolve возвращает новый deferred промис", () => {
      const deferred = createDeferredPromise<number>();
      const newDeferred = deferred.resolve(42);

      expect(newDeferred).not.toBe(deferred);
      expect(newDeferred.promise).toBeInstanceOf(Promise);
    });

    test("reject возвращает новый deferred промис", async () => {
      const deferred = createDeferredPromise<number>();

      // Подавляем ошибку из первого промиса
      deferred.promise.catch(() => {});

      const newDeferred = deferred.reject(new Error("test"));

      expect(newDeferred).not.toBe(deferred);
      expect(newDeferred.promise).toBeInstanceOf(Promise);
    });

    test("reject отклоняет промис с ошибкой", async () => {
      const deferred = createDeferredPromise<string>();
      const error = new Error("test error");

      deferred.reject(error);
      await expect(deferred.promise).rejects.toThrow("test error");
    });
  });

  describe("fetchWithAuthFallback", () => {
    test("выполняет запрос с токеном авторизации", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await fetchWithAuthFallback({
        authToken: "test-token",
        authTokenFallback: undefined,
        fetch: mockFetch,
        url: "https://api.test.com",
        options: {},
      });

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });

    test("использует fallback токен при 401 ошибке", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      const result = await fetchWithAuthFallback({
        authToken: "test-token",
        authTokenFallback: "fallback-token",
        fetch: mockFetch,
        url: "https://api.test.com",
        options: {},
      });

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api.test.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer fallback-token",
          }),
        }),
      );
    });

    test("использует fallback токен при 403 ошибке", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

      await fetchWithAuthFallback({
        authToken: "test-token",
        authTokenFallback: "fallback-token",
        fetch: mockFetch,
        url: "https://api.test.com",
        options: {},
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("не использует fallback при других ошибках", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await fetchWithAuthFallback({
        authToken: "test-token",
        authTokenFallback: "fallback-token",
        fetch: mockFetch,
        url: "https://api.test.com",
        options: {},
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("работает без токена авторизации", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      await fetchWithAuthFallback({
        authToken: undefined,
        authTokenFallback: undefined,
        fetch: mockFetch,
        url: "https://api.test.com",
        options: {},
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com",
        expect.objectContaining({
          headers: {},
        }),
      );
    });

    test("сохраняет существующие заголовки", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      await fetchWithAuthFallback({
        authToken: "test-token",
        authTokenFallback: undefined,
        fetch: mockFetch,
        url: "https://api.test.com",
        options: {
          headers: {
            "Content-Type": "application/json",
          },
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });
  });

  describe("parseAsBoolean", () => {
    test("возвращает boolean значение как есть", () => {
      expect(parseAsBoolean(true)).toBe(true);
      expect(parseAsBoolean(false)).toBe(false);
    });

    test("преобразует число в boolean", () => {
      expect(parseAsBoolean(1)).toBe(true);
      expect(parseAsBoolean(0)).toBe(false);
      expect(parseAsBoolean(42)).toBe(true);
    });

    test("преобразует строку 'true' в true", () => {
      expect(parseAsBoolean("true")).toBe(true);
      expect(parseAsBoolean("TRUE")).toBe(true);
      expect(parseAsBoolean("  true  ")).toBe(true);
    });

    test("преобразует строку '1' в true", () => {
      expect(parseAsBoolean("1")).toBe(true);
      expect(parseAsBoolean("  1  ")).toBe(true);
    });

    test("преобразует другие строки в false", () => {
      expect(parseAsBoolean("false")).toBe(false);
      expect(parseAsBoolean("0")).toBe(false);
      expect(parseAsBoolean("no")).toBe(false);
      expect(parseAsBoolean("")).toBe(false);
    });

    test("возвращает undefined для строки 'undefined'", () => {
      expect(parseAsBoolean("undefined")).toBeUndefined();
      expect(parseAsBoolean("UNDEFINED")).toBeUndefined();
      expect(parseAsBoolean("  undefined  ")).toBeUndefined();
    });

    test("возвращает undefined для неизвестных типов", () => {
      expect(parseAsBoolean(null)).toBeUndefined();
      expect(parseAsBoolean(undefined)).toBeUndefined();
      expect(parseAsBoolean({})).toBeUndefined();
      expect(parseAsBoolean([])).toBeUndefined();
    });
  });
});
