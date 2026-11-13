import { z } from "zod";
export const generatedQuizSchema = z.object({
  questions: z
    .array(
      z.object({
        label: z.string().min(1).max(500),
        options: z.array(z.string().min(1).max(200)).min(2).max(4),
        answer: z.number().int().min(0).max(3),
        explanation: z.string().min(1).max(700),
        evidence: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(3),
});
export function verifiedQuiz(source: string, value: unknown) {
  const v = generatedQuizSchema.parse(value);
  for (const q of v.questions)
    if (
      q.answer >= q.options.length ||
      !source.replace(/\s+/g, " ").includes(q.evidence.replace(/\s+/g, " "))
    )
      throw Error("QUIZ_SOURCE_MISMATCH");
  return v.questions.map((q, i) => ({
    id: "q" + (i + 1),
    kind: "choice" as const,
    label: q.label,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation + " · 근거: " + q.evidence,
  }));
}
