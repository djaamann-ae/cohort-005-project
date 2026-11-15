import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { MAX_COMMENT_LENGTH } from "~/lib/comments";
import { createComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  const addLesson = (position: number) =>
    db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: `Lesson ${position}`, position })
      .returning()
      .get().id;

  lessonId = addLesson(1);
  otherLessonId = addLesson(2);
});

describe("createComment", () => {
  it("records a question on the lesson, trimmed", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "  Why does this work?  "
    );

    expect(question.lessonId).toBe(lessonId);
    expect(question.userId).toBe(base.user.id);
    expect(question.parentId).toBeNull();
    expect(question.body).toBe("Why does this work?");
  });

  it("refuses a body that is only whitespace", () => {
    expect(() =>
      createComment(db, base.user.id, lessonId, null, "   ")
    ).toThrow("Comment cannot be empty");
  });

  it("refuses a body longer than the limit", () => {
    const tooLong = "a".repeat(MAX_COMMENT_LENGTH + 1);

    expect(() =>
      createComment(db, base.user.id, lessonId, null, tooLong)
    ).toThrow(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`);
  });

  it("refuses a lesson that does not exist", () => {
    expect(() =>
      createComment(db, base.user.id, lessonId + 1000, null, "Hello?")
    ).toThrow("Lesson not found");
  });

  it("records a reply against the question it answers", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why does this work?"
    );

    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Because of the event loop."
    );

    expect(reply.parentId).toBe(question.id);
    expect(reply.lessonId).toBe(lessonId);
    expect(reply.userId).toBe(base.instructor.id);
  });

  it("refuses a parent that does not exist", () => {
    expect(() =>
      createComment(db, base.user.id, lessonId, 999, "Answering nothing.")
    ).toThrow("Parent comment not found");
  });

  it("refuses a parent on a different lesson", () => {
    const question = createComment(
      db,
      base.user.id,
      otherLessonId,
      null,
      "Why does this work?"
    );

    expect(() =>
      createComment(db, base.instructor.id, lessonId, question.id, "Because.")
    ).toThrow("Parent comment belongs to a different lesson");
  });

  it("refuses a reply to a reply", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why does this work?"
    );
    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Because of the event loop."
    );

    expect(() =>
      createComment(db, base.user.id, lessonId, reply.id, "Thanks!")
    ).toThrow("Replies can only be one level deep");
  });
});
