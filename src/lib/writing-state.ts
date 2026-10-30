type Content = { title: string; body: string };
type Draft = Content & { updated_at: string };
type Submission = Content & { created_at: string };

// Keep the draft revision separately for the next guarded write. A stale draft
// must never replace a newer immutable submission when the editor opens.
export function initialWritingState(draft?: Draft, submission?: Submission) {
  const useDraft = draft && (!submission || Date.parse(draft.updated_at) > Date.parse(submission.created_at));
  const source = useDraft ? draft : submission;
  return {
    content: { title: source?.title ?? "", body: source?.body ?? "" },
    savedAt: useDraft ? draft.updated_at : submission?.created_at ?? null,
  };
}
