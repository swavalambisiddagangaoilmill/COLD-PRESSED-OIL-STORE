export default function DevelopmentRenderError() {
  const testId = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("__test_render_error") : null;
  if (testId && sessionStorage.getItem(`render_error_recovered:${testId}`) !== "1") {
    throw new Error("Controlled render recovery test");
  }
  return null;
}
