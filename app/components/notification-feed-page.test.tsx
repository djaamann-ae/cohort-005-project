import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterProvider, createMemoryRouter } from "react-router";
import { NotificationsEmptyState } from "./notification-feed";
import { NotificationFeedPage } from "./notification-feed-page";

const knock = { publicApiKey: "pk_test_123", feedChannelId: "feed-1" };

/** The page navigates on a click, so it needs a data router around it. */
function render(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: "/", element }]);

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

/** The words some markup reads as, with the tags taken off. */
function textOf(html: string) {
  return html.replace(/<[^>]*>/g, "");
}

describe("the Feed page", () => {
  it("names itself in the server-rendered page, before Knock has said anything", () => {
    const html = render(<NotificationFeedPage config={knock} userId={5} />);

    expect(html).toContain("Notifications");
  });

  it("explains an empty Feed in the panel's own words", () => {
    const html = render(<NotificationFeedPage config={knock} userId={5} />);
    const panelsWords = renderToStaticMarkup(
      <NotificationsEmptyState compact />
    );

    expect(textOf(html)).toContain(textOf(panelsWords));
  });

  it("lets a Student mark their whole Feed read, as the panel does", () => {
    const html = render(<NotificationFeedPage config={knock} userId={5} />);

    expect(html).toMatch(/mark all as read/i);
  });
});
