# Technical Specification: Todo List Sharing

| Field | Value |
| --- | --- |
| Status | Draft — v1 |
| Feature | Share an owner's todo list with Viewer or Editor access |
| Owner | Backend / Platform |
| Depends on | JWT auth, `todos` CRUD, Redis list cache |
| Out of scope (summary) | Per-todo shares, public links, email invites, nested re-share |

---

## 1. Overview & Objective

### 1.1 Feature summary

An authenticated owner can grant another registered user access to **their entire todo list** at one of two permission levels:

- **viewer** — read-only
- **editor** — create, update, and delete todos on that list

The owner can change permission or **revoke access at any time**. Revocation takes effect on the next authorized request and must drop related Redis cache immediately so a revoked collaborator cannot keep reading a stale list.

Todos remain owned by the original `todos.user_id`. Sharing grants access; it does not transfer ownership.

### 1.2 Problem statement

Today every todo endpoint is owner-only (`ensure_todo_owner`). Users cannot collaborate. This spec adds list-level ACL without turning `/todos` into a global feed.

### 1.3 Roles

| Role | Who | Capabilities |
| --- | --- | --- |
| **Owner** | `todos.user_id` | Full CRUD on own todos; grant, list, update, and revoke shares; cannot be demoted by a collaborator |
| **Viewer** | Grantee with `permission = viewer` | Read the owner's list and individual todos; cannot mutate; cannot grant further access |
| **Editor** | Grantee with `permission = editor` | Viewer rights plus create / update / delete todos **on the owner's list**; cannot grant, revoke, or change shares |
| **Unauthenticated** | No valid access JWT | No access |

There is no admin role in v1.

---

## 2. User Stories & Acceptance Criteria

### US-1: Owner shares a list as Viewer

- **As an** owner
- **I want to** share my todo list with another user as read-only
- **So that** they can see my items without changing them

**Acceptance criteria**

- [ ] Owner `POST /api/v1/todo-shares` with the grantee's email and `permission: "viewer"` and receives `201` with the share record.
- [ ] Grantee can `GET /api/v1/shared-lists` and see this owner.
- [ ] Grantee can `GET /api/v1/shared-lists/{owner_id}/todos` and `GET /api/v1/todos/{todo_id}` for that owner's items.
- [ ] Grantee `PUT` / `DELETE` / `POST` against that list returns `403` with `detail` explaining viewer cannot mutate.
- [ ] Owner's own `GET /api/v1/todos` is unchanged (still only owned items).

### US-2: Owner shares a list as Editor

- **As an** owner
- **I want to** grant edit access
- **So that** a collaborator can maintain the list with me

**Acceptance criteria**

- [ ] Share with `permission: "editor"` returns `201`.
- [ ] Editor can create a todo on the owner's list (`POST /api/v1/todos` with `owner_id`); the new row has `user_id = owner_id`, not the editor's id.
- [ ] Editor can update title, description, and `completed` (including `true` → `false`).
- [ ] Editor can delete a todo on that list (`204`).
- [ ] Editor cannot call share grant/update/revoke endpoints (`403`).
- [ ] Partial update still must not wipe unspecified fields (same `exclude_unset` behavior as today).

### US-3: Owner changes permission

- **As an** owner
- **I want to** upgrade Viewer → Editor or downgrade Editor → Viewer
- **So that** access matches current trust

**Acceptance criteria**

- [ ] `PATCH /api/v1/todo-shares/{share_id}` with `{ "permission": "editor" | "viewer" }` returns `200`.
- [ ] Only the owner of the share may patch; grantee receives `403`.
- [ ] After downgrade, the next mutating request from that user is `403` even if a previous editor session is still open.
- [ ] Permission cache and list caches for that grantee+owner pair are deleted in the same request after commit.

### US-4: Owner revokes access

- **As an** owner
- **I want to** revoke a collaborator immediately
- **So that** they cannot keep reading or editing my list

**Acceptance criteria**

