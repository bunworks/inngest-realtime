import { describe, test, expect, vi } from "vitest";
import { StreamFanout } from "./StreamFanout";

describe("StreamFanout", () => {
  describe("создание потоков", () => {
    test("создает новый поток", () => {
      const fanout = new StreamFanout<string>();
      const stream = fanout.createStream();

      expect(stream).toBeInstanceOf(ReadableStream);
    });

    test("создает несколько потоков", () => {
      const fanout = new StreamFanout<string>();
      const stream1 = fanout.createStream();
      const stream2 = fanout.createStream();

      expect(stream1).toBeInstanceOf(ReadableStream);
      expect(stream2).toBeInstanceOf(ReadableStream);
      expect(stream1).not.toBe(stream2);
    });

    test("size() возвращает количество активных потоков", () => {
      const fanout = new StreamFanout<string>();
      expect(fanout.size()).toBe(0);

      fanout.createStream();
      expect(fanout.size()).toBe(1);

      fanout.createStream();
      expect(fanout.size()).toBe(2);
    });
  });

  describe("запись данных", () => {
    test("записывает данные во все потоки", async () => {
      const fanout = new StreamFanout<string>();
      const stream1 = fanout.createStream();
      const stream2 = fanout.createStream();

      fanout.write("test data");

      const reader1 = stream1.getReader();
      const reader2 = stream2.getReader();

      const result1 = await reader1.read();
      const result2 = await reader2.read();

      expect(result1.value).toBe("test data");
      expect(result2.value).toBe("test data");
    });

    test("записывает несколько сообщений", async () => {
      const fanout = new StreamFanout<number>();
      const stream = fanout.createStream();
      const reader = stream.getReader();

      fanout.write(1);
      fanout.write(2);
      fanout.write(3);

      const result1 = await reader.read();
      const result2 = await reader.read();
      const result3 = await reader.read();

      expect(result1.value).toBe(1);
      expect(result2.value).toBe(2);
      expect(result3.value).toBe(3);
    });

    test("работает с объектами", async () => {
      const fanout = new StreamFanout<{ id: number; name: string }>();
      const stream = fanout.createStream();
      const reader = stream.getReader();

      const data = { id: 1, name: "test" };
      fanout.write(data);

      const result = await reader.read();
      expect(result.value).toEqual(data);
    });
  });

  describe("трансформация данных", () => {
    test("применяет трансформацию к данным", async () => {
      const fanout = new StreamFanout<number>();
      const stream = fanout.createStream((n) => n * 2);
      const reader = stream.getReader();

      fanout.write(5);

      const result = await reader.read();
      expect(result.value).toBe(10);
    });

    test("трансформирует тип данных", async () => {
      const fanout = new StreamFanout<number>();
      const stream = fanout.createStream((n) => `Number: ${n}`);
      const reader = stream.getReader();

      fanout.write(42);

      const result = await reader.read();
      expect(result.value).toBe("Number: 42");
    });

    test("разные трансформации для разных потоков", async () => {
      const fanout = new StreamFanout<number>();
      const stream1 = fanout.createStream((n) => n * 2);
      const stream2 = fanout.createStream((n) => n + 10);

      const reader1 = stream1.getReader();
      const reader2 = stream2.getReader();

      fanout.write(5);

      const result1 = await reader1.read();
      const result2 = await reader2.read();

      expect(result1.value).toBe(10);
      expect(result2.value).toBe(15);
    });

    test("поток без трансформации", async () => {
      const fanout = new StreamFanout<string>();
      const stream = fanout.createStream();
      const reader = stream.getReader();

      fanout.write("test");

      const result = await reader.read();
      expect(result.value).toBe("test");
    });
  });

  describe("закрытие потоков", () => {
    test("close() закрывает все потоки", async () => {
      const fanout = new StreamFanout<string>();
      const stream = fanout.createStream();
      const reader = stream.getReader();

      fanout.close();

      const result = await reader.read();
      expect(result.done).toBe(true);
    });

    test("close() очищает все потоки", () => {
      const fanout = new StreamFanout<string>();
      fanout.createStream();
      fanout.createStream();

      expect(fanout.size()).toBe(2);

      fanout.close();

      expect(fanout.size()).toBe(0);
    });

    test("закрытие потока удаляет его из списка", async () => {
      const fanout = new StreamFanout<string>();
      const stream = fanout.createStream();

      expect(fanout.size()).toBe(1);

      const reader = stream.getReader();
      await reader.cancel();

      // Даем время на обработку закрытия
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(fanout.size()).toBe(0);
    });

    test("запись в закрытый поток не вызывает ошибку", () => {
      const fanout = new StreamFanout<string>();
      const stream = fanout.createStream();
      const reader = stream.getReader();

      reader.cancel();

      expect(() => fanout.write("test")).not.toThrow();
    });
  });

  describe("обработка ошибок", () => {
    test("удаляет поток при ошибке записи", async () => {
      const fanout = new StreamFanout<string>();
      const stream = fanout.createStream();
      const reader = stream.getReader();

      expect(fanout.size()).toBe(1);

      await reader.cancel();

      // Даем время на обработку
      await new Promise((resolve) => setTimeout(resolve, 10));

      fanout.write("test");

      // Даем время на обработку ошибки
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(fanout.size()).toBe(0);
    });

    test("продолжает работу с другими потоками при ошибке", async () => {
      const fanout = new StreamFanout<string>();
      const stream1 = fanout.createStream();
      const stream2 = fanout.createStream();

      const reader1 = stream1.getReader();
      const reader2 = stream2.getReader();

      await reader1.cancel();

      fanout.write("test");

      const result2 = await reader2.read();
      expect(result2.value).toBe("test");
    });
  });

  describe("производительность", () => {
    test("обрабатывает большое количество сообщений", async () => {
      const fanout = new StreamFanout<number>();
      const stream = fanout.createStream();
      const reader = stream.getReader();

      const count = 1000;
      for (let i = 0; i < count; i++) {
        fanout.write(i);
      }

      for (let i = 0; i < count; i++) {
        const result = await reader.read();
        expect(result.value).toBe(i);
      }
    });

    test("обрабатывает много потоков одновременно", async () => {
      const fanout = new StreamFanout<number>();
      const streamCount = 10;
      const streams = Array.from({ length: streamCount }, () =>
        fanout.createStream(),
      );

      expect(fanout.size()).toBe(streamCount);

      fanout.write(42);

      const results = await Promise.all(
        streams.map((stream) => stream.getReader().read()),
      );

      results.forEach((result) => {
        expect(result.value).toBe(42);
      });
    });
  });
});
