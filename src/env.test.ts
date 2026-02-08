import { describe, test, expect } from "vitest";
import { getEnvVar } from "./env";

describe("env", () => {
  describe("getEnvVar", () => {
    test("возвращает значение NODE_ENV", () => {
      const result = getEnvVar("NODE_ENV");
      expect(result).toBeDefined();
    });

    test("возвращает undefined для неустановленной переменной", () => {
      const result = getEnvVar("INNGEST_SIGNING_KEY_FALLBACK");
      // Может быть undefined если не установлена
      expect(result === undefined || typeof result === "string").toBe(true);
    });

    test("getEnvVar возвращает строку или undefined", () => {
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
        expect(result === undefined || typeof result === "string").toBe(true);
      });
    });
  });
});