- [ ] `DELETE /api/v1/todo-shares/{share_id}` returns `204`.
- [ ] Subsequent list/get/mutate by the grantee on that owner's todos returns `403` or `404` as specified in §5 (no residual `200` from Redis).
- [ ] Revoke is idempotent for the owner: deleting an already-removed id returns `404`.
- [ ] Redis keys for that share and the grantee's cached views of that list are deleted before the HTTP response is returned.

### US-5: Grantee sees incoming shares

- **As a** collaborator
- **I want to** list lists shared with me
- **So that** I can open the correct owner's todos

**Acceptance criteria**

- [ ] `GET /api/v1/shared-lists` returns only shares where `grantee_id = current_user.id`.
- [ ] Each item includes owner email, permission, and share id.
- [ ] After revoke, the owner disappears from this list on the next GET.

### US-6: Isolation from non-participants

- **As** User C (no share)
- **I want** the system to hide User A's list
- **So that** private todos stay private

**Acceptance criteria**

- [ ] User C `GET /api/v1/shared-lists/{A}/todos` → `403`.
- [ ] User C `GET /PUT /DELETE /api/v1/todos/{id}` for A's todo → `403` (do not leak title/description).
- [ ] User C does not learn whether a share exists via those todo routes.

---

## 3. Scope

### 3.1 In scope (v1)

- List-level share (all current and future todos of the owner).
- Permissions: `viewer`, `editor` only.
- Share by **registered user email** (exact, case-insensitive match on `users.email`).
- Owner-only grant, permission change, and revoke.
- Authorization on existing todo GET/POST/PUT/DELETE.
- Redis cache keys scoped by owner **and** reader; immediate invalidation on grant, patch, revoke, and todo mutations.
- Alembic migration for `todo_list_shares`.
- API errors as FastAPI `{ "detail": ... }`.

### 3.2 Out of scope

See **§6**. Kept here so implementation PRs do not grow the release.

---

## 4. Data Model

No change to `users` or `todos` columns. Ownership stays `todos.user_id`. Sharing is a separate ACL table.

### 4.1 New table: `todo_list_shares`

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `owner_id` | `UUID` | NO | — | List owner; FK → `users.id` |
| `grantee_id` | `UUID` | NO | — | Collaborator; FK → `users.id` |
| `permission` | `VARCHAR(16)` | NO | — | `viewer` or `editor` |
| `created_at` | `TIMESTAMPTZ` | NO | `now()` | Set on insert |
| `updated_at` | `TIMESTAMPTZ` | NO | `now()` | Set on insert and permission change |

PostgreSQL enum alternative: `CREATE TYPE todo_share_permission AS ENUM ('viewer', 'editor')`. Prefer `VARCHAR` + `CHECK` in v1 for simpler Alembic across SQLite tests, **or** a SQLAlchemy `Enum` that emits the same CHECK on SQLite.

### 4.2 Constraints

| Name | Definition | Rationale |
| --- | --- | --- |
| `pk_todo_list_shares` | `PRIMARY KEY (id)` | Stable share id for PATCH/DELETE |
| `fk_todo_list_shares_owner` | `FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE` | Owner account removal drops grants they issued |
| `fk_todo_list_shares_grantee` | `FOREIGN KEY (grantee_id) REFERENCES users(id) ON DELETE CASCADE` | Grantee account removal drops their access |
| `uq_todo_list_shares_owner_grantee` | `UNIQUE (owner_id, grantee_id)` | One share row per pair; duplicate invite → integrity error → HTTP 409 |
| `ck_todo_list_shares_not_self` | `CHECK (owner_id <> grantee_id)` | DB-level self-share ban |
| `ck_todo_list_shares_permission` | `CHECK (permission IN ('viewer', 'editor'))` | Reject unknown roles |

`ON DELETE CASCADE` is on **users**, not todos. Deleting a todo does not touch shares (list-level ACL). Deleting the owner user removes all their todos (existing FK; **should be upgraded** to `ON DELETE CASCADE` on `todos.user_id` in the same migration if it is still NO ACTION) and all shares they own.

