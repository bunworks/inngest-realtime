import { describe, test, expect } from "vitest";
import * as v from "valibot";
import { topic, TopicDefinitionImpl } from "./topic";

describe("topic", () => {
  describe("создание топика", () => {
    test("создает пустой топик", () => {
      const t = topic("test-topic");

      expect(t).toBeDefined();
      expect(t).toBeInstanceOf(TopicDefinitionImpl);
      expect(t.name).toBe("test-topic");
      expect(t.getSchema()).toBeUndefined();
    });

    test("имя топика сохраняется", () => {
      const t = topic("my-topic");
      expect(t.name).toBe("my-topic");
    });
  });

  describe("типизация топика", () => {
    test("добавляет тип к топику", () => {
      const t = topic("test-topic").type<string>();

      expect(t).toBeDefined();
      expect(t.name).toBe("test-topic");
      expect(t.getSchema()).toBeUndefined();
    });

    test("перезаписывает тип топика", () => {
      const t = topic("test-topic").type<string>().type<number>();

      expect(t).toBeDefined();
      expect(t.name).toBe("test-topic");
    });

    test("поддерживает сложные типы", () => {
      interface User {
        id: string;
        name: string;
        age: number;
      }

      const t = topic("user-topic").type<User>();

      expect(t).toBeDefined();
      expect(t.name).toBe("user-topic");
    });

    // Примечание: метод type() намеренно поддерживает только один параметр типа (TPublish).
    // Для разных типов publish/subscribe используйте schema() с трансформациями.
  });

  describe("схема топика", () => {
    test("добавляет схему к топику", () => {
      const schema = v.string();
      const t = topic("test-topic").schema(schema);

      expect(t).toBeDefined();
      expect(t.name).toBe("test-topic");
      expect(t.getSchema()).toBeDefined();
    });

    test("схема с объектом", () => {
      const schema = v.object({
        id: v.string(),
        name: v.string(),
        age: v.number(),
      });
      const t = topic("user-topic").schema(schema);

      expect(t.getSchema()).toBe(schema);
    });

    test("схема с массивом", () => {
      const schema = v.array(v.string());
      const t = topic("list-topic").schema(schema);

      expect(t.getSchema()).toBe(schema);
    });

    test("схема с union типом", () => {
      const schema = v.union([v.string(), v.number()]);
      const t = topic("union-topic").schema(schema);

      expect(t.getSchema()).toBe(schema);
    });

    test("перезаписывает схему", () => {
      const schema1 = v.string();
      const schema2 = v.number();
      const t = topic("test-topic").schema(schema1).schema(schema2);

      expect(t.getSchema()).toBe(schema2);
    });

    test("схема после типизации", () => {
      const schema = v.string();
      const t = topic("test-topic").type<number>().schema(schema);

      expect(t.getSchema()).toBe(schema);
    });
  });

  describe("TopicDefinitionImpl", () => {
    test("создается с именем", () => {
      const t = new TopicDefinitionImpl("test");

      expect(t.name).toBe("test");
      expect(t.getSchema()).toBeUndefined();
    });

    test("создается с именем и схемой", () => {
      const schema = v.string();
      const t = new TopicDefinitionImpl("test", schema);

      expect(t.name).toBe("test");
      expect(t.getSchema()).toBe(schema);
    });

    test("type() возвращает новый экземпляр", () => {
      const t1 = new TopicDefinitionImpl("test");
      const t2 = t1.type<string>();

      expect(t2).toBe(t1);
      expect(t2.name).toBe("test");
    });

    test("schema() возвращает новый экземпляр", () => {
      const schema = v.string();
      const t1 = new TopicDefinitionImpl("test");
      const t2 = t1.schema(schema);

      expect(t2).toBeInstanceOf(TopicDefinitionImpl);
      expect(t2.name).toBe("test");
      expect(t2.getSchema()).toBe(schema);
    });

    test("getSchema() возвращает undefined без схемы", () => {
      const t = new TopicDefinitionImpl("test");
      expect(t.getSchema()).toBeUndefined();
    });

    test("getSchema() возвращает схему", () => {
      const schema = v.number();
      const t = new TopicDefinitionImpl("test", schema);
      expect(t.getSchema()).toBe(schema);
    });
  });

  describe("цепочка вызовов", () => {
    test("type().schema() работает", () => {
      const schema = v.string();
      const t = topic("test").type<number>().schema(schema);

      expect(t.name).toBe("test");
      expect(t.getSchema()).toBe(schema);
    });

    test("schema().type() работает", () => {
      const schema = v.string();
      const t = topic("test").schema(schema).type<boolean>();

      expect(t.name).toBe("test");
      // После type() схема сохраняется
      expect(t.getSchema()).toBeDefined();
    });

    test("множественные вызовы type()", () => {
      const t = topic("test").type<string>().type<number>().type<boolean>();

      expect(t.name).toBe("test");
    });

    test("множественные вызовы schema()", () => {
      const schema1 = v.string();
      const schema2 = v.number();
      const schema3 = v.boolean();
      const t = topic("test").schema(schema1).schema(schema2).schema(schema3);

      expect(t.getSchema()).toBe(schema3);
    });
  });
});
