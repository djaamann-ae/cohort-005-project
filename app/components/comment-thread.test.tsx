import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterProvider, createMemoryRouter } from "react-router";
import { LessonDiscussion } from "./comment-thread";

/** The thread posts with fetchers, so it needs a data router around it. */
function render(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: "/", element }]);

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

const thread = {
  comments: [],
  currentUserId: 5,
  canModerate: false,
  instructorName: "Sarah Chen",
  courseSlug: "advanced-typescript",
};

describe("a lesson a Student can no longer reach", () => {
  it("says the Enrollment ended rather than leaving the thread silently missing", () => {
    const html = render(
      <LessonDiscussion {...thread} canViewContent={false} enrollmentEnded />
    );

    expect(html).toContain("Your Enrollment on this course has ended");
    expect(html).not.toContain("Questions &amp; Discussion");
  });

  it("offers the course and the catalogue rather than a dead end", () => {
    const html = render(
      <LessonDiscussion {...thread} canViewContent={false} enrollmentEnded />
    );

    expect(html).toContain('href="/courses/advanced-typescript"');
    expect(html).toContain('href="/courses"');
  });

  it("says nothing at all to a visitor who was never enrolled", () => {
    const html = render(
      <LessonDiscussion {...thread} canViewContent={false} enrollmentEnded={false} />
    );

    expect(html).toBe("");
  });
});

describe("a lesson a Student can still reach", () => {
  it("shows the thread, with nothing said about access", () => {
    const html = render(
      <LessonDiscussion {...thread} canViewContent enrollmentEnded={false} />
    );

    expect(html).toContain("Questions &amp; Discussion");
    expect(html).toContain("Post comment");
    expect(html).not.toContain("enrolled students");
    expect(html).not.toContain("has ended");
  });
});