### 4.3 Indexes

| Index | Columns | Purpose |
| --- | --- | --- |
| `uq_todo_list_shares_owner_grantee` | `(owner_id, grantee_id)` | Uniqueness + owner “who did I share with?” |
| `ix_todo_list_shares_grantee_id` | `(grantee_id)` | Inbox: lists shared with me |
| `ix_todo_list_shares_owner_id` | `(owner_id)` | Optional if unique prefix is not enough for listing outgoing shares |

Lookup on mutate: `WHERE owner_id = :todo.user_id AND grantee_id = :current_user.id`. The unique index serves this as a point lookup.

### 4.4 Suggested SQL (PostgreSQL)

```sql
CREATE TABLE todo_list_shares (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grantee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission    VARCHAR(16) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_todo_list_shares_owner_grantee UNIQUE (owner_id, grantee_id),
    CONSTRAINT ck_todo_list_shares_not_self CHECK (owner_id <> grantee_id),
    CONSTRAINT ck_todo_list_shares_permission CHECK (permission IN ('viewer', 'editor'))
);

CREATE INDEX ix_todo_list_shares_grantee_id ON todo_list_shares (grantee_id);
```

### 4.5 ORM notes

- Map `permission` as `Literal["viewer", "editor"]` / Python `StrEnum`.
- Relationships: `User.outgoing_shares`, `User.incoming_shares`.
- Do not add `shares` on `Todo`; authorization joins through `todo.user_id = share.owner_id`.

---

## 5. API Design

All routes require `Authorization: Bearer <access_token>` unless noted. Invalid/expired/tampered JWT → `401` `{ "detail": "Invalid authentication token" }` (current `get_current_user` behavior).

### 5.1 Endpoint catalog

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/todo-shares` | Owner (caller is owner) | Grant access |
| `GET` | `/api/v1/todo-shares` | Yes | Shares **I granted** |
| `PATCH` | `/api/v1/todo-shares/{share_id}` | Owner of that row | Change permission |
| `DELETE` | `/api/v1/todo-shares/{share_id}` | Owner of that row | Revoke |
| `GET` | `/api/v1/shared-lists` | Yes | Lists shared **with me** |
| `GET` | `/api/v1/shared-lists/{owner_id}/todos` | Viewer or Editor or Owner | Paginated todos for that owner |
| `GET` | `/api/v1/todos` | Yes | **Unchanged**: caller's own todos only |
| `POST` | `/api/v1/todos` | Owner or Editor | Create; optional `owner_id` |
| `GET` | `/api/v1/todos/{todo_id}` | Owner, Viewer, or Editor of that list | Read one |
| `PUT` | `/api/v1/todos/{todo_id}` | Owner or Editor | Update |
| `DELETE` | `/api/v1/todos/{todo_id}` | Owner or Editor | Delete |

Owner accessing their list via `GET /shared-lists/{self}/todos` is allowed (same data as `GET /todos`) for a single client code path; not required for v1 UI.

### 5.2 Error envelope

**Business / auth errors**

```json
{ "detail": "Not allowed to access this todo" }
```

**Validation (`422`)** — FastAPI default:

```json
{
  "detail": [
    {
      "loc": ["body", "permission"],
      "msg": "Input should be 'viewer' or 'editor'",
      "type": "enum"
    }
  ]
}
```

| HTTP | When |
| --- | --- |
| `400` | Self-share; semantically invalid body that is not schema-invalid |
| `401` | Missing/invalid/expired access token |
| `403` | Authenticated but wrong role (viewer mutate, non-owner revoke, no share) |
| `404` | Share id not found **for this owner**; grantee email not registered |
| `409` | Duplicate share for the same pair |
| `422` | Pydantic / query validation |
| `204` | Successful revoke or todo delete (empty body) |

To avoid user enumeration on share-by-email, v1 still returns `404` `{ "detail": "User not found" }` (same generic wording as unknown share id is **not** used here so the owner can correct typos). Product may later unify to `404` `"Unable to share with this email"`.

### 5.3 `POST /api/v1/todo-shares`

**Request**

```json
{
  "email": "editor@example.com",
  "permission": "editor"
}
```

| Field | Rules |
| --- | --- |
| `email` | Valid email; matched to `users.email` case-insensitively |
| `permission` | `"viewer"` \| `"editor"` |

**Responses**

- `201` body:

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "owner_id": "11111111-1111-1111-1111-111111111111",
  "grantee_id": "22222222-2222-2222-2222-222222222222",
  "grantee_email": "editor@example.com",
  "permission": "editor",
  "created_at": "2026-10-03T09:00:00Z",
  "updated_at": "2026-10-03T09:00:00Z"
}
```

