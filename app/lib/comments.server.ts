import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments, courses, lessons, modules } from "~/db/schema";
import { MIN_COMMENT_LENGTH, MAX_COMMENT_LENGTH } from "~/lib/comments";

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

/** Writes a comment on a lesson. A reply passes the question's id as parent. */
export function createComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
) {
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
  }

  return db
    .insert(comments)
    .values({ userId, lessonId, parentId, body: trimmed })
    .returning()
    .get();
}
