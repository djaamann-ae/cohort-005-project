import type * as schema from "../../../app/db/schema";

export type LessonSpec = {
  title: string;
  duration: number;
  videoUrl?: string;
  githubRepoUrl?: string;
  content?: string;
};

export type ModuleSpec = { title: string; lessons: LessonSpec[] };

// A course as the seed writes it. The instructor is chosen by the caller; the
// category is named by slug and resolved once categories exist.
export type CourseSpec = {
  course: Omit<
    typeof schema.courses.$inferInsert,
    "instructorId" | "categoryId"
  >;
  categorySlug: string;
  // Modules are dated one day apart, counting forward from this many days ago.
  contentStartDaysAgo: number;
  modules: ModuleSpec[];
};
