# Project Model: `permissibleActions` Property

## Overview

The `permissibleActions` property on the `Project` model provides a list of actions that the current authenticated user is authorized to perform on a given project. This property is dynamically computed on the backend and exposed via the GraphQL API, ensuring that only actions permitted by the backend authorization logic are visible to the frontend. This mechanism prevents unauthorized UI elements from being shown and supports robust security practices.

---

## GraphQL Schema

The property is defined in the GraphQL schema as follows:

```graphql
type Project {
  ...
  permissibleActions: [String!]!
}
```

- **Type:** Non-nullable list of non-nullable strings.
- **Presence:** Always present in the Project object returned by the API.

---

## Structure

- The property is an array of strings, each representing an action the user may perform.
- The set of possible actions is determined by the user's role in the project and the project's current status.

---

## Permissible Actions

### Action Definitions

| Action           | Description                                      |
|------------------|--------------------------------------------------|
| publish          | Create a final version PDF of the project        |
| resolveComment   | Mark a comment as resolved                       |
| writeComment     | Add a new comment to the project                 |
| writeReply       | Reply to an existing comment                     |
| update           | Edit project details and content (only when project is not published or archived) |
| delete           | Permanently remove the project (only when project is not published or archived)   |

---

## Population Logic

The value of `permissibleActions` is determined by the backend using the following logic (see [`getPermissibleActions`](../apps/backend/src/lib/permissions.ts:9)):

### 1. User and Project Validation

- If the project or user is missing, returns an empty list.
- If the project status is `ARCHIVED`, returns an empty list (no actions are permitted).

### 2. User Role Determination

- The user's role is determined from the `users` array on the project (`OWNER` or `REVIEWER`).

### 3. Action Assignment

- **OWNER:**
  - If project status is `DRAFT`:
    `["publish", "resolveComment", "writeComment", "writeReply", "update", "delete"]`
  - If project status is `PUBLISHED`:
    `["publish", "resolveComment", "writeComment", "writeReply"]`
  - If project status is `ARCHIVED`:
    `[]` (no actions permitted)
- **REVIEWER:**
  - If project status is `DRAFT` or `PUBLISHED`:
    `["writeComment", "writeReply"]`
  - If project status is `ARCHIVED`:
    `[]` (no actions permitted)
- If the user is not found in the project, returns an empty list.

---

## Summary Table

| Role      | Project Status | Permissible Actions                                      |
|-----------|---------------|---------------------------------------------------------|
| OWNER     | DRAFT         | publish, resolveComment, writeComment, writeReply, update, delete |
| OWNER     | PUBLISHED     | publish, resolveComment, writeComment, writeReply       |
| OWNER     | ARCHIVED      | _(none)_                                                |
| REVIEWER  | DRAFT         | writeComment, writeReply                                |
| REVIEWER  | PUBLISHED     | writeComment, writeReply                                |
| REVIEWER  | ARCHIVED      | _(none)_                                                |

---

## Notes

- There is **no** "unpublish", "edit", or "view" action.
- "update" and "delete" are only available to owners when the project status is `DRAFT`. They are never available for reviewers or for any role when the project is `PUBLISHED` or `ARCHIVED`.
- "publish" means creating a final version PDF of the project.
- If the project is archived, **no actions** are permitted for any user.
- Only the actions listed above are ever returned by the API.
