import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterProvider, createMemoryRouter } from "react-router";
import { UserRole } from "~/db/schema";
import { Sidebar } from "./sidebar";

const student = {
  id: 5,
  name: "Emma Wilson",
  role: UserRole.Student,
  avatarUrl: null,
};

/** The sidebar posts a logout Form, so it needs a data router around it. */
function render(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: "/", element }]);

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("the notification bell in the sidebar", () => {
  it("is absent entirely when Knock is not configured", () => {
    const html = render(<Sidebar currentUser={student} knock={null} />);

    expect(html).not.toContain("Notifications");
  });

  it("is in the server-rendered page when Knock is configured", () => {
    const html = render(
      <Sidebar
        currentUser={student}
        knock={{ publicApiKey: "pk_test_123", feedChannelId: "feed-1" }}
      />
    );

    expect(html).toContain("Notifications");
  });

  it("carries no count until the Student has something unread", () => {
    const html = render(
      <Sidebar
        currentUser={student}
        knock={{ publicApiKey: "pk_test_123", feedChannelId: "feed-1" }}
      />
    );

    expect(html).not.toContain("unread");
  });
});
