import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { syncAllUsers } from "../app/lib/notification-preferences.server";
import { defaultNotifications } from "../app/lib/notifications.server";
import { seedCourses } from "./seed/courses";
import { db, resetDatabase } from "./seed/db";
import { seedGeneratedHistory } from "./seed/generated-history";
import { seedNarrative } from "./seed/narrative";
import { seedPurchases, seedTeamsAndRefunds } from "./seed/purchases";
import { seedQuizAttempts, seedQuizzes } from "./seed/quizzes";
import { logSummary } from "./seed/summary";
import { seedCategories, seedUsers } from "./seed/users";
import { createWatchEvents, seedNamedWatchSessions } from "./seed/watch-events";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Runs under tsx, not Vite, so load .env for the Knock keys ourselves.
const envFile = path.resolve(__dirname, "../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

// The steps run in this order on purpose: row ids, and the draws from the
// generated history's fixed PRNG, depend on it.
async function seed() {
  console.log("Seeding database...");

  resetDatabase();
  console.log("Tables created.");

  const users = seedUsers();
  const categoryBySlug = seedCategories();
  const courses = seedCourses(users, categoryBySlug);
  const { course1, course2, course3 } = courses;

  const quizzes = seedQuizzes(course1.lessonIds, course2.lessonIds);
  seedNarrative(users, course1, course2);
  seedQuizAttempts(users, quizzes);

  const watchEvents = createWatchEvents();
  seedNamedWatchSessions(
    watchEvents,
    users,
    course1.lessonIds,
    course2.lessonIds
  );

  seedPurchases(users, course1.course, course2.course);
  seedGeneratedHistory(users, courses, watchEvents);
  seedTeamsAndRefunds(users, course1, course3.course);
  watchEvents.flush();

  logSummary();

  // ─── Sync users to Knock ───
  // Name, email, avatar, and default preferences for anyone without a set.
  if (process.env.KNOCK_SECRET_API_KEY) {
    const synced = await syncAllUsers(db, await defaultNotifications());
    console.log(`  Synced ${synced} users to Knock.`);
  } else {
    console.log("  Skipped Knock user sync: KNOCK_SECRET_API_KEY is not set.");
  }
}

seed().catch(console.error);
