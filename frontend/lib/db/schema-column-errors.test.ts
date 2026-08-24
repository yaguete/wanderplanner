import assert from "node:assert/strict"
import {
  isMissingBudgetColumnError,
  isMissingVersionColumnError,
  isSchemaCacheError,
} from "./schema-column-errors"

const versionPgrst = {
  code: "PGRST204",
  message: "Could not find the 'version' column of 'trips' in the schema cache",
}
assert.equal(isMissingVersionColumnError(versionPgrst), true)
assert.equal(isSchemaCacheError(versionPgrst), true)
assert.equal(isMissingBudgetColumnError(versionPgrst), false)

const budgetPgrst = {
  code: "PGRST204",
  message: "Could not find the 'budget' column of 'trips' in the schema cache",
}
assert.equal(isMissingBudgetColumnError(budgetPgrst), true)
assert.equal(isMissingVersionColumnError(budgetPgrst), false)

const codeOnly = { code: "PGRST204", message: "" }
assert.equal(isMissingVersionColumnError(codeOnly), false)
assert.equal(isSchemaCacheError(codeOnly), true)

const pgUndefined = {
  code: "42703",
  message: "column trips.version does not exist",
}
assert.equal(isMissingVersionColumnError(pgUndefined), true)

const rls = { code: "42501", message: "permission denied for table trips" }
assert.equal(isSchemaCacheError(rls), false)
assert.equal(isMissingVersionColumnError(rls), false)

console.log("schema-column-errors: ok")
