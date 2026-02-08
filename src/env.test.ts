import { describe, test, expect } from "vitest";
import { getEnvVar } from "./env";

describe("env", () => {
  describe("getEnvVar", () => {
    test("NODE_ENV установлен в test окружении", () => {
      const result = getEnvVar("NODE_ENV");
      expect(result).toBe("test");
    });

    test("возвращает строку или undefined для всех ключей", () => {
      const keys: Array<keyof import("./env").ExpectedEnv> = [
        "INNGEST_DEV",
        "NODE_ENV",
        "INNGEST_BASE_URL",
        "INNGEST_API_BASE_URL",
        "INNGEST_SIGNING_KEY",
        "INNGEST_SIGNING_KEY_FALLBACK",
      ];

      keys.forEach((key) => {
        const result = getEnvVar(key);
        // Результат должен быть либо строкой, либо undefined
        expect(result === undefined || typeof result === "string").toBe(true);
      });
    });

    test("возвращает согласованные значения при повторных вызовах", () => {
      const key = "NODE_ENV";
      const firstCall = getEnvVar(key);
      const secondCall = getEnvVar(key);

      // Значение должно быть стабильным
      expect(firstCall).toBe(secondCall);
    });

    test("getEnvVar возвращает значение для существующих переменных", () => {
      // NODE_ENV всегда установлен в тестовом окружении
      const nodeEnv = getEnvVar("NODE_ENV");
      expect(nodeEnv).toBeDefined();
      expect(typeof nodeEnv).toBe("string");
    });
  });
});
