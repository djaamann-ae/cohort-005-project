import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { db } from "~/db";
import { setCurrentUserId } from "~/lib/session";
import { sendEmail } from "~/lib/mailer.server";
import { sendNotification } from "~/lib/notifications.server";
import { action } from "./admin.refunds";
import type { Route } from "./+types/admin.refunds";

// The route reaches for the live database, Postmark and Knock. Each is swapped
// for something a test can watch: an in-memory database, and a mailer and a
// notifier that only record being called.
vi.mock("~/db", async () => {
  const { createTestDb } = await import("~/test/setup");

  return { db: createTestDb() };
});

vi.mock("~/lib/mailer.server", () => ({ sendEmail: vi.fn() }));

vi.mock("~/lib/notifications.server", () => ({ sendNotification: vi.fn() }));

const NOW = new Date(2026, 9, 6, 12, 0, 0);

/** Wipes the in-memory database between tests — it is made once, at import. */
function reset() {
  for (const table of [
    schema.refunds,
    schema.purchases,
    schema.enrollments,
    schema.courses,
    schema.categories,
    schema.users,
  ]) {
    db.delete(table).run();
  }
}

/** A Platform Admin, a buyer, and an Open Refund Request on their Purchase. */
function seedOpenRefundRequest() {
  const base = seedBaseData(db as ReturnType<typeof createTestDb>);

  const platformAdmin = db
    .insert(schema.users)
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
    .returning()
    .get();

  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 7900,
      createdAt: NOW.toISOString(),
    })
    .returning()
    .get();

  db.insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();

  const refundRequest = db
    .insert(schema.refunds)
    .values({
      purchaseId: purchase.id,
      status: RefundStatus.Open,
      reason: "It was not what I expected.",
    })
    .returning()
    .get();

  return { platformAdmin, refundRequest };
}

/** The decision a Platform Admin posts, signed in as them. */
async function decisionBy(
  platformAdminId: number,
  body: Record<string, string>
): Promise<Route.ActionArgs> {
  const setCookie = await setCurrentUserId(
    new Request("http://cadence.test/"),
    platformAdminId
  );

  const request = new Request("http://cadence.test/admin/refunds", {
    method: "POST",
    headers: {
      Cookie: setCookie.split(";")[0],
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  return {
    request,
    params: {},
    context: new RouterContextProvider(),
    url: new URL(request.url),
    pattern: "/admin/refunds",
  };
}

beforeEach(() => {
  vi.mocked(sendEmail).mockReset();
  vi.mocked(sendNotification).mockReset();
  reset();
});

describe("deciding a Refund Request", () => {
  it("tells the buyer in their Feed even when Postmark is down", async () => {
    const { platformAdmin, refundRequest } = seedOpenRefundRequest();
    vi.mocked(sendEmail).mockRejectedValue(new Error("Postmark is down"));

    await action(
      await decisionBy(platformAdmin.id, {
        intent: "approve",
        refundRequestId: String(refundRequest.id),
      })
    ).catch(() => undefined);

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: "refund-request-decided",
        idempotencyKey: `refund-decision:${refundRequest.id}`,
      })
    );
  });

  it("still sends the email when nothing is down", async () => {
    const { platformAdmin, refundRequest } = seedOpenRefundRequest();

    await action(
      await decisionBy(platformAdmin.id, {
        intent: "decline",
        refundRequestId: String(refundRequest.id),
        note: "Past half way.",
      })
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
