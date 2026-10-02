import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSiteProfile, siteFeaturesFor } from "../lib/site-profile";
import {
  ALL_TODO_CATEGORIES,
  TODO_CATEGORY_ICONS,
  TODO_CATEGORY_LABELS,
  emptyByCategory,
  isTodoCategory,
  normalizeTodoCategory,
  todoCategoriesFor,
} from "../lib/todo-category";

describe("site profile", () => {
  it("defaults to the full profile unless the variable says mom", () => {
    assert.equal(resolveSiteProfile(undefined), "default");
    assert.equal(resolveSiteProfile(""), "default");
    assert.equal(resolveSiteProfile("full"), "default");
    assert.equal(resolveSiteProfile("mom"), "mom");
    assert.equal(resolveSiteProfile(" MOM "), "mom");
  });

  it("turns the extras off for the mom profile only", () => {
    assert.deepEqual(siteFeaturesFor("default"), { affirmation: true, conversations: true, fullGoals: true });
    assert.deepEqual(siteFeaturesFor("mom"), { affirmation: false, conversations: false, fullGoals: false });
  });
});

describe("todo categories per profile", () => {
  it("shows school/personal by default and personal/group for mom", () => {
    assert.deepEqual(todoCategoriesFor("default"), ["school", "personal"]);
    assert.deepEqual(todoCategoriesFor("mom"), ["personal", "group"]);
  });

  it("has a label and icon for every key any profile can use", () => {
    for (const key of ALL_TODO_CATEGORIES) {
      assert.ok(TODO_CATEGORY_LABELS[key], key);
      assert.ok(TODO_CATEGORY_ICONS[key], key);
    }
    assert.equal(TODO_CATEGORY_LABELS.group, "모임");
  });

  it("validates against the given profile's categories", () => {
    const mom = todoCategoriesFor("mom");
    const def = todoCategoriesFor("default");
    assert.equal(isTodoCategory("group", mom), true);
    assert.equal(isTodoCategory("group", def), false);
    assert.equal(isTodoCategory("school", mom), false);
    assert.equal(isTodoCategory("school", def), true);
    assert.equal(isTodoCategory("personal", mom), true);
    assert.equal(isTodoCategory(42, def), false);
  });

  it("falls back to personal for unknown or foreign keys", () => {
    const mom = todoCategoriesFor("mom");
    const def = todoCategoriesFor("default");
    assert.equal(normalizeTodoCategory(undefined, def), "personal");
    assert.equal(normalizeTodoCategory("school", def), "school");
    assert.equal(normalizeTodoCategory("school", mom), "personal");
    assert.equal(normalizeTodoCategory("group", mom), "group");
    assert.equal(normalizeTodoCategory("group", def), "personal");
  });

  it("builds a record with every category key", () => {
    const record = emptyByCategory<string[]>(() => []);
    assert.deepEqual(Object.keys(record).sort(), [...ALL_TODO_CATEGORIES].sort());
    assert.notEqual(record.school, record.personal);
  });
});
