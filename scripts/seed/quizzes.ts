import * as schema from "../../app/db/schema";
import { QuestionType } from "../../app/db/schema";
import { countRows, db } from "./db";
import { daysAgo } from "./helpers";
import type { SeededUsers } from "./users";

type QuestionSpec = {
  text: string;
  type: QuestionType;
  options: { text: string; correct: boolean }[];
};

type SeededOption = { questionId: number; optionId: number; correct: boolean };

function insertQuiz(
  values: { lessonId: number; title: string; passingScore: number },
  questions: QuestionSpec[]
) {
  const [quiz] = db.insert(schema.quizzes).values(values).returning().all();

  const optionIds: SeededOption[] = [];

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const [question] = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: q.text,
        questionType: q.type,
        position: qi + 1,
      })
      .returning()
      .all();

    for (const opt of q.options) {
      const [option] = db
        .insert(schema.quizOptions)
        .values({
          questionId: question.id,
          optionText: opt.text,
          isCorrect: opt.correct,
        })
        .returning()
        .all();
      optionIds.push({
        questionId: question.id,
        optionId: option.id,
        correct: opt.correct,
      });
    }
  }

  return { quiz, optionIds };
}

// Adds quizzes to some lessons in courses 1 and 2.
export function seedQuizzes(
  course1LessonIds: number[],
  course2LessonIds: number[]
) {
  // Quiz 1: TypeScript Basics Quiz (attached to "Your First TypeScript Program", lesson 3 of course 1)
  const quiz1 = insertQuiz(
    {
      lessonId: course1LessonIds[2], // "Your First TypeScript Program"
      title: "TypeScript Basics Quiz",
      passingScore: 0.7,
    },
    [
      {
        text: "What does TypeScript compile to?",
        type: QuestionType.MultipleChoice,
        options: [
          { text: "JavaScript", correct: true },
          { text: "WebAssembly", correct: false },
          { text: "Java bytecode", correct: false },
          { text: "Machine code", correct: false },
        ],
      },
      {
        text: "TypeScript is a superset of JavaScript.",
        type: QuestionType.TrueFalse,
        options: [
          { text: "True", correct: true },
          { text: "False", correct: false },
        ],
      },
      {
        text: "Which file configures the TypeScript compiler?",
        type: QuestionType.MultipleChoice,
        options: [
          { text: "tsconfig.json", correct: true },
          { text: "package.json", correct: false },
          { text: "typescript.config.js", correct: false },
          { text: ".tsrc", correct: false },
        ],
      },
    ]
  );

  // Quiz 2: Generics Quiz (attached to "Generics Basics", lesson index 5 in course 1)
  const quiz2 = insertQuiz(
    {
      lessonId: course1LessonIds[7], // "Generics Basics" (module 3, lesson 2)
      title: "Generics Knowledge Check",
      passingScore: 0.6,
    },
    [
      {
        text: "What is the primary benefit of generics?",
        type: QuestionType.MultipleChoice,
        options: [
          { text: "Code reusability with type safety", correct: true },
          { text: "Faster execution speed", correct: false },
          { text: "Smaller bundle size", correct: false },
          { text: "Better error messages", correct: false },
        ],
      },
      {
        text: "Generic type parameters can be constrained using the 'extends' keyword.",
        type: QuestionType.TrueFalse,
        options: [
          { text: "True", correct: true },
          { text: "False", correct: false },
        ],
      },
    ]
  );

  // Quiz 3: REST API Basics (attached to "HTTP Methods and Status Codes", lesson index 2 in course 2)
  const quiz3 = insertQuiz(
    {
      lessonId: course2LessonIds[2], // "HTTP Methods and Status Codes"
      title: "HTTP Methods Quiz",
      passingScore: 0.7,
    },
    [
      {
        text: "Which HTTP method is used to create a new resource?",
        type: QuestionType.MultipleChoice,
        options: [
          { text: "POST", correct: true },
          { text: "GET", correct: false },
          { text: "PUT", correct: false },
          { text: "PATCH", correct: false },
        ],
      },
      {
        text: "A 404 status code means the server encountered an internal error.",
        type: QuestionType.TrueFalse,
        options: [
          { text: "True", correct: false },
          { text: "False", correct: true },
        ],
      },
      {
        text: "Which status code indicates successful resource creation?",
        type: QuestionType.MultipleChoice,
        options: [
          { text: "201 Created", correct: true },
          { text: "200 OK", correct: false },
          { text: "204 No Content", correct: false },
          { text: "202 Accepted", correct: false },
        ],
      },
    ]
  );

  console.log(
    `Created ${countRows(schema.quizzes)} quizzes with ${countRows(schema.quizQuestions)} questions and ${countRows(schema.quizOptions)} options.`
  );

  return { quiz1, quiz2, quiz3 };
}