- `400` `{ "detail": "Cannot share a list with yourself" }`
- `404` `{ "detail": "User not found" }`
- `409` `{ "detail": "List is already shared with this user" }` — unique violation; client should `PATCH` instead

After success: invalidate permission + list caches for `(owner_id, grantee_id)` (see §5.9).

### 5.4 `GET /api/v1/todo-shares`

Outgoing shares for `owner_id = current_user.id`.

**Query:** `page` (default 1), `size` (default 20, max 100).

**`200`**

```json
{
  "items": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "owner_id": "11111111-1111-1111-1111-111111111111",
      "grantee_id": "22222222-2222-2222-2222-222222222222",
      "grantee_email": "editor@example.com",
      "permission": "editor",
      "created_at": "2026-10-03T09:00:00Z",
      "updated_at": "2026-10-03T09:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 20
}
```

### 5.5 `PATCH /api/v1/todo-shares/{share_id}`

**Request**

```json
{ "permission": "viewer" }
```

- `200` — full share object (same shape as POST).
- `403` — caller is not `share.owner_id`.
- `404` — no row with that id **and** `owner_id = current_user` (do not reveal other owners' share ids; treat as not found).

Same-value patch is allowed (`200`, still bumps `updated_at` optional; prefer no-op without bump).

### 5.6 `DELETE /api/v1/todo-shares/{share_id}`

- `204` empty body.
- `403` / `404` as PATCH.
- Must run cache invalidation **after** the row is committed deleted (or in the same transaction then invalidate after `commit`), never only-in-memory.

### 5.7 `GET /api/v1/shared-lists`

Inbox for `grantee_id = current_user.id`.

**`200`**

```json
{
  "items": [
    {
      "share_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "owner_id": "11111111-1111-1111-1111-111111111111",
      "owner_email": "owner@example.com",
      "permission": "viewer",
      "created_at": "2026-10-03T09:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 20
}
```

### 5.8 `GET /api/v1/shared-lists/{owner_id}/todos`

Query: `page`, `size` (same defaults as `GET /todos`).

Authorization: `current_user.id == owner_id` **or** an existing share row for the pair.

**`200`** — reuse `TodoListResponse`:

```json
{
  "items": [
    {
      "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "title": "Buy milk",
      "description": "2%",
      "completed": false,
      "user_id": "11111111-1111-1111-1111-111111111111",
      "created_at": "2026-10-03T08:00:00Z",
      "updated_at": "2026-10-03T08:00:00Z",
      "user_email": "owner@example.com"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 20
}
```

- `403` `{ "detail": "Not allowed to access this todo list" }` if no share and not owner.

### 5.9 Existing todo routes — contract changes

#### `POST /api/v1/todos`

Extend create body:

```json
{
  "title": "Buy milk",
  "description": "optional",
  "owner_id": "11111111-1111-1111-1111-111111111111"
}
```

| `owner_id` | Rule |
| --- | --- |
| Omitted / equal to caller | Create as today; `user_id = current_user.id` |
| Another user | Require `editor` share; persist `user_id = owner_id` |

- `403` if viewer or no share.
- `201` `TodoResponse`.

#### `GET /api/v1/todos/{todo_id}`

Replace owner-only check with:

1. Load todo; if missing → `404` `{ "detail": "Todo not found" }` (unchanged).
2. If `todo.user_id == current_user.id` → allow.
3. Else if share exists with any permission → allow.
4. Else → `403` `{ "detail": "Not allowed to access this todo" }`.

Do **not** use `404` for case 4: the item exists; hiding existence from a guessed UUID is optional hardening (see §5.10). v1 keeps `403` to match current owner-mismatch behavior.

#### `PUT` / `DELETE /api/v1/todos/{todo_id}`

Same load + missing `404`. Then:

- Owner: allow.
- Editor share: allow.
- Viewer share: `403` `{ "detail": "Viewer permission cannot modify todos" }`.
- No share: `403` `{ "detail": "Not allowed to access this todo" }`.

`PUT` body unchanged (`title`, `description`, `completed`; `exclude_unset=True`).

---

## 6. Authorization, Edge Cases & Caching

### 6.1 Permission matrix

| Action | Owner | Editor | Viewer | Other user |
| --- | --- | --- | --- | --- |
| List own todos `GET /todos` | Yes | Own list only | Own list only | Own list only |
| List owner's todos via shared-lists | Yes | Yes | Yes | No |
| GET one todo on that list | Yes | Yes | Yes | No |
| Create todo on that list | Yes | Yes | No | No |
| Update / toggle / delete todo | Yes | Yes | No | No |
| Grant / patch / revoke share | Yes | No | No | No |
| Re-share owner's list with a third user | Yes (as owner) | **No** | **No** | No |

**No grant-propagation:** editors and viewers cannot invite others. Only `share.owner_id` can create rows.

### 6.2 Self-sharing

Reject before insert:

1. Resolve email → user; if `grantee.id == current_user.id` → `400` `"Cannot share a list with yourself"`.
2. Table `CHECK (owner_id <> grantee_id)` as a last line of defense (`IntegrityError` → `400`).

### 6.3 Duplicate invites

- Application: `SELECT` existing `(owner_id, grantee_id)` before insert; if found → `409` with existing share id in `detail` **or** a structured body:

```json
{
  "detail": "List is already shared with this user",
  "share_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "permission": "viewer"
}
```

FastAPI `HTTPException.detail` may be a string or a dict; use a **dict** for 409 so clients can `PATCH` without an extra GET.

- Concurrent double-POST: unique constraint; catch `IntegrityError`, `rollback`, return the same `409`.

Changing permission of an existing pair is **PATCH only**, never a second POST.

### 6.4 Concurrent updates / races

| Scenario | Handling |
| --- | --- |
| Two POSTs for the same email | Unique index + `409` |
| Owner `DELETE` share while editor `PUT`s a todo | Todo mutation opens a transaction: `SELECT ... FROM todo_list_shares WHERE owner_id=:o AND grantee_id=:g FOR UPDATE`. If the row is gone after owner commit, editor's `SELECT` sees no row → `403`. Do **not** check permission only at the start of a long request without re-reading the share in the write transaction. |
| Owner downgrades editor → viewer during PUT | `FOR UPDATE` on the share row; if `permission != editor` at write time → `403` |
| Two editors PUT the same todo | Last-write-wins on columns provided (current model). v1 does **not** add `If-Match` / version column. Optional later: `updated_at` compare. |
| Owner deletes the todo while editor updates | `404` Todo not found |
| Revoke then GET list hitting Redis | See §6.5; GET must **authorize first**, then read cache. A revoked user never reaches a cache hit. Additionally delete their keys so leftover data is not sitting around. |
| Share POST vs user deleted | FK + `404` if user lookup fails |

Isolation: use the existing SQLAlchemy session per request; `FOR UPDATE` requires PostgreSQL (production). SQLite tests may skip row locks; still enforce the SELECT-then-mutate check.

### 6.5 Caching & invalidation

**Do not** reuse a single `todos:list:{owner_id}:{page}:{size}` key for every reader. That payload is safe *content-wise* (same list), but:

- Authorization must always run first (cache is not an ACL).
- Revoke must not leave a key that a bug could serve without a share check.

**Keys**

| Key | TTL | Contents |
| --- | --- | --- |
| `todos:list:{owner_id}:{page}:{size}` | 300s | Owner's `GET /todos` only (current behavior, keep) |
| `todos:shared:{reader_id}:{owner_id}:{page}:{size}` | 300s | `GET /shared-lists/{owner_id}/todos` |
| `todo-share:{owner_id}:{grantee_id}` | 60s | Optional hot-path: JSON `{ "permission": "editor" }` or sentinel miss |

Legacy `todos:list` global key stays deleted on invalidation as today.

**Invalidate immediately (await deletes; no fire-and-forget) when:**

| Event | Keys to delete |
| --- | --- |
| Owner/editor creates, updates, or deletes a todo | `todos:list:{owner_id}:*`, `todos:shared:*:{owner_id}:*` |
| Grant share | `todo-share:{owner}:{grantee}`, `todos:shared:{grantee}:{owner}:*` |
| Patch permission | Same as grant |
| **Revoke** | `todo-share:{owner}:{grantee}`, `todos:shared:{grantee}:{owner}:*`, plus shared-list inbox cache if introduced (`shared-lists:{grantee}:*`) |

Order of revoke:

1. Delete DB row; `commit`.
2. `delete_by_pattern` / `delete` Redis keys.
3. Return `204`.

If Redis delete fails after commit, return `204` still (source of truth is Postgres) and log/metrics; the next GET still fails ACL. Retry invalidation best-effort. **Do not** return `200` from cache on shared GET without a successful ACL check in that request.

Optional inbox cache `shared-lists:{user_id}:{page}:{size}`: invalidate on grant/revoke for that grantee.

### 6.6 Other edge cases

- **Inactive / missing grantee at GET time:** if we add `users` soft-delete later, treat missing user as no share. v1 has no soft-delete.
- **Email change:** shares are by `user_id`; email is display-only.
- **Owner shares with User B, B's todos stay private.** Bidirectional share requires a second row.
- **Empty list:** shared GET returns `{ "items": [], "total": 0, ... }` not `404`.
- **Pagination:** shared list uses the same `created_at` ordering as owned list once Task 3C indexes land; until then, match current `get_todos` order.

---

## 7. Out of Scope (v1)

The following are **explicitly deferred** so the first release stays list-ACL only:

- Per-todo or per-tag sharing.
- Public / unlisted links, share tokens, QR codes, password-protected links.
- Email/SMS invitation to addresses that are not already registered; pending invites; invite expiry; resend.
- Roles beyond viewer/editor (commenter, admin).
- Re-share / “editor can invite others”; share inheritance.
- Folders, multiple lists per user (the product is still one list per user).
- Real-time sync (WebSocket / SSE); presence; typing indicators.
- Fine-grained field ACL (e.g. editor cannot delete).
- Optimistic concurrency tokens (`If-Match`, row version).
- Audit log UI (server-side structured logs are allowed; no `share_events` table required).
- Notifications (in-app, email, push) when shared or revoked.
- Frontend design beyond “must call these APIs”; this document does not specify React components.
- GDPR export/erasure workflows beyond FK CASCADE.
- Sharing with groups, domains, or SSO roles.
- Rate limiting / abuse quotas (may use existing gateway later).
- Changing `todos.user_id` (transfer ownership).

---

## 8. Implementation notes (non-normative)

- New router `app/api/v1/todo_shares.py` mounted at `/api/v1/todo-shares` and `/api/v1/shared-lists`.
- Replace `ensure_todo_owner` with `ensure_todo_access(todo, user, action: Literal["read","write"])`.
- Alembic revision after current heads; SQLite tests: same CHECK/UNIQUE; skip `FOR UPDATE` if unsupported.
- Suggested tests: self-share 400, duplicate 409, viewer cannot PUT, editor PUT then revoke then PUT 403, cache key absent after revoke, User C 403, create-with-`owner_id` sets `user_id` to owner.

---

## 9. Revision history

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-10-03 | Initial production spec for assessment Task 3A |
