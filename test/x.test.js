import test from "node:test";
import assert from "node:assert/strict";
import { describeXError } from "../src/x.js";

test("X errors expose useful API details without serializing request data", () => {
  const description = describeXError({
    code: 403,
    message: "Request failed with code 403",
    request: { headers: { authorization: "secret" } },
    data: {
      title: "Forbidden",
      detail: "Client is not permitted to perform this action.",
      type: "https://api.x.com/2/problems/client-forbidden",
      errors: [{ message: "App permissions do not allow this request.", value: "secret" }],
    },
  });

  assert.match(description, /HTTP 403/u);
  assert.match(description, /Forbidden/u);
  assert.match(description, /App permissions/u);
  assert.doesNotMatch(description, /secret/u);
  assert.doesNotMatch(description, /authorization/u);
});
