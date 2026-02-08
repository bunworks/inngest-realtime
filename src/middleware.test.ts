import { describe, test, expect, vi } from "vitest";
import { realtimeMiddleware } from "./middleware";

describe("middleware", () => {
  describe("realtimeMiddleware", () => {
    test("создает middleware с правильным именем", () => {
      const middleware = realtimeMiddleware();

      expect(middleware.name).toBe("publish");
      expect(typeof middleware.init).toBe("function");
    });

    test("init возвращает onFunctionRun", () => {
      const middleware = realtimeMiddleware();
      const mockClient = {
        api: {
          publish: vi.fn(),
        },
      };

      const result = middleware.init({ client: mockClient });

      expect(typeof result.onFunctionRun).toBe("function");
    });

    test("onFunctionRun возвращает transformInput", () => {
      const middleware = realtimeMiddleware();
      const mockClient = {
        api: {
          publish: vi.fn(),
        },
      };

      const init = middleware.init({ client: mockClient });
      const result = init.onFunctionRun({ ctx: { runId: "test-run-id" } });

      expect(typeof result.transformInput).toBe("function");
    });

    test("transformInput добавляет publish в контекст", () => {
      const middleware = realtimeMiddleware();
      const mockClient = {
        api: {
          publish: vi.fn(),
        },
      };

      const init = middleware.init({ client: mockClient });
      const onFunctionRun = init.onFunctionRun({
        ctx: { runId: "test-run-id" },
      });
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };
      const result = onFunctionRun.transformInput({
        ctx: { step: mockStep },
      });

      expect(result.ctx.publish).toBeDefined();
      expect(typeof result.ctx.publish).toBe("function");
    });

    test("publish функция публикует сообщение", async () => {
      const middleware = realtimeMiddleware();
      const mockPublish = vi.fn().mockResolvedValue({ ok: true });
      const mockClient = {
        api: {
          publish: mockPublish,
        },
      };

      const init = middleware.init({ client: mockClient });
      const onFunctionRun = init.onFunctionRun({
        ctx: { runId: "test-run-id" },
      });
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };
      const result = onFunctionRun.transformInput({
        ctx: { step: mockStep },
      });

      const message = {
        channel: "test-channel",
        topic: "test-topic",
        data: { test: "data" },
      };

      await result.ctx.publish(message);

      expect(mockPublish).toHaveBeenCalledWith(
        {
          topics: ["test-topic"],
          channel: "test-channel",
          runId: "test-run-id",
        },
        { test: "data" },
      );
    });

    test("publish использует step.run", async () => {
      const middleware = realtimeMiddleware();
      const mockPublish = vi.fn().mockResolvedValue({ ok: true });
      const mockClient = {
        api: {
          publish: mockPublish,
        },
      };

      const init = middleware.init({ client: mockClient });
      const onFunctionRun = init.onFunctionRun({
        ctx: { runId: "test-run-id" },
      });
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };
      const result = onFunctionRun.transformInput({
        ctx: { step: mockStep },
      });

      const message = {
        channel: "test-channel",
        topic: "test-topic",
        data: { test: "data" },
      };

      await result.ctx.publish(message);

      expect(mockStep.run).toHaveBeenCalledWith(
        "publish:test-channel",
        expect.any(Function),
      );
    });

    test("publish возвращает данные после публикации", async () => {
      const middleware = realtimeMiddleware();
      const mockPublish = vi.fn().mockResolvedValue({ ok: true });
      const mockClient = {
        api: {
          publish: mockPublish,
        },
      };

      const init = middleware.init({ client: mockClient });
      const onFunctionRun = init.onFunctionRun({
        ctx: { runId: "test-run-id" },
      });
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };
      const result = onFunctionRun.transformInput({
        ctx: { step: mockStep },
      });

      const testData = { test: "data" };
      const message = {
        channel: "test-channel",
        topic: "test-topic",
        data: testData,
      };

      const returnedData = await result.ctx.publish(message);

      expect(returnedData).toEqual(testData);
    });

    test("publish выбрасывает ошибку при неудачной публикации", async () => {
      const middleware = realtimeMiddleware();
      const mockPublish = vi.fn().mockResolvedValue({
        ok: false,
        error: { error: "Test error" },
      });
      const mockClient = {
        api: {
          publish: mockPublish,
        },
      };

      const init = middleware.init({ client: mockClient });
      const onFunctionRun = init.onFunctionRun({
        ctx: { runId: "test-run-id" },
      });
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };
      const result = onFunctionRun.transformInput({
        ctx: { step: mockStep },
      });

      const message = {
        channel: "test-channel",
        topic: "test-topic",
        data: { test: "data" },
      };

      await expect(result.ctx.publish(message)).rejects.toThrow(
        "Failed to publish event: Test error",
      );
    });

    test("publish работает с промисом сообщения", async () => {
      const middleware = realtimeMiddleware();
      const mockPublish = vi.fn().mockResolvedValue({ ok: true });
      const mockClient = {
        api: {
          publish: mockPublish,
        },
      };

      const init = middleware.init({ client: mockClient });
      const onFunctionRun = init.onFunctionRun({
        ctx: { runId: "test-run-id" },
      });
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };
      const result = onFunctionRun.transformInput({
        ctx: { step: mockStep },
      });

      const messagePromise = Promise.resolve({
        channel: "test-channel",
        topic: "test-topic",
        data: { test: "data" },
      });

      await result.ctx.publish(messagePromise);

      expect(mockPublish).toHaveBeenCalled();
    });

    test("publish с разными каналами", async () => {
      const middleware = realtimeMiddleware();
      const mockPublish = vi.fn().mockResolvedValue({ ok: true });
      const mockClient = {
        api: {
          publish: mockPublish,
        },
      };

      const init = middleware.init({ client: mockClient });
      const onFunctionRun = init.onFunctionRun({
        ctx: { runId: "test-run-id" },
      });
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };
      const result = onFunctionRun.transformInput({
        ctx: { step: mockStep },
      });

      await result.ctx.publish({
        channel: "channel1",
        topic: "topic1",
        data: "data1",
      });

      await result.ctx.publish({
        channel: "channel2",
        topic: "topic2",
        data: "data2",
      });

      expect(mockStep.run).toHaveBeenCalledWith(
        "publish:channel1",
        expect.any(Function),
      );
      expect(mockStep.run).toHaveBeenCalledWith(
        "publish:channel2",
        expect.any(Function),
      );
    });
  });
});
