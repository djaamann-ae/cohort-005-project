// ─── In-app Notifications ───
// Knock delivers every Notification when KNOCK_API_KEY is set. Without a key
// (local dev, tests, CI) the no-op notifier logs and returns, so Cadence runs
// normally with no Feed. See docs/adr/0013-knock-handles-in-app-notifications.md.
//
// Domain logic never calls Knock: it returns a Notification descriptor and the
// route triggers it, the way refunds.server.ts returns an email for the route
// to send.

/**
 * Who a Notification is for. The id is Cadence's `users.id` as a string —
 * Knock takes it as the recipient id — and only the name travels, because
 * Knock owns the in-app channel and has no reason to hold a Student's address.
 */
export type NotificationRecipient = { id: string; name: string };

/**
 * A Notification Cadence asks Knock to send. `workflow` names the Knock
 * workflow that renders it, `idempotencyKey` derives from the domain event so
 * a replayed trigger creates no second Notification, and `data` is a snapshot
 * of the moment: Knock renders from it and cannot query Cadence.
 */
type Descriptor<Workflow extends string, Data> = {
  workflow: Workflow;
  recipient: NotificationRecipient;
  idempotencyKey: string;
  data: Data;
};

/** The buyer's Refund Request was approved or declined. Names no Platform Admin. */
export type RefundDecidedNotification = Descriptor<
  "refund-request-decided",
  {
    decision: "approved" | "declined";
    courseTitle: string;
    decisionNote: string | null;
    actionUrl: string;
  }
>;

/**
 * The course's Instructor or a Platform Admin answered the Student's question.
 * The actor travels here in `data`, never as an identified Knock actor: only
 * Students who receive Notifications are ever identified into Knock, and the
 * surface renders the actor from this snapshot with Cadence's own avatar.
 */
export type StaffRepliedNotification = Descriptor<
  "staff-replied-to-question",
  {
    actorName: string;
    courseTitle: string;
    lessonTitle: string;
    actionUrl: string;
  }
>;

export type Notification = RefundDecidedNotification | StaffRepliedNotification;

export interface Notifier {
  trigger(notification: Notification): Promise<void>;
}

/**
 * Sends a Notification. A failing notifier is swallowed and logged: the action
 * the Student or Platform Admin took has already committed, and no one should
 * lose it because a feed is unreachable. Delivery is at-most-once by design.
 */
export async function sendNotification(
  notification: Notification,
  notifier: Notifier = defaultNotifier()
): Promise<void> {
  try {
    await notifier.trigger(notification);
  } catch (error) {
    console.error(
      `[notifications] ${notification.workflow} failed for recipient ${notification.recipient.id} (${notification.idempotencyKey})`,
      error
    );
  }
}

/**
 * Triggers the workflow at Knock. The recipient is identified inline, so every
 * trigger re-upserts their name and a rename in Settings needs no sync step.
 * The workflow must be committed to the Knock environment, or the trigger
 * comes back `404 workflow_missing`.
 */
export function knockNotifier(secretKey: string): Notifier {
  return {
    async trigger(notification) {
      const response = await fetch(
        `https://api.knock.app/v1/workflows/${notification.workflow}/trigger`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`,
            // Knock dedupes on this header for 24 hours, so a replayed
            // trigger creates no second Notification.
            "Idempotency-Key": notification.idempotencyKey,
          },
          body: JSON.stringify({
            recipients: [
              {
                id: notification.recipient.id,
                name: notification.recipient.name,
              },
            ],
            data: notification.data,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Knock rejected ${notification.workflow} for recipient ${notification.recipient.id}: ${response.status}`
        );
      }
    },
  };
}

/** Logs and does nothing, for anyone running Cadence without Knock keys. */
export function noopNotifier(): Notifier {
  return {
    async trigger(notification) {
      console.info(
        `[notifications] no KNOCK_API_KEY — skipping ${notification.workflow} for recipient ${notification.recipient.id}`
      );
    },
  };
}

function defaultNotifier(): Notifier {
  const secretKey = process.env.KNOCK_API_KEY;
  return secretKey ? knockNotifier(secretKey) : noopNotifier();
}
