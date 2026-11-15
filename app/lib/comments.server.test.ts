import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { MAX_COMMENT_LENGTH } from "~/lib/comments";
import { createComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;
let platformAdmin: typeof schema.users.$inferSelect;
let otherStudent: typeof schema.users.$inferSelect;
let otherInstructor: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const addUser = (name: string, email: string, role: schema.UserRole) =>
    db.insert(schema.users).values({ name, email, role }).returning().get();

  platformAdmin = addUser(
    "Pat Admin",
    "pat@example.com",
    schema.UserRole.Admin
  );
  otherStudent = addUser(
    "Sam Student",
    "sam@example.com",
    schema.UserRole.Student
  );
  // Teaches elsewhere — the Instructor role alone does not speak for this course.
  otherInstructor = addUser(
    "Ivy Elsewhere",
    "ivy@example.com",
    schema.UserRole.Instructor
  );

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
    const { comment } = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "  Why does this work?  "
    );

    expect(comment.lessonId).toBe(lessonId);
    expect(comment.userId).toBe(base.user.id);
    expect(comment.parentId).toBeNull();
    expect(comment.body).toBe("Why does this work?");
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
    const { comment: question } = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why does this work?"
    );

    const { comment: reply } = createComment(
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
    const { comment: question } = createComment(
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
    const { comment: question } = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why does this work?"
    );
    const { comment: reply } = createComment(
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

describe("the Notification a reply produces", () => {
  /** Asks a question on the lesson, and hands back its id. */
  function ask(askerId: number) {
    return createComment(db, askerId, lessonId, null, "Why does this work?")
      .comment.id;
  }

  function reply(authorId: number, questionId: number) {
    return createComment(db, authorId, lessonId, questionId, "Here's why.");
  }

  it("tells the asking Student that the course's Instructor replied", () => {
    const questionId = ask(base.user.id);

    const result = reply(base.instructor.id, questionId);

    expect(result.notification).toEqual({
      workflow: "staff-replied-to-question",
      recipient: { id: String(base.user.id), name: "Test User" },
      idempotencyKey: `comment-reply:${result.comment.id}`,
      data: {
        actorName: "Test Instructor",
        courseTitle: "Test Course",
        lessonTitle: "Lesson 1",
        actionUrl: `/courses/test-course/lessons/${lessonId}`,
      },
    });
  });

  it("stays quiet when another Student replies, so the Feed is about answers", () => {
    const questionId = ask(base.user.id);

    expect(reply(otherStudent.id, questionId).notification).toBeNull();
  });

  it("stays quiet when staff answer their own question, so nobody notifies themselves", () => {
    const instructorQuestionId = ask(base.instructor.id);
    const adminQuestionId = ask(platformAdmin.id);

    expect(
      reply(base.instructor.id, instructorQuestionId).notification
    ).toBeNull();
    expect(reply(platformAdmin.id, adminQuestionId).notification).toBeNull();
  });

  it("tells the asking Student when a Platform Admin replies, whatever course it is on", () => {
    const questionId = ask(base.user.id);

    const result = reply(platformAdmin.id, questionId);

    expect(result.notification?.recipient).toEqual({
      id: String(base.user.id),
      name: "Test User",
    });
    expect(result.notification?.data.actorName).toBe("Pat Admin");
  });

  it("stays quiet when an Instructor replies on a course they do not teach", () => {
    const questionId = ask(base.user.id);

    expect(reply(otherInstructor.id, questionId).notification).toBeNull();
  });

  it("stays quiet for a question, which answers nobody", () => {
    const { notification } = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "Why does this work?"
    );

    expect(notification).toBeNull();
  });

  it("gives each of two staff replies its own Notification, so the second is not missed", () => {
    const questionId = ask(base.user.id);

    const first = reply(base.instructor.id, questionId);
    const second = reply(platformAdmin.id, questionId);

    expect(first.notification?.idempotencyKey).toBe(
      `comment-reply:${first.comment.id}`
    );
    expect(second.notification?.idempotencyKey).toBe(
      `comment-reply:${second.comment.id}`
    );
    expect(first.notification?.idempotencyKey).not.toBe(
      second.notification?.idempotencyKey
    );
  });

  it("snapshots the course and lesson as they read at the time", () => {
    const questionId = ask(base.user.id);

    const { notification } = reply(base.instructor.id, questionId);

    db.update(schema.courses)
      .set({ title: "Renamed Later" })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    expect(notification?.data.courseTitle).toBe("Test Course");
  });
});
