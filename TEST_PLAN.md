# Manual Test Plan: Authentication, Authorization & Todos

## 1. Scope & Objective

- **Objective**: Verify authentication, authorization, todo CRUD persistence, and cache-related regressions for the Todo app.
- **Scope**: Registration, login, JWT session handling, cross-user isolation, completed toggle, partial updates, cache freshness, and logout.
- **Out of scope**: Todo sharing, tags, bulk actions, and production load testing.

## 2. Test Environment & Prerequisites

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`
- Start stack: `docker compose up --build` (or local uvicorn + Vite per `GUIDE.md`)
- Seed (optional demo user): `docker compose exec backend python -m app.db.seed`
- Accounts:
  - User A: `user_a@test.com` / `Password@123` (register first if not seeded)
  - User B: `user_b@test.com` / `Password@123`
  - Demo (if seeded): `demo@test.com` / `Demo@123`

### Automated suites (same scope)

```bash
# Backend (from backend/)
pytest tests/ -v

# Playwright E2E — headless (from e2e/, app must be running)
npm install
npx playwright install chromium
npx playwright test

# Playwright E2E — headed / UI mode
npx playwright test --headed
npx playwright test --ui
```

Optional: `E2E_BASE_URL=http://localhost:3000 npx playwright test`

## 3. Test Cases Matrix

| TC ID | Module / Feature | Test Scenario | Preconditions | Test Steps | Expected Result | Priority / Severity | Status (Pass/Fail) |
|---|---|---|---|---|---|---|---|
| TC-AUTH-01 | Auth | Register with a unique email | App is running; email is unused | 1. Open `/register`<br>2. Enter valid email, password, and matching confirm password<br>3. Submit | Account is created, tokens are stored, user lands on the todo dashboard | High / Blocker | |
| TC-AUTH-02 | Auth | Register rejects duplicate email | User A already exists | 1. Register again with User A's email | Error is shown; no second account; user stays on register (or is not logged in as a duplicate) | High / Major | |
| TC-AUTH-03 | Auth | Login succeeds with correct password | User A is registered | 1. Open `/login`<br>2. Enter User A email and password<br>3. Sign In | Redirect to dashboard; header shows User A email | High / Blocker | |
| TC-AUTH-04 | Auth | Login fails with wrong password | User A is registered | 1. Enter User A email and an incorrect password<br>2. Sign In | Error message; no dashboard access; tokens are not stored | High / Security | |
| TC-AUTH-05 | Auth | Login fails for unknown email | Email is not registered | 1. Enter unknown email and any password<br>2. Sign In | Generic auth failure (no “user not found” vs “wrong password” leak) | Medium / Security | |
| TC-AUTH-06 | Auth | Protected route without token | Browser has no `access_token` | 1. Open `/` directly | Redirect to `/login` | High / Major | |
| TC-AUTH-07 | Auth | Expired JWT is rejected | User A is logged in; access token is expired or replaced with an expired JWT | 1. Call `GET /api/v1/todos` with expired Bearer token (API client or DevTools) | HTTP 401; frontend should send the user back to login | High / Security | |
| TC-AUTH-08 | Auth | Tampered JWT is rejected | User A has a valid token | 1. Alter the token payload or sign with a different secret<br>2. Call `GET /api/v1/todos` | HTTP 401 Invalid authentication token | High / Security | |
| TC-AUTH-09 | Auth | Logout ends the session | User A is on the dashboard | 1. Click Logout | Redirect to login; `/` requires login again; tokens removed from storage | High / Major | |
| TC-AUTHZ-01 | Authorization | User A list does not include User B todos | Both users registered | 1. User B creates a uniquely titled todo<br>2. Log in as User A<br>3. Inspect dashboard and `GET /api/v1/todos` | User B's title is absent from User A's list | High / Critical | |
| TC-AUTHZ-02 | Authorization | User A cannot GET User B's todo by ID | User B created todo ID `X` | 1. As User A, `GET /api/v1/todos/{X}` | HTTP 403 (or 404); body of User B's todo is not returned | High / Critical | |
| TC-AUTHZ-03 | Authorization | User A cannot update User B's todo | Todo ID `X` belongs to User B | 1. As User A, `PUT /api/v1/todos/{X}` with a new title | HTTP 403; User B still sees the original title | High / Critical | |
| TC-AUTHZ-04 | Authorization | User A cannot delete User B's todo | Todo ID `X` belongs to User B | 1. As User A, `DELETE /api/v1/todos/{X}` | HTTP 403; User B can still GET the todo | High / Critical | |
| TC-TODO-01 | Todos | Create todo appears in the list | User A is logged in | 1. Add Todo<br>2. Enter title and description<br>3. Create | New item is visible with title and description; `completed` is false | High / Blocker | |
| TC-TODO-02 | Todos | Toggle completed true then false persists | A todo exists | 1. Check the todo<br>2. Uncheck the todo<br>3. Refresh the page | After refresh, the todo is still incomplete (`completed = false`) | High / Major | |
| TC-TODO-03 | Todos | Partial title update keeps description | Todo has title and description | 1. Edit title only (API `PUT` with `{ "title": "..." }` or UI edit without clearing description)<br>2. Save<br>3. Refresh | Description is unchanged | High / Major | |
| TC-TODO-04 | Todos | Delete removes the item | A todo exists | 1. Delete the todo<br>2. Refresh | Item is gone from UI and `GET /api/v1/todos` | Medium / Major | |
| TC-CACHE-01 | Cache | Create invalidates stale list cache | User A listed todos once (cache warm) | 1. Create a new todo<br>2. Reload list / `GET /api/v1/todos` | New todo is present; old cached list is not served | Medium / Major | |
| TC-CACHE-02 | Cache | Update invalidates stale list cache | List was loaded; todo title is cached | 1. Change the title<br>2. Reload list | Updated title is shown, not the previous title | Medium / Major | |
| TC-CACHE-03 | Cache | Delete invalidates stale list cache | List was loaded | 1. Delete a todo<br>2. Reload list | Deleted item is absent | Medium / Major | |

## 4. Defect Tracking & Known Limitations

- E2E tests assume the frontend (`:3000`) and backend (`:8000`) are already running; they do not start Docker themselves.
- Manual JWT expiry/tamper cases (TC-AUTH-07, TC-AUTH-08) are easiest to execute via the API (`/docs` or httpx/curl) rather than the UI.
- Duplicate-email copy and exact 401 detail strings should be checked against the live API response.
- Record actual results and Pass/Fail in this matrix during a test execution cycle; automated pytest and Playwright cover the highest-risk rows above.
