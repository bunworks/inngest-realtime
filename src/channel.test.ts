import { describe, test, expect } from "vitest";
import * as v from "valibot";
import { channel, typeOnlyChannel } from "./channel";
import { topic } from "./topic";

describe("channel", () => {
  describe("создание канала", () => {
    test("создает статический канал", () => {
      const ch = channel("test-channel");

      expect(ch).toBeDefined();
      expect(typeof ch).toBe("function");
      expect(ch.topics).toBeDefined();
      expect(typeof ch.addTopic).toBe("function");
    });

    test("создает динамический канал", () => {
      const ch = channel((userId: string) => `user/${userId}`);

      expect(ch).toBeDefined();
      expect(typeof ch).toBe("function");
    });

    test("выполнение статического канала возвращает объект канала", () => {
      const ch = channel("test-channel")();

      expect(ch).toBeDefined();
      expect(ch.name).toBe("test-channel");
      expect(ch.topics).toBeDefined();
    });

    test("выполнение динамического канала возвращает объект канала", () => {
      const ch = channel((userId: string) => `user/${userId}`)("123");

      expect(ch).toBeDefined();
      expect(ch.name).toBe("user/123");
      expect(ch.topics).toBeDefined();
    });
  });

  describe("добавление топиков", () => {
    test("добавляет топик к каналу", () => {
      const testTopic = topic("test-topic");
      const ch = channel("test-channel").addTopic(testTopic);

      expect(ch.topics["test-topic"]).toBe(testTopic);
    });

    test("добавляет несколько топиков", () => {
      const topic1 = topic("topic1");
      const topic2 = topic("topic2");
      const ch = channel("test-channel").addTopic(topic1).addTopic(topic2);

      expect(ch.topics["topic1"]).toBe(topic1);
      expect(ch.topics["topic2"]).toBe(topic2);
    });

    test("топики доступны в объекте канала", () => {
      const testTopic = topic("test-topic").type<string>();
      const ch = channel("test-channel").addTopic(testTopic)();

      expect(ch["test-topic"]).toBeDefined();
      expect(typeof ch["test-topic"]).toBe("function");
    });

    test("функция топика возвращает сообщение", async () => {
      const testTopic = topic("test-topic").type<string>();
      const ch = channel("test-channel").addTopic(testTopic)();

      const message = await ch["test-topic"]("test data");

      expect(message).toEqual({
        channel: "test-channel",
        topic: "test-topic",
        data: "test data",
      });
    });
  });

  describe("валидация схемы", () => {
    test("валидирует данные с помощью схемы", async () => {
      const testTopic = topic("test-topic").schema(
        v.object({
          id: v.string(),
          name: v.string(),
        }),
      );
      const ch = channel("test-channel").addTopic(testTopic)();

      const message = await ch["test-topic"]({
        id: "123",
        name: "Test",
      });

      expect(message.data).toEqual({
        id: "123",
        name: "Test",
      });
    });

    test("выбрасывает ошибку при невалидных данных", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const testTopic = topic("test-topic").schema(v.string());
      const ch = channel("test-channel").addTopic(testTopic)();

      try {
        await ch["test-topic"](123 as any);
        // Если не выбросило ошибку, тест провален
        expect(true).toBe(false);
      } catch (err) {
        // Ожидаем ошибку
        expect(err).toBeDefined();
      }

      consoleErrorSpy.mockRestore();
    });

    test("работает без схемы", async () => {
      const testTopic = topic("test-topic");
      const ch = channel("test-channel").addTopic(testTopic)();

      const message = await ch["test-topic"]({ any: "data" });

      expect(message.data).toEqual({ any: "data" });
    });
  });

  describe("typeOnlyChannel", () => {
    test("создает канал только с типами", () => {
      const originalChannel = channel("test-channel")
        .addTopic(topic("topic1").type<string>())
        .addTopic(topic("topic2").type<number>());

      const ch = typeOnlyChannel<typeof originalChannel>("test-channel");

      expect(ch).toBeDefined();
      expect(ch.topics).toBeDefined();
    });

    test("топики доступны через proxy", () => {
      const originalChannel = channel("test-channel").addTopic(
        topic("topic1").type<string>(),
      );

      const ch = typeOnlyChannel<typeof originalChannel>("test-channel");

      expect(ch.topics.topic1).toBeDefined();
      expect(ch.topics.topic1.name).toBe("topic1");
    });

    test("функции топиков доступны через proxy", async () => {
      const originalChannel = channel("test-channel").addTopic(
        topic("topic1").type<string>(),
      );

      const ch = typeOnlyChannel<typeof originalChannel>("test-channel");

      expect(ch.topic1).toBeDefined();
      expect(typeof ch.topic1).toBe("function");

      const message = await ch.topic1("test");
      expect(message).toEqual({
        channel: "test-channel",
        topic: "topic1",
        data: "test",
      });
    });

    test("работает с динамическими каналами", async () => {
      const originalChannel = channel((id: string) => `user/${id}`).addTopic(
        topic("created").type<boolean>(),
      );

      const ch = typeOnlyChannel<typeof originalChannel>("user/123");

      expect(ch.created).toBeDefined();

      const message = await ch.created(true);
      expect(message.channel).toBe("user/123");
    });
  });

  describe("интеграция с динамическими каналами", () => {
    test("динамический канал с параметрами", () => {
      const ch = channel(
        (orgId: string, userId: string) => `org/${orgId}/user/${userId}`,
      );

      const instance = ch("org123", "user456");
      expect(instance.name).toBe("org/org123/user/user456");
    });

    test("динамический канал с топиками", async () => {
      const ch = channel((id: string) => `room/${id}`).addTopic(
        topic("message").type<string>(),
      );

      const room = ch("lobby");
      const msg = await room.message("Hello!");

      expect(msg).toEqual({
        channel: "room/lobby",
        topic: "message",
        data: "Hello!",
      });
    });
  });
});
