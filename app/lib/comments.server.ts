import { and, eq, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import {
  comments,
  courses,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import { MIN_COMMENT_LENGTH, MAX_COMMENT_LENGTH } from "~/lib/comments";
import type { StaffRepliedNotification } from "~/lib/notifications.server";

// ─── Comments ───
// Writing a comment on a lesson: a question, or a reply to one. Both the
// lesson thread and the instructor queue post through here, so the two
// surfaces cannot drift apart.
//
// Takes the database first, so tests can hand in an in-memory one. Uses
// positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

function getCourseForLesson(db: Db, lessonId: number) {
  return db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
      lessonTitle: lessons.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

function getCommentById(db: Db, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

function getUserById(db: Db, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

/**
 * Whose reply speaks for the course, and so counts as the answer a question
 * was waiting for: the Admin role anywhere, the course's own Instructor on
 * their own course. Holding the Instructor role is not enough elsewhere.
 *
 * The instructor queue's unanswered-questions query and the Notification both
 * build their condition here, so the two surfaces cannot disagree about what
 * an answer is.
 */
export function answersForTheCourse(
  authorRole: AnySQLiteColumn,
  authorId: AnySQLiteColumn,
  courseInstructorId: AnySQLiteColumn | number
) {
  return or(eq(authorRole, UserRole.Admin), eq(authorId, courseInstructorId));
}

function repliesAsStaff(
  db: Db,
  authorId: number,
  courseInstructorId: number
): boolean {
  const staff = db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, authorId),
        answersForTheCourse(users.role, users.id, courseInstructorId)
      )
    )
    .get();

  return staff !== undefined;
}

/** The course a lesson belongs to, with the lesson's own title alongside. */
type LessonContext = NonNullable<ReturnType<typeof getCourseForLesson>>;
type Comment = typeof comments.$inferSelect;

/**
 * What writing a comment produced: the row, and the Notification the asking
 * Student is owed, or null when nobody is owed one. The route triggers it
 * after the write; this function never calls Knock.
 */
export type CreateCommentResult = {
  comment: Comment;
  notification: StaffRepliedNotification | null;
};

/** Writes a comment on a lesson. A reply passes the question's id as parent. */
export function createComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
): CreateCommentResult {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }

  const course = getCourseForLesson(db, lessonId);
  if (!course) {
    throw new Error("Lesson not found");
  }

  // Replies are one level deep: a reply answers a question, never another
  // reply, and never one asked on some other lesson.
  let question: Comment | null = null;
  if (parentId !== null) {
    const parent = getCommentById(db, parentId);
    if (!parent) {
      throw new Error("Parent comment not found");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (parent.parentId !== null) {
      throw new Error("Replies can only be one level deep");
    }
    question = parent;
  }

  const comment = db
    .insert(comments)
    .values({ userId, lessonId, parentId, body: trimmed })
    .returning()
    .get();

  // A Notification is owed only when staff answered someone else's question:
  // another Student's reply is discussion, not an answer, and nobody's own
  // actions notify them.
  const notification =
    question !== null &&
    question.userId !== userId &&
    repliesAsStaff(db, userId, course.instructorId)
      ? buildStaffReplyNotification(db, course, comment, question)
      : null;

  return { comment, notification };
}

/**
 * The Notification the asking Student gets when staff answer. The data is a
 * snapshot of this moment, so renaming the course later does not rewrite the
 * Student's history.
 */
function buildStaffReplyNotification(
  db: Db,
  course: LessonContext,
  reply: Comment,
  question: Comment
): StaffRepliedNotification {
  const asker = getUserById(db, question.userId);
  const actor = getUserById(db, reply.userId);

  return {
    workflow: "staff-replied-to-question",
    recipient: {
      id: String(question.userId),
      name: asker?.name ?? "there",
    },
    // Derived from the reply itself, so a double-submitted reply produces one
    // Notification.
    idempotencyKey: `comment-reply:${reply.id}`,
    data: {
      actorName: actor?.name ?? "Cadence",
      courseTitle: course.courseTitle,
      lessonTitle: course.lessonTitle,
      // A leading slash: Knock joins it onto its own app_url.
      actionUrl: `/courses/${course.courseSlug}/lessons/${reply.lessonId}`,
    },
  };
}