type SeededQuizzes = ReturnType<typeof seedQuizzes>;

export function seedQuizAttempts(
  { students }: SeededUsers,
  { quiz1, quiz2, quiz3 }: SeededQuizzes
) {
  // Helper to record a quiz attempt with answers
  function recordQuizAttempt(
    userId: number,
    quizId: number,
    optionIds: SeededOption[],
    selectedCorrectIndices: number[], // which questions (0-based) the student got right
    attemptDaysAgo: number
  ) {
    const totalQuestions = new Set(optionIds.map((o) => o.questionId)).size;
    const correctCount = selectedCorrectIndices.length;
    const score = correctCount / totalQuestions;

    // Determine passing based on quiz passingScore (we'll just use 0.7 as default)
    const passed = score >= 0.7;

    const [attempt] = db
      .insert(schema.quizAttempts)
      .values({
        userId,
        quizId,
        score,
        passed,
        attemptedAt: daysAgo(attemptDaysAgo),
      })
      .returning()
      .all();

    // Build answer selections
    const questionIds = [...new Set(optionIds.map((o) => o.questionId))];
    for (let qi = 0; qi < questionIds.length; qi++) {
      const qId = questionIds[qi];
      const qOptions = optionIds.filter((o) => o.questionId === qId);
      // Pick a correct answer for the questions answered correctly, a wrong
      // one for the rest
      const wantCorrect = selectedCorrectIndices.includes(qi);
      const selectedOption = qOptions.find((o) => o.correct === wantCorrect);
      if (!selectedOption) {
        throw new Error(
          `Question ${qId} has no ${wantCorrect ? "correct" : "wrong"} option`
        );
      }

      db.insert(schema.quizAnswers)
        .values({
          attemptId: attempt.id,
          questionId: qId,
          selectedOptionId: selectedOption.optionId,
        })
        .run();
    }
  }

  // Emma — passed quiz 1 (3/3 correct)
  recordQuizAttempt(
    students[0].id,
    quiz1.quiz.id,
    quiz1.optionIds,
    [0, 1, 2],
    35
  );

  // Emma — passed quiz 2 (2/2 correct)
  recordQuizAttempt(students[0].id, quiz2.quiz.id, quiz2.optionIds, [0, 1], 30);

  // Emma — passed quiz 3 (2/3 correct, just barely at 67% with 70% passing = fail, then retake)
  recordQuizAttempt(students[0].id, quiz3.quiz.id, quiz3.optionIds, [0, 2], 28);
  // Retake — all correct
  recordQuizAttempt(
    students[0].id,
    quiz3.quiz.id,
    quiz3.optionIds,
    [0, 1, 2],
    27
  );

  // James — passed quiz 1 (3/3 correct)
  recordQuizAttempt(
    students[1].id,
    quiz1.quiz.id,
    quiz1.optionIds,
    [0, 1, 2],
    40
  );

  // James — passed quiz 2 (2/2 correct)
  recordQuizAttempt(students[1].id, quiz2.quiz.id, quiz2.optionIds, [0, 1], 35);

  // Olivia — failed quiz 1 first attempt (1/3 correct), then passed on retry (3/3)
  recordQuizAttempt(students[2].id, quiz1.quiz.id, quiz1.optionIds, [0], 25);
  recordQuizAttempt(
    students[2].id,
    quiz1.quiz.id,
    quiz1.optionIds,
    [0, 1, 2],
    24
  );

  // Olivia — passed quiz 3 (3/3 correct)
  recordQuizAttempt(
    students[2].id,
    quiz3.quiz.id,
    quiz3.optionIds,
    [0, 1, 2],
    20
  );

  // Sophia — failed quiz 1 (1/3 correct, hasn't retaken yet)
  recordQuizAttempt(students[4].id, quiz1.quiz.id, quiz1.optionIds, [1], 10);

  console.log(
    `Created ${countRows(schema.quizAttempts)} quiz attempts and ${countRows(schema.quizAnswers)} answers.`
  );
}
