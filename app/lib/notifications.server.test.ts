import { describe, expect, it, vi } from "vitest";
import {
  noopNotifier,
  sendNotification,
  type Notification,
  type Notifier,
} from "./notifications.server";

const REFUND_DECIDED: Notification = {
  workflow: "refund-request-decided",
  recipient: { id: "5", name: "Emma Wilson" },
  idempotencyKey: "refund-decision:42",
  data: {
    decision: "approved",
    courseTitle: "Advanced TypeScript",
    decisionNote: "Sorry it wasn't for you.",
    actionUrl: "/settings",
  },
};

function fakeNotifier() {
  const sent: Notification[] = [];
  const notifier: Notifier = {
    async trigger(notification) {
      sent.push(notification);
    },
  };
  return { notifier, sent };
}

describe("sendNotification", () => {
  it("hands the notification to the notifier it was given", async () => {
    const { notifier, sent } = fakeNotifier();

    await sendNotification(REFUND_DECIDED, notifier);

    expect(sent).toEqual([REFUND_DECIDED]);
  });

  it("swallows a notifier that fails, so the action that caused it still stands", async () => {
    const failing: Notifier = {
      async trigger() {
        throw new Error("Knock is unreachable");
      },
    };

    await expect(
      sendNotification(REFUND_DECIDED, failing)
    ).resolves.toBeUndefined();
  });
});

describe("the no-op notifier", () => {
  it("does nothing, and does not throw", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      noopNotifier().trigger(REFUND_DECIDED)
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the default notifier", () => {
  it("is the no-op when there is no KNOCK_API_KEY, so Cadence runs without Knock", async () => {
    vi.stubEnv("KNOCK_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendNotification(REFUND_DECIDED);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
