import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribe, getSubscriptionToken } from "./helpers";
import { channel } from "../channel";
import { topic } from "../topic";

// Мокаем WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    }, 0);
  }

  send(data: string) {}

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code || 1000, reason: reason || "" });
  }
}

describe("subscribe helpers", () => {
  beforeEach(() => {
    global.WebSocket = MockWebSocket as any;
    vi.stubEnv("INNGEST_SIGNING_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("subscribe", () => {
    test("подписывается на канал со строками", async () => {
      const stream = await subscribe({
        channel: "test-channel",
        topics: ["topic1", "topic2"],
      });

      expect(stream).toBeDefined();
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    test("подписывается с callback функцией", async () => {
      const callback = vi.fn();

      const stream = await subscribe(
        {
          channel: "test-channel",
          topics: ["topic1"],
        },
        callback,
      );

      expect(stream).toBeDefined();
    });

    test("подписывается на runtime канал", async () => {
      const testChannel = channel("test-channel").addTopic(topic("topic1"))();

      const stream = await subscribe({
        channel: testChannel,
        topics: ["topic1"],
      });

      expect(stream).toBeDefined();
    });

    test("возвращает поток с дополнительными методами", async () => {
      const stream = await subscribe({
        channel: "test-channel",
        topics: ["topic1"],
      });

      expect(typeof stream.getJsonStream).toBe("function");
      expect(typeof stream.getEncodedStream).toBe("function");
    });

    test("использует apiBaseUrl из app", async () => {
      const stream = await subscribe({
        app: {
          apiBaseUrl: "https://custom.api.com",
        },
        channel: "test-channel",
        topics: ["topic1"],
      });

      expect(stream).toBeDefined();
    });

    test("использует signing key из app", async () => {
      const stream = await subscribe({
        app: {
          api: {
            signingKey: "custom-key",
          },
        },
        channel: "test-channel",
        topics: ["topic1"],
      });

      expect(stream).toBeDefined();
    });

    test("использует переменные окружения", async () => {
      vi.stubEnv("INNGEST_BASE_URL", "https://env.api.com");
      vi.stubEnv("INNGEST_SIGNING_KEY", "env-key");

      const stream = await subscribe({
        channel: "test-channel",
        topics: ["topic1"],
      });

      expect(stream).toBeDefined();
    });

    test("getJsonStream возвращает новый поток", async () => {
      const stream = await subscribe({
        channel: "test-channel",
        topics: ["topic1"],
      });

      const jsonStream = stream.getJsonStream();
      expect(jsonStream).toBeInstanceOf(ReadableStream);
    });

    test("getEncodedStream возвращает поток байтов", async () => {
      const stream = await subscribe({
        channel: "test-channel",
        topics: ["topic1"],
      });

      const encodedStream = stream.getEncodedStream();
      expect(encodedStream).toBeInstanceOf(ReadableStream);
    });
  });

  describe("getSubscriptionToken", () => {
    test("получает токен подписки", async () => {
      const mockGetToken = vi.fn().mockResolvedValue("test-token");

      const token = await getSubscriptionToken(
        {
          api: {
            getSubscriptionToken: mockGetToken,
          },
        },
        {
          channel: "test-channel",
          topics: ["topic1", "topic2"],
        },
      );

      expect(token).toBeDefined();
      expect(token.channel).toBe("test-channel");
      expect(token.topics).toEqual(["topic1", "topic2"]);
      expect(token.key).toBe("test-token");
      expect(mockGetToken).toHaveBeenCalledWith("test-channel", [
        "topic1",
        "topic2",
      ]);
    });

    test("работает с объектом канала", async () => {
      const mockGetToken = vi.fn().mockResolvedValue("test-token");
      const testChannel = channel("test-channel")();

      const token = await getSubscriptionToken(
        {
          api: {
            getSubscriptionToken: mockGetToken,
          },
        },
        {
          channel: testChannel,
          topics: ["topic1"],
        },
      );

      expect(token.channel).toBe("test-channel");
      expect(mockGetToken).toHaveBeenCalledWith("test-channel", ["topic1"]);
    });

    test("выбрасывает ошибку если нет channel ID", async () => {
      const mockGetToken = vi.fn().mockResolvedValue("test-token");

      await expect(
        getSubscriptionToken(
          {
            api: {
              getSubscriptionToken: mockGetToken,
            },
          },
          {
            channel: { name: "" } as any,
            topics: ["topic1"],
          },
        ),
      ).rejects.toThrow("Channel ID is required");
    });

    test("выбрасывает ошибку если не удалось получить токен", async () => {
      const mockGetToken = vi.fn().mockResolvedValue(undefined);

      await expect(
        getSubscriptionToken(
          {
            api: {
              getSubscriptionToken: mockGetToken,
            },
          },
          {
            channel: "test-channel",
            topics: ["topic1"],
          },
        ),
      ).rejects.toThrow("Failed to get subscription token");
    });

    test("выбрасывает ошибку если нет getSubscriptionToken", async () => {
      await expect(
        getSubscriptionToken(
          {
            api: {},
          },
          {
            channel: "test-channel",
            topics: ["topic1"],
          },
        ),
      ).rejects.toThrow("Failed to get subscription token");
    });

    test("работает с несколькими топиками", async () => {
      const mockGetToken = vi.fn().mockResolvedValue("test-token");

      const token = await getSubscriptionToken(
        {
          api: {
            getSubscriptionToken: mockGetToken,
          },
        },
        {
          channel: "test-channel",
          topics: ["topic1", "topic2", "topic3"],
        },
      );

      expect(token.topics).toEqual(["topic1", "topic2", "topic3"]);
    });
  });
});
