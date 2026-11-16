import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";
import { MAX_NOTE_LENGTH } from "./saved";
import { approveRefundRequest, raiseRefundRequest } from "./refunds.server";
import {
  fakeNotifications,
  type FakeNotifications,
} from "./notifications.fake.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];
let notifications: FakeNotifications;

beforeEach(() => {
  db = createTestDb();
  notifications = fakeNotifications();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function countBookmarks(userId: number) {
  return db
    .select()
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.userId, userId))
    .all().length;
}

function countNotes(userId: number) {
  return db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.userId, userId))
    .all().length;
}

describe("bookmarking a Lesson", () => {
  it("flags a Lesson that was not bookmarked", () => {
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);

    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
  });

  it("removes the Bookmark when the same Lesson is toggled again", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], LATER)).toBe(false);

    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
    expect(countBookmarks(base.user.id)).toBe(0);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[0], LATER);
    toggleBookmark(db, base.user.id, lessonIds[0], LATER);

    expect(countBookmarks(base.user.id)).toBe(1);
  });

  it("keeps one Student's Bookmark separate from another's", () => {
    const other = addStudent("Mira");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(isBookmarked(db, other.id, lessonIds[0])).toBe(false);
  });
});

describe("saving a Note", () => {
  it("writes a Note on a Lesson that had none, with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "  Watch this one again.  ",
      NOW
    );

    expect(result).toMatchObject({
      ok: true,
      note: {
        userId: base.user.id,
        lessonId: lessonIds[0],
        body: "Watch this one again.",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thoughts.", NOW);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "Second thoughts.",
      LATER
    );

    expect(result).toMatchObject({
      ok: true,
      note: {
        body: "Second thoughts.",
        createdAt: NOW.toISOString(),
        updatedAt: LATER.toISOString(),
      },
    });
    expect(countNotes(base.user.id)).toBe(1);
  });

  it("never leaves a Student with two Notes on one Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "One.", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Two.", LATER);
    saveNote(db, base.user.id, lessonIds[0], "Three.", LATER);

    expect(countNotes(base.user.id)).toBe(1);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Three.");
  });

  it("accepts a Note of exactly the cap", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW)).toMatchObject({
      ok: true,
      note: { body },
    });
  });

  it("refuses a Note one character over the cap, rather than truncating it", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH + 1);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW)).toEqual({
      ok: false,
      error: `Note must be ${MAX_NOTE_LENGTH} characters or fewer`,
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("refuses a body that is only whitespace", () => {
    expect(saveNote(db, base.user.id, lessonIds[0], "   ", NOW)).toEqual({
      ok: false,
      error: "Note cannot be empty",
    });
  });

  it("refuses a Note on a Lesson that does not exist", () => {
    expect(saveNote(db, base.user.id, 9999, "Anywhere.", NOW)).toEqual({
      ok: false,
      error: "Lesson not found",
    });
  });

  it("keeps the text exactly as typed, including Markdown characters", () => {
    const body = "# not a heading\n* not a bullet";

    const result = saveNote(db, base.user.id, lessonIds[0], body, NOW);

    expect(result).toMatchObject({ ok: true, note: { body } });
  });
});

describe("the Saved lists", () => {
  it("lists the Student's Bookmarks newest first, with Lesson and Course", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[1], LATER);

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      { lessonId: lessonIds[1], lessonTitle: "Lesson 2", courseTitle: "Test Course", courseSlug: "test-course", moduleTitle: "Basics" },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1" },
    ]);
  });

  it("lists the Student's Notes most recently edited first", () => {
    saveNote(db, base.user.id, lessonIds[0], "On lesson one.", NOW);
    saveNote(db, base.user.id, lessonIds[1], "On lesson two.", LATER);

    expect(listNotes(db, base.user.id)).toMatchObject([
      { lessonId: lessonIds[1], body: "On lesson two.", lessonTitle: "Lesson 2", courseTitle: "Test Course" },
      { lessonId: lessonIds[0], body: "On lesson one." },
    ]);
  });

  it("re-saving an older Note moves it to the top", () => {
    saveNote(db, base.user.id, lessonIds[0], "On lesson one.", NOW);
    saveNote(db, base.user.id, lessonIds[1], "On lesson two.", NOW);
    saveNote(db, base.user.id, lessonIds[0], "Revisited.", LATER);

    expect(listNotes(db, base.user.id)[0]).toMatchObject({
      lessonId: lessonIds[0],
      body: "Revisited.",
    });
  });

  it("shows one Student only their own rows", () => {
    const other = addStudent("Mira");
    toggleBookmark(db, other.id, lessonIds[0], NOW);
    saveNote(db, other.id, lessonIds[0], "Mira's private note.", NOW);
    toggleBookmark(db, base.user.id, lessonIds[1], NOW);
    saveNote(db, base.user.id, lessonIds[1], "My own note.", NOW);

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      { lessonId: lessonIds[1] },
    ]);
    expect(listNotes(db, base.user.id)).toMatchObject([
      { body: "My own note." },
    ]);
  });

  it("is empty for a Student who has saved nothing", () => {
    expect(listBookmarks(db, base.user.id)).toEqual([]);
    expect(listNotes(db, base.user.id)).toEqual([]);
  });
});

describe("after a Refund is approved", () => {
  it("keeps the Student's Bookmarks and Notes", async () => {
    const platformAdmin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();

    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: new Date(2026, 9, 3, 12, 0, 0).toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "Worth keeping.", NOW);

    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);

    const result = await approveRefundRequest(
      db,
      raised.refundRequestId,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(result.ok).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("Worth keeping.");
  });
});
