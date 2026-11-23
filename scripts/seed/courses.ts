import * as schema from "../../app/db/schema";
import { markdown } from "../../app/lib/text";
import { buildingRestApisWithNodejs } from "./courses/building-rest-apis-with-nodejs";
import { designSystemsCourse } from "./courses/design-systems-with-tailwind";
import { typescriptCourse } from "./courses/introduction-to-typescript";
import { dataVisualisationCourse } from "./courses/practical-data-visualisation";
import { dockerKubernetesCourse } from "./courses/shipping-with-docker-and-kubernetes";
import type { CourseSpec, ModuleSpec } from "./courses/types";
import { db } from "./db";
import { daysAgo } from "./helpers";
import type { SeededUsers } from "./users";

// Inserts a course's modules and lessons in order and returns the lesson ids,
// flattened module by module. Positions are 1-based.
function insertCourseContent(
  courseId: number,
  moduleSpecs: ModuleSpec[],
  startDaysAgo: number
): number[] {
  const lessonIds: number[] = [];

  for (let mi = 0; mi < moduleSpecs.length; mi++) {
    const modData = moduleSpecs[mi];
    const [mod] = db
      .insert(schema.modules)
      .values({
        courseId,
        title: modData.title,
        position: mi + 1,
        createdAt: daysAgo(startDaysAgo - mi),
      })
      .returning()
      .all();

    for (let li = 0; li < modData.lessons.length; li++) {
      const lessonData = modData.lessons[li];
      const [lesson] = db
        .insert(schema.lessons)
        .values({
          moduleId: mod.id,
          title: lessonData.title,
          content: lessonData.content ? markdown(lessonData.content) : null,
          videoUrl: lessonData.videoUrl ?? null,
          githubRepoUrl: lessonData.githubRepoUrl ?? null,
          position: li + 1,
          durationMinutes: lessonData.duration,
          createdAt: daysAgo(startDaysAgo - mi),
        })
        .returning()
        .all();
      lessonIds.push(lesson.id);
    }
  }

  return lessonIds;
}

function insertCourse(
  spec: CourseSpec,
  instructorId: number,
  categoryBySlug: Record<string, { id: number }>
) {
  const category = categoryBySlug[spec.categorySlug];
  if (!category) throw new Error(`No seeded category ${spec.categorySlug}`);

  const [course] = db
    .insert(schema.courses)
    .values({ ...spec.course, instructorId, categoryId: category.id })
    .returning()
    .all();

  const lessonIds = insertCourseContent(
    course.id,
    spec.modules,
    spec.contentStartDaysAgo
  );

  console.log(
    `Created ${course.status} course "${course.title}" with ${spec.modules.length} modules and ${lessonIds.length} lessons.`
  );

  return { course, lessonIds };
}

export type SeededCourse = ReturnType<typeof insertCourse>;

export function seedCourses(
  { instructor1, instructor2 }: SeededUsers,
  categoryBySlug: Record<string, { id: number }>
) {
  return {
    course1: insertCourse(typescriptCourse, instructor1.id, categoryBySlug),
    course2: insertCourse(
      buildingRestApisWithNodejs,
      instructor2.id,
      categoryBySlug
    ),
    course3: insertCourse(designSystemsCourse, instructor1.id, categoryBySlug),
    course4: insertCourse(
      dataVisualisationCourse,
      instructor2.id,
      categoryBySlug
    ),
    course5: insertCourse(
      dockerKubernetesCourse,
      instructor2.id,
      categoryBySlug
    ),
  };
}
