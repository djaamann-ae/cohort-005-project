import ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildingRestApisWithNodejs } from "./building-rest-apis-with-nodejs";

function lessonContent(title: string): string {
  const lesson = buildingRestApisWithNodejs.modules
    .flatMap((module) => module.lessons)
    .find((candidate) => candidate.title === title);
  if (!lesson?.content) throw new Error(`No lesson content for "${title}"`);
  return lesson.content;
}

function javascriptExamples(markdown: string): string[] {
  return [...markdown.matchAll(/```javascript\n([\s\S]*?)```/g)].map(
    (match) => match[1]
  );
}

function syntaxErrors(code: string): string[] {
  const { diagnostics = [] } = ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: { allowJs: true },
    fileName: "example.js",
  });
  return diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  );
}

// A learner reported the JWT lesson's explanations as wrong: it issued tokens
// without checking the password and never showed how to verify one.
describe("JWT Authentication lesson", () => {
  const content = lessonContent("JWT Authentication");
  const examples = javascriptExamples(content);
  const login = examples.find((code) => code.includes("/api/login")) ?? "";
  const middleware =
    examples.find((code) => code.includes("function authenticate")) ?? "";

  it("has examples that parse as JavaScript", () => {
    expect(examples.length).toBeGreaterThanOrEqual(3);
    for (const code of examples) {
      expect(syntaxErrors(code)).toEqual([]);
    }
  });

  it("checks the password before it signs a token", () => {
    expect(login).toContain("bcrypt.compare(");
    expect(login.indexOf("bcrypt.compare(")).toBeLessThan(
      login.indexOf("jwt.sign(")
    );
    expect(login).toContain("status(401)");
  });

  it("issues short-lived tokens", () => {
    expect(login).toMatch(/expiresIn: '\d+m'/);
  });

  it("verifies the token, with the algorithm pinned, on each request", () => {
    expect(middleware).toContain("jwt.verify(");
    expect(middleware).toContain("algorithms: ['HS256']");
    expect(middleware).toContain("status(401)");
  });

  it("explains that the payload is readable by anyone", () => {
    expect(content).toContain("signed, not encrypted");
  });
});

describe("Building REST APIs with Node.js", () => {
  it("never signs tokens with a hard-coded fallback secret", () => {
    const allExamples = buildingRestApisWithNodejs.modules
      .flatMap((module) => module.lessons)
      .flatMap((lesson) => javascriptExamples(lesson.content ?? ""));

    for (const code of allExamples) {
      expect(code).not.toMatch(/JWT_SECRET\s*(\|\||\?\?)/);
    }
  });
});
