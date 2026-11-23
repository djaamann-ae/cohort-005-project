import { eq, isNotNull, isNull } from "drizzle-orm";
import * as schema from "../../app/db/schema";
import {
  LessonProgressStatus,
  RefundStatus,
  TeamMemberRole,
} from "../../app/db/schema";
import type { SeededCourse } from "./courses";
import { countRows, db } from "./db";
import { daysAgo } from "./helpers";
import type { SeededUsers } from "./users";

// Individual purchases for the named students, and Bossy McBossface's team.
export function seedPurchases(
  { students, bossy, studentByEmail }: SeededUsers,
  course1: SeededCourse["course"],
  course2: SeededCourse["course"]
) {
  db.insert(schema.purchases)
    .values({
      userId: students[0].id, // Emma — bought course 1 individually
      courseId: course1.id,
      amountPaid: 7900,
      country: "US",
      createdAt: daysAgo(50),
    })
    .returning()
    .all();

  db.insert(schema.purchases)
    .values({
      userId: students[0].id, // Emma — bought course 2 individually
      courseId: course2.id,
      amountPaid: 5999,
      country: "US",
      createdAt: daysAgo(40),
    })
    .run();

  db.insert(schema.purchases)
    .values({
      userId: students[1].id, // James — bought course 1 with PPP discount (India)
      courseId: course1.id,
      amountPaid: 2500,
      country: "IN",
      createdAt: daysAgo(45),
    })
    .run();

  db.insert(schema.purchases)
    .values({
      userId: students[2].id, // Olivia — bought course 1 individually
      courseId: course1.id,
      amountPaid: 7900,
      country: "US",
      createdAt: daysAgo(35),
    })
    .run();

  db.insert(schema.purchases)
    .values({
      userId: students[4].id, // Sophia — bought course 1 individually
      courseId: course1.id,
      amountPaid: 7900,
      country: "US",
      createdAt: daysAgo(15),
    })
    .run();

  console.log(`Created ${countRows(schema.purchases)} individual purchases.`);

  // ─── Teams, Team Members, and Coupons ───
  // Bossy McBossface bought 5 team seats for course 2; Olivia and Liam redeemed coupons

  const [team1] = db
    .insert(schema.teams)
    .values({ createdAt: daysAgo(30) })
    .returning()
    .all();

  db.insert(schema.teamMembers)
    .values({
      teamId: team1.id,
      userId: bossy.id,
      role: TeamMemberRole.Admin,
      createdAt: daysAgo(30),
    })
    .run();

  // Team purchase by Bossy McBossface for course 2 (5 seats)
  const [teamPurchase] = db
    .insert(schema.purchases)
    .values({
      userId: bossy.id,
      courseId: course2.id,
      amountPaid: 5999 * 5,
      country: "US",
      createdAt: daysAgo(30),
    })
    .returning()
    .all();

  // Generate 5 coupons for the team purchase
  const couponCodes = [
    "TEAM-NODEJS-A1B2C3",
    "TEAM-NODEJS-D4E5F6",
    "TEAM-NODEJS-G7H8I9",
    "TEAM-NODEJS-J0K1L2",
    "TEAM-NODEJS-M3N4O5",
  ];

  const seededCoupons = db
    .insert(schema.coupons)
    .values(
      couponCodes.map((code) => ({
        teamId: team1.id,
        courseId: course2.id,
        code,
        purchaseId: teamPurchase.id,
        createdAt: daysAgo(30),
      }))
    )
    .returning()
    .all();

  // Redeem 2 of the 5 coupons. Redeemers are named by email, not by position in
  // the students array — position would silently re-point these redemptions at
  // different people the moment a student is inserted rather than appended.
  // Both already have an enrolment for course 2 from narrative.ts.
  db.update(schema.coupons)
    .set({
      redeemedByUserId: studentByEmail("olivia.martinez@student.dev").id,
      redeemedAt: daysAgo(30),
    })
    .where(eq(schema.coupons.id, seededCoupons[0].id))
    .run();

  db.update(schema.coupons)
    .set({
      redeemedByUserId: studentByEmail("liam@example.com").id,
      redeemedAt: daysAgo(25),
    })
    .where(eq(schema.coupons.id, seededCoupons[1].id))
    .run();

  console.log(
    `Created 1 team with Bossy McBossface as admin, 1 team purchase, and ${seededCoupons.length} coupons (${countRows(schema.coupons, isNotNull(schema.coupons.redeemedByUserId))} redeemed, ${countRows(schema.coupons, isNull(schema.coupons.redeemedByUserId))} available).`
  );
}

