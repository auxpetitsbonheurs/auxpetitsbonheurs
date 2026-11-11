/** The parts of `useNavigation()` / a fetcher that tell whether a submission is in flight. */
export interface SubmissionState {
  state: "idle" | "loading" | "submitting";
  formData?: FormData | undefined;
}

/**
 * True from the tap until the resulting page has loaded: `submitting` while the action
 * runs, then `loading` (with the form data kept) while a redirect's next page loads.
 */
export function isPendingIntent(submission: SubmissionState, intent: string): boolean {
  return submission.state !== "idle" && submission.formData?.get("intent") === intent;
}
