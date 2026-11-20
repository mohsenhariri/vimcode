import * as assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

export async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      assert.fail(`Timed out waiting for ${description}`);
    }
    await delay(20);
  }
}
