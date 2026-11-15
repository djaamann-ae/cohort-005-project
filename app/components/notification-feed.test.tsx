import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NOTIFICATIONS_PATH,
  NotificationActor,
  notificationPath,
  notificationTarget,
} from "./notification-feed";

describe("notificationPath", () => {
  it("uses the app-relative path Cadence put in the Notification's data", () => {
    const path = notificationPath({
      data: { actionUrl: "/courses/advanced-typescript/lessons/4" },
      blocks: [],
    });

    expect(path).toBe("/courses/advanced-typescript/lessons/4");
  });

  it("falls back to the path inside the whole URL Knock rendered", () => {
    const path = notificationPath({
      data: {},
      blocks: [
        {
          name: "action_url",
          type: "text",
          content: "{{ vars.app_url }}{{ data.actionUrl }}",
          rendered: "https://cadence.dev/settings",
        },
      ],
    });

    expect(path).toBe("/settings");
  });

  it("has nowhere to go when the Notification carries no link", () => {
    expect(notificationPath({ data: {}, blocks: [] })).toBeNull();
  });
});

describe("where clicking a Notification lands", () => {
  it("goes where the Notification points, saying nothing about it", () => {
    const target = notificationTarget({
      data: { actionUrl: "/courses/advanced-typescript/lessons/4" },
      blocks: [],
    });

    expect(target).toEqual({
      path: "/courses/advanced-typescript/lessons/4",
      reason: null,
    });
  });

  it("falls back to the Feed, with a reason, rather than going nowhere", () => {
    const target = notificationTarget({ data: {}, blocks: [] });

    expect(target.path).toBe(NOTIFICATIONS_PATH);
    expect(target.reason).toBeTruthy();
  });
});

describe("NotificationActor", () => {
  it("shows the actor from the Notification's data with Cadence's own avatar", () => {
    const html = renderToStaticMarkup(
      <NotificationActor
        item={{ data: { actorName: "Sarah Chen" }, blocks: [] }}
      />
    );

    expect(html).toContain("SC");
  });

  it("stands in for an actor on a Notification that has none", () => {
    const html = renderToStaticMarkup(
      <NotificationActor
        item={{ data: { decision: "approved" }, blocks: [] }}
      />
    );

    expect(html).toContain("<svg");
    expect(html).not.toMatch(/>[A-Z]{1,2}</);
  });
});
