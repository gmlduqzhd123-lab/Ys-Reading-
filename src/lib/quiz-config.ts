import "server-only";
export function quizAiReady() {
  return (
    process.env.BOOKFOREST_AI_QUIZ_ENABLED === "true" &&
    !!process.env.BOOKFOREST_AI_MODEL &&
    (!!process.env.AI_GATEWAY_API_KEY || !!process.env.VERCEL_OIDC_TOKEN)
  );
}
