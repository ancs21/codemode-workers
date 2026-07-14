import { defineMeta } from "blume";

// index comes first automatically; this fixes the order of the rest.
export default defineMeta({
  pages: [
    "getting-started",
    "example-petstore",
    "how-it-works",
    "api-reference",
    "security",
    "evals",
  ],
});
