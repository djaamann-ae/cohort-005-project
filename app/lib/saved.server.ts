import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";
import { MAX_NOTE_LENGTH, MIN_NOTE_LENGTH } from "~/lib/saved";

// ─── Bookmarks and Notes ───
// What a Student attaches to a Lesson for themselves: a Bookmark (a flag) and
// a Note (their own writing). Both are one per Student per Lesson, enforced by
// a unique index. See GLOSSARY.md for the language.
//
// A Note is private to the Student who wrote it. Nothing outside the Student's
// own Lesson page and Saved page may read a Note body — not the Course's
// Instructor, not a Platform Admin. Every read here takes the owning Student's
// id, so there is no query shape that returns somebody else's Notes.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

type Note = typeof notes.$inferSelect;

/** The Lesson a Bookmark or Note hangs off, with the Course it belongs to. */
const lessonColumns = {
  lessonId: lessons.id,
  lessonTitle: lessons.title,
  moduleTitle: modules.title,
  courseTitle: courses.title,
  courseSlug: courses.slug,
};

function lessonExists(db: Db, lessonId: number) {
  return !!db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .get();
}

/** Whether the Student has flagged this Lesson. */
export function isBookmarked(db: Db, userId: number, lessonId: number) {
  return !!db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

/**
 * Adds the Student's Bookmark on a Lesson, or removes the one already there.
 * Returns whether the Lesson is bookmarked now.
 */
export function toggleBookmark(
  db: Db,
  userId: number,
  lessonId: number,
  now: Date
) {
  const existing = db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();

  if (existing) {
    db.delete(bookmarks).where(eq(bookmarks.id, existing.id)).run();
    return false;
  }

  db.insert(bookmarks)
    .values({ userId, lessonId, createdAt: now.toISOString() })
    .run();
  return true;
}

/** The Student's own Note on a Lesson, if they have written one. */
export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult = { ok: true; note: Note } | { ok: false; error: string };

/**
 * Writes the Student's Note on a Lesson, replacing the body of the one already
 * there. The body is plain text, trimmed, and refused rather than truncated
 * when it is too long. A re-save moves `updatedAt` on and leaves `createdAt`
 * where it was, so "last edited" reflects the latest change.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();
  if (trimmed.length < MIN_NOTE_LENGTH) {
    return { ok: false, error: "Note cannot be empty" };
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: `Note must be ${MAX_NOTE_LENGTH} characters or fewer`,
    };
  }

  if (!lessonExists(db, lessonId)) {
    return { ok: false, error: "Lesson not found" };
  }

  const existing = getNote(db, userId, lessonId);

  if (existing) {
    const note = db
      .update(notes)
      .set({ body: trimmed, updatedAt: now.toISOString() })
      .where(eq(notes.id, existing.id))
      .returning()
      .get();
    return { ok: true, note };
  }

  const note = db
    .insert(notes)
    .values({
      userId,
      lessonId,
      body: trimmed,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .returning()
    .get();
  return { ok: true, note };
}

/** The Student's own Bookmarks, newest first. */
export function listBookmarks(db: Db, userId: number) {
  return db
    .select({ id: bookmarks.id, createdAt: bookmarks.createdAt, ...lessonColumns })
    .from(bookmarks)
    .innerJoin(lessons, eq(lessons.id, bookmarks.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt))
    .all();
}

/** The Student's own Notes, most recently edited first. */
export function listNotes(db: Db, userId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      ...lessonColumns,
    })
    .from(notes)
    .innerJoin(lessons, eq(lessons.id, notes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .all();
}