// Two more team purchases, then the two open refund requests.
export function seedTeamsAndRefunds(
  { studentByEmail }: SeededUsers,
  { course: course1, lessonIds: course1LessonIds }: SeededCourse,
  course3: SeededCourse["course"]
) {
  // ─── Further team purchases ───
  // Two more seat purchases so team revenue is not a single row, in mixed
  // redemption states: one team most of the way through its seats, one that has
  // bought and redeemed nothing yet.

  function createTeamPurchase(
    adminEmail: string,
    course: SeededCourse["course"],
    seats: number,
    codePrefix: string,
    purchasedDaysAgo: number,
    redeemerEmails: string[]
  ) {
    const teamAdmin = studentByEmail(adminEmail);

    const [team] = db
      .insert(schema.teams)
      .values({ createdAt: daysAgo(purchasedDaysAgo) })
      .returning()
      .all();

    db.insert(schema.teamMembers)
      .values({
        teamId: team.id,
        userId: teamAdmin.id,
        role: TeamMemberRole.Admin,
        createdAt: daysAgo(purchasedDaysAgo),
      })
      .run();

    const [purchase] = db
      .insert(schema.purchases)
      .values({
        userId: teamAdmin.id,
        courseId: course.id,
        amountPaid: course.price * seats,
        country: "US",
        createdAt: daysAgo(purchasedDaysAgo),
      })
      .returning()
      .all();

    const teamCoupons = db
      .insert(schema.coupons)
      .values(
        Array.from({ length: seats }, (_, i) => ({
          teamId: team.id,
          courseId: course.id,
          code: `${codePrefix}-${String(i + 1).padStart(2, "0")}`,
          purchaseId: purchase.id,
          createdAt: daysAgo(purchasedDaysAgo),
        }))
      )
      .returning()
      .all();

    // Redeemers named by email, for the reason given at the first team above.
    redeemerEmails.forEach((email, i) => {
      const redeemer = studentByEmail(email);
      const redeemedDaysAgo = Math.max(0, purchasedDaysAgo - (i + 1) * 2);

      db.update(schema.coupons)
        .set({
          redeemedByUserId: redeemer.id,
          redeemedAt: daysAgo(redeemedDaysAgo),
        })
        .where(eq(schema.coupons.id, teamCoupons[i].id))
        .run();

      db.insert(schema.teamMembers)
        .values({
          teamId: team.id,
          userId: redeemer.id,
          role: TeamMemberRole.Member,
          createdAt: daysAgo(redeemedDaysAgo),
        })
        .run();

      db.insert(schema.enrollments)
        .values({
          userId: redeemer.id,
          courseId: course.id,
          enrolledAt: daysAgo(redeemedDaysAgo),
        })
        .run();
    });

    return { team, purchase, coupons: teamCoupons };
  }

  // Eight seats on TypeScript, six redeemed.
  createTeamPurchase(
    "ava.nakamura@student.dev",
    course1,
    8,
    "TEAM-TS-NAKAMURA",
    120,
    [
      "noah.blackwood@student.dev",
      "isla.fernandes@student.dev",
      "ethan.okafor@student.dev",
      "mia.lindqvist@student.dev",
      "lucas.moreau@student.dev",
      "zara.haddad@student.dev",
    ]
  );

  // Four seats on Design Systems, bought during launch week, none redeemed yet.
  const novakLicence = createTeamPurchase(
    "marta.novak@student.dev",
    course3,
    4,
    "TEAM-DS-NOVAK",
    4,
    []
  );

  // ─── Liam's Refund Request ───
  // One learner with an Open Refund Request. The dates count back from
  // today, so the fourteen-day refund window is still open whenever you seed.

  const liam = studentByEmail("liam@example.com");
  const [liamPurchase] = db
    .insert(schema.purchases)
    .values({
      userId: liam.id,
      courseId: course1.id,
      amountPaid: 7900,
      country: null,
      createdAt: daysAgo(9),
    })
    .returning()
    .all();
  db.insert(schema.enrollments)
    .values({
      userId: liam.id,
      courseId: course1.id,
      enrolledAt: daysAgo(9),
    })
    .run();
  db.insert(schema.lessonProgress)
    .values([
      ...course1LessonIds.slice(0, 3).map((lessonId, i) => ({
        userId: liam.id,
        lessonId,
        status: LessonProgressStatus.Completed,
        completedAt: daysAgo(8 - i),
      })),
      {
        userId: liam.id,
        lessonId: course1LessonIds[3],
        status: LessonProgressStatus.InProgress,
        completedAt: null,
      },
    ])
    .run();
  db.insert(schema.courseRatings)
    .values({
      userId: liam.id,
      courseId: course1.id,
      rating: 4,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(6),
    })
    .run();
  db.insert(schema.refunds)
    .values({
      purchaseId: liamPurchase.id,
      status: RefundStatus.Open,
      reason: "Bought the wrong one, I meant the advanced course.",
      requestedAt: daysAgo(4),
    })
    .run();

  console.log("Created Liam's Refund Request.");

  // ─── Marta's Refund Request ───
  // A Team Licence with no Claimed Seats, so a Platform Admin can approve it.
  // Its Seats are on hold while the request is open.

  db.insert(schema.refunds)
    .values({
      purchaseId: novakLicence.purchase.id,
      status: RefundStatus.Open,
      reason:
        "Our design team was reorganised and nobody needs these seats now.",
      requestedAt: daysAgo(1),
    })
    .run();

  console.log("Created Marta's Refund Request on her Team Licence.");
}
