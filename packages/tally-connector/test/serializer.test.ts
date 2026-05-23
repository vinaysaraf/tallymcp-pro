import { describe, expect, it } from "vitest";
import { RequestSerializer } from "../src/serializer.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RequestSerializer", () => {
  it("runs enqueued tasks sequentially", async () => {
    const serializer = new RequestSerializer();
    const order: number[] = [];

    const first = serializer.enqueue(async () => {
      await delay(40);
      order.push(1);
      return "a";
    });

    const second = serializer.enqueue(async () => {
      order.push(2);
      return "b";
    });

    const [r1, r2] = await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
    expect(r1).toBe("a");
    expect(r2).toBe("b");
  });

  it("continues the queue after a task rejects", async () => {
    const serializer = new RequestSerializer();
    const order: number[] = [];

    const failing = serializer.enqueue(async () => {
      order.push(1);
      throw new Error("fail");
    });

    const next = serializer.enqueue(async () => {
      order.push(2);
    });

    await expect(failing).rejects.toThrow("fail");
    await next;
    expect(order).toEqual([1, 2]);
  });
});
