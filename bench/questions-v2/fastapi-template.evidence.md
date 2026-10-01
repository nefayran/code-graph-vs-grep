# fastapi-template: evidence for the v2 answer key

> Answers are graded by whole-word, case-insensitive matching (`bench/run-copilot.mjs`, `PLAN-v2.md`). Notes below
> that discuss one `must` entry being a substring of another were written for plain substring matching; under
> whole-word matching those overlaps no longer let an answer that omits the shorter name pass.

Repository: https://github.com/fastapi/full-stack-fastapi-template at
`cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7`, checked out at `<repo>/` (clean, `git rev-parse HEAD` equals the
pin). Every command below runs from `<repo>/`. `rg` is ripgrep 14.1.1; it skips hidden files such as `.env`
unless given `--hidden`. After the `rg` pass, the 62 file:line facts this file relies on (every `must`
line plus the context lines quoted below) were read again from the pinned commit with
`git show <pin>:<path>`, not from the working tree.

The graph was used only to propose candidates, through
`printf '%s' '{"project":"<project>","query":"<cypher>"}' | codebase-memory-mcp cli query_graph`, with `<project>`
standing for the cbm project of `<repo>/` (1.6k nodes). Every `must` entry comes from `rg` output and from
reading the code.

## The set

| id | type | new or reused | must |
|---|---|---|---:|
| fastapi-callers-1 | callers | new | 6 |
| fastapi-callers-2 | callers | new | 6 |
| fastapi-callees-1 | callees | new | 4 |
| call-chain | chain | reused (v1) | 3 |
| fastapi-chain-1 | chain | new | 9 |
| fastapi-impact-1 | impact | new | 6 |
| fastapi-impact-2 | impact | new | 10 |
| fastapi-impact-3 | impact | new | 7 |
| config-value | config | reused (v1) | 3 |
| fastapi-config-1 | config | new | 3 |
| fastapi-env-1 | env | new | 2 |
| fastapi-env-2 | env | new | 2 |
| error-string | error | reused (v1) | 3 |
| fastapi-error-1 | error | new | 2 |
| class-def | definition | reused (v1) | 2 |
| fastapi-definition-1 | definition | new | 2 |

Two v1 questions for this repository were not reused because no v2 type fits them: `architecture` (module
layout) and `route-scan` (route listing). The four reused questions keep their v1 id, prompt and `must`
unchanged; only `type` was added.

Languages: 7 structural questions are on the Python backend and 1 on the TypeScript frontend; the exact
questions are 5 Python and 3 TypeScript. The frontend is mostly React components whose "calls" are hooks and
JSX, so it has few honest structural candidates (see "Candidates not used").

## What the graph gets wrong at this pin

These limits decide what the graph arm can get from the graph on this repository. They were found while
looking for candidates, and each one was confirmed against the code.

1. A Python call to a name imported with `from x import y` and then called bare gets no CALLS edge. This
   covers `get_password_hash`, `verify_password`, `send_email`, the three `generate_*_email` functions,
   `generate_password_reset_token` and `init_db`. Calls written as `module.func()` (`crud.create_user`,
   `security.create_access_token`) and calls inside the same file do resolve.
2. Calls to `crud.create_user` are attached to the wrong node, or dropped. `register_user` (users.py:147) is
   linked to the route handler `create_user` in users.py:57 instead of `crud.create_user`. The call from
   that handler to `crud.create_user` (users.py:68) is missing.
3. `sentry_sdk.init(...)` at backend/app/main.py:19 produces an edge from the `backend/app/main.py` module to
   `init` in backend/app/initial_data.py.
4. `scripts/` is not indexed: there are no nodes for scripts/prepare_release.py.
5. There is no node for `handleError` (a `const` holding a function expression) and none for the
   `API_V1_STR` class field.

Commands used for this survey:

    MATCH (a)-[:CALLS]->(b) RETURN b.name, b.file_path, b.start_line, count(a) AS n ORDER BY n DESC LIMIT 200
    MATCH (a)-[:CALLS]->(b) WHERE b.name = '<name>' RETURN a.name, a.file_path, a.start_line, b.file_path, b.start_line LIMIT 50
    MATCH (a)-[:CALLS]->(b) WHERE a.name = '<name>' RETURN a.file_path, b.name, b.file_path, b.start_line LIMIT 60
    MATCH (n:Function) RETURN n.file_path AS f, count(n) AS c ORDER BY c DESC LIMIT 200
    MATCH (n) WHERE n.name = '<name>' RETURN labels(n), n.name, n.file_path, n.start_line LIMIT 5

## Structural questions

### fastapi-callers-1 (callers, new)

Prompt: Which functions call get_password_hash? Ignore tests. Answer with the caller name and file:line of
each call site, nothing else.

Answer: 4 call sites in 3 files. `create_user` crud.py:12, `update_user` crud.py:25, `update_password_me`
users.py:117, `create_user` private.py:32.

    rg -n -w 'get_password_hash' .

    backend/app/core/security.py:35:def get_password_hash(password: str) -> str:              definition, only one
    backend/app/crud.py:12:        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    backend/app/crud.py:25:        hashed_password = get_password_hash(password)
    backend/app/api/routes/users.py:117:    hashed_password = get_password_hash(body.new_password)
    backend/app/api/routes/private.py:32:        hashed_password=get_password_hash(user_in.password),
    backend/tests/api/routes/test_login.py:171:    argon2_hash = get_password_hash(password)   test, ignored
    (plus the imports at crud.py:6, users.py:14, private.py:7, test_login.py:8)

The enclosing functions were read from the code: crud.py:10-17 `def create_user`, crud.py:20-31
`def update_user`, users.py:103-121 `def update_password_me` (route `PATCH /users/me/password`), and
private.py:23-38 `def create_user` (route `POST /private/users/`).

- `create_user`, `crud.py`, `private.py`: crud.py:12 and private.py:32.
- `update_user`: crud.py:25.
- `update_password_me`, `users.py`: users.py:117.

Graph: no CALLS edge into `get_password_hash` (0 of 4).
Key limit: `create_user` is matched by either of the two functions with that name, and `crud.py` is matched
by `update_user` as well, so leaving out `crud.create_user` alone is not caught.

### fastapi-callers-2 (callers, new)

Prompt: Which functions call isLoggedIn? Answer with the caller name and file:line of each call site,
nothing else.

Answer: 6 call sites in 6 files. One is `useAuth` (useAuth.ts:26). The other five are the anonymous
`beforeLoad` route guards in _layout.tsx:15, login.tsx:38, signup.tsx:45, recover-password.tsx:36 and
reset-password.tsx:53.

    rg -n -w 'isLoggedIn' .

    frontend/src/hooks/useAuth.ts:14:const isLoggedIn = () => {                definition, only one
    frontend/src/hooks/useAuth.ts:26:    enabled: isLoggedIn(),              inside useAuth (useAuth.ts:18), useQuery options
    frontend/src/routes/_layout.tsx:15:    if (!isLoggedIn()) {             beforeLoad at line 14, createFileRoute("/_layout")
    frontend/src/routes/login.tsx:38:    if (isLoggedIn()) {                beforeLoad at line 37, createFileRoute("/login")
    frontend/src/routes/signup.tsx:45:    if (isLoggedIn()) {               beforeLoad at line 44, createFileRoute("/signup")
    frontend/src/routes/recover-password.tsx:36:    if (isLoggedIn()) {     beforeLoad at line 35, createFileRoute("/recover-password")
    frontend/src/routes/reset-password.tsx:53:    if (isLoggedIn()) {       beforeLoad at line 52, createFileRoute("/reset-password")
    (plus the five imports and the export at useAuth.ts:69)

No test file mentions `isLoggedIn`, so the prompt leaves out "Ignore tests". `beforeLoad` is not in `must`,
because an anonymous function can fairly be named another way ("the /login route guard"). Each file is
checked instead.

Graph: all 6 edges present (5 named `beforeLoad`, plus `useAuth`).

### fastapi-callees-1 (callees, new)

Prompt: What functions does recover_password call? List the callee names only.

Answer: `get_user_by_email`, `generate_password_reset_token`, `generate_reset_password_email`, `send_email`
(and the `Message` model, which is not in `must`).

    rg -n 'def recover_password' backend
    sed -n '13,18p;53,74p' backend/app/api/routes/login.py

    login.py:54:def recover_password(email: str, session: SessionDep) -> Message:
    login.py:58:    user = crud.get_user_by_email(session=session, email=email)
    login.py:63:        password_reset_token = generate_password_reset_token(email=email)
    login.py:64:        email_data = generate_reset_password_email(
    login.py:67:        send_email(
    login.py:72:    return Message(
    login.py:13-18: from app.utils import (generate_password_reset_token, generate_reset_password_email,
                    send_email, verify_password_reset_token)

`recover_password_html_content` (login.py:105) shares the prefix but is a different function. The name
`recover_password` is defined once.

Graph: only `get_user_by_email` (1 of 4; the other three are bare imported names, limit 1).

### call-chain (chain, reused from v1)

Prompt (v1): Trace the call chain from the HTTP endpoint that lets an admin create a user down to the
database write. Answer as an ordered list of file:line steps.

Answer: `POST /api/v1/users/` → `create_user` (users.py:57) → `crud.create_user(...)` (users.py:68) →
`create_user` (crud.py:10) → `session.add` / `session.commit()` (crud.py:14-15).

    rg -n 'get_current_active_superuser|^def |^@router' backend/app/api/routes/users.py
    sed -n '54,78p' backend/app/api/routes/users.py; sed -n '10,17p' backend/app/crud.py

    users.py:54-55: @router.post("/", dependencies=[Depends(get_current_active_superuser)], response_model=UserPublic)
    users.py:57:def create_user(*, session: SessionDep, user_in: UserCreate) -> Any:
    users.py:68:    user = crud.create_user(session=session, user_create=user_in)
    crud.py:10:def create_user(*, session: Session, user_create: UserCreate) -> User:
    crud.py:15:    session.commit()

The endpoint is unique. The other two user-creating endpoints are not admin-only: `register_user` (users.py:146,
`POST /users/signup`, public), and `create_user` in private.py:23 (`POST /private/users/`, no auth, mounted
only when `FASTAPI_ENV == "development"`, api/main.py:13-14). The `must` entries `users.py`, `crud.py` and
`commit` hold at the pin. The v1 key does not name the functions. `create_user` would be the natural entry,
but it is the name in both files, so it would add nothing a reviewer could check.

Graph: users.py `create_user` → `crud.create_user` is missing (limit 2).

### fastapi-chain-1 (chain, new)

Prompt: Trace the call chain from main() in backend/app/initial_data.py down to get_password_hash. List every
function on the path in order, with file:line for each, nothing else.

Answer: `main` (initial_data.py:16) → `init` (initial_data.py:11) → `init_db` (core/db.py:15) →
`create_user` (crud.py:10) → `get_password_hash` (core/security.py:35).

    rg -n 'initial_data' -g '!*.lock' .
    rg -n 'def main|def init|init\(\)|init_db\(' backend/app/initial_data.py backend/app/core/db.py
    rg -n 'crud\.' backend/app/core/db.py
    rg -n 'get_password_hash' backend/app/crud.py

    backend/scripts/prestart.sh:10:python app/initial_data.py        the entry point: a CLI script run at container start
    initial_data.py:22-23: if __name__ == "__main__": main()
    initial_data.py:16:def main() -> None:          initial_data.py:18:    init()
    initial_data.py:11:def init() -> None:          initial_data.py:13:        init_db(session)
    core/db.py:15:def init_db(session: Session) -> None:
    core/db.py:33:        user = crud.create_user(session=session, user_create=user_in)
    crud.py:10:def create_user(...)                 crud.py:12: ... get_password_hash(user_create.password)
    core/security.py:35:def get_password_hash(password: str) -> str:

The path is unique. Reading each body: `main` calls only `logger.info` and `init`. `init` calls only
`Session` and `init_db`. `init_db` calls `session.exec`, `select`, `UserCreate` and `crud.create_user`.
`crud.create_user` calls `User.model_validate`, `get_password_hash` and session methods. No other route leads
from `main` to `get_password_hash`.

Graph: `main`→`init` and `init_db`→`crud.create_user` are present. `init`→`init_db` and
`crud.create_user`→`get_password_hash` are missing (limit 1). The graph also has an extra edge into `init`
from the `backend/app/main.py` module (limit 3).
Key limit: `init` is a substring of `init_db` and `initial_data.py`, so an answer that skips `init` still
passes. `main`, `get_password_hash` and `initial_data.py` are in the prompt; the checks that carry weight are
`init_db`, `create_user`, `db.py`, `crud.py` and `security.py`.

### fastapi-impact-1 (impact, new)

Prompt: If the signature of verify_password changes, which non-test functions call it directly, and which
functions call those? Ignore tests. Answer with the function name and file of each, grouped by level,
nothing else.

Answer (3 functions). Level 1: `authenticate` (crud.py), `update_password_me` (users.py). Level 2:
`login_access_token` (login.py). `update_password_me` is a route handler with no callers.

    rg -n -w 'verify_password' .
    rg -n -w -e 'authenticate' -e 'update_password_me' .

    core/security.py:29:def verify_password(                                    definition
    crud.py:50:        verify_password(password, DUMMY_HASH)                    inside authenticate (crud.py:45)
    crud.py:52:    verified, updated_password_hash = verify_password(password, db_user.hashed_password)
    api/routes/users.py:110:    verified, _ = verify_password(body.current_password, current_user.hashed_password)
                                                                                inside update_password_me (users.py:104)
    tests, ignored: test_users.py:245,261,338; test_login.py:109,159; tests/crud/test_user.py:92,125
    api/routes/login.py:30:    user = crud.authenticate(                        inside login_access_token (login.py:24)
    tests, ignored: tests/crud/test_user.py:25,33,116 call crud.authenticate
    users.py:103: @router.patch("/me/password", ...)  update_password_me is invoked by FastAPI only

`-w` keeps out `verify_password_reset_token` (utils.py:118, called at login.py:82), which is a different
function that a plain substring search also returns. frontend/tests/auth.setup.ts:6 `setup("authenticate", ...)`
is a string, not a call.

Graph: no edge into `verify_password` (limit 1). `authenticate` ← `login_access_token` is present, along with
3 test callers.

### fastapi-impact-2 (impact, new)

Prompt: If the signature of render_email_template changes, which non-test functions call it directly, and
which functions call those? Answer with the function name and file of each, grouped by level, nothing else.

Answer (7 functions). Level 1 (all in backend/app/utils.py): `generate_test_email`,
`generate_reset_password_email`, `generate_new_account_email`. Level 2: `test_email`
(backend/app/api/routes/utils.py), `recover_password` and `recover_password_html_content` (login.py),
`create_user` (users.py).

    rg -n -w 'render_email_template' .
    rg -n -w -e 'generate_test_email' -e 'generate_reset_password_email' -e 'generate_new_account_email' .

    utils.py:25:def render_email_template(...)                       definition
    utils.py:63:    html_content = render_email_template(            inside generate_test_email (utils.py:60)
    utils.py:74:    html_content = render_email_template(            inside generate_reset_password_email (utils.py:70)
    utils.py:92:    html_content = render_email_template(            inside generate_new_account_email (utils.py:87)
    api/routes/utils.py:20:    email_data = generate_test_email(email_to=email_to)      inside test_email (routes/utils.py:16)
    api/routes/login.py:64:        email_data = generate_reset_password_email(           inside recover_password (login.py:54)
    api/routes/login.py:117:    email_data = generate_reset_password_email(              inside recover_password_html_content (login.py:105)
    api/routes/users.py:70:        email_data = generate_new_account_email(              inside create_user (users.py:57)

None of these four functions is called from tests, and all four level-2 functions are route handlers, so
there is no third level. With no test matches, the prompt leaves out "Ignore tests". That phrase could also
lead a model to drop `test_email`, which is the route handler for `POST /utils/test-email/`, not a test.

Graph: level 1 is complete (3 of 3, same-file calls); level 2 has none of the 4 (limit 1).
Key limit: `test_email` is a substring of `generate_test_email`, and `recover_password` of
`recover_password_html_content`, so leaving out either of those two is not caught. Every other omission fails
the key.

### fastapi-impact-3 (impact, new)

Prompt: If the signature of create_user in backend/app/crud.py changes, which non-test functions call it
directly, and which functions call those? Ignore tests. Answer with the function name and file of each,
grouped by level, nothing else.

Answer (4 functions). Level 1: `create_user` and `register_user` (users.py), `init_db` (core/db.py).
Level 2: `init` (initial_data.py). The two users.py functions are route handlers with no callers.

    rg -n -w 'create_user' backend
    rg -n -w -e 'register_user' -e 'init_db' backend

    crud.py:10:def create_user(*, session: Session, user_create: UserCreate) -> User:      the target
    api/routes/users.py:68:    user = crud.create_user(session=session, user_create=user_in)       inside create_user (users.py:57)
    api/routes/users.py:158:    user = crud.create_user(session=session, user_create=user_create)  inside register_user (users.py:147)
    core/db.py:33:        user = crud.create_user(session=session, user_create=user_in)            inside init_db (db.py:15)
    initial_data.py:13:        init_db(session)                                                    inside init (initial_data.py:11)
    tests, ignored: 23 call sites (test_users.py 12, tests/crud/test_user.py 8, tests/utils/user.py 2,
                    test_login.py 1) and tests/conftest.py:18 init_db(session)

There are three functions named `create_user`. The one in private.py:24 builds `User(...)` itself
(private.py:29-36) and does not import `crud`, so it is not a caller. `main` → `init` is a third level and is
not asked for.

Graph: `crud.create_user` gets 21 callers, `init_db` plus 20 test functions. Both users.py callers are wrong:
`register_user` is attached to the handler `create_user`, and that handler's own call is missing (limit 2).
`init`→`init_db` is missing (limit 1).
Key limit: `create_user` is also satisfied when the answer repeats the target's name, and `users.py` is
satisfied by `register_user` alone. The users.py `create_user` is therefore the weakest check.
`initial_data.py` is what checks level 2.

## Exact questions

### config-value (config, reused from v1)

Prompt (v1): What URL prefix are the API routes mounted under, and which setting in which file defines it?
One line.

    rg -n 'API_V1_STR' backend/app

    core/config.py:22:    API_V1_STR: str = "/api/v1"
    main.py:35:app.include_router(api_router, prefix=settings.API_V1_STR)
    (also main.py:23 openapi_url and api/deps.py:17 tokenUrl)

`/api/v1`, `API_V1_STR` and `config.py` hold at the pin.

### fastapi-config-1 (config, new)

Prompt: Which JWT signing algorithm does the backend use, and which constant in which file defines it?
One line.

    rg -n -w 'ALGORITHM' backend/app
    rg -n -i 'HS256' .

    core/security.py:19:ALGORITHM = "HS256"          the only HS256 in the repository
    core/security.py:25:    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    (also api/deps.py:33 jwt.decode, utils.py:113 and utils.py:121, all through security.ALGORITHM)

### fastapi-env-1 (env, new)

Prompt: Which function reads the MAILPIT_HOST environment variable? Answer with the file and function name,
one line.

    rg -n --hidden -w 'MAILPIT_HOST' .
    rg -n 'export async function waitForEmailHtml' frontend

    frontend/tests/utils/mailpit.ts:7:export async function waitForEmailHtml({
    frontend/tests/utils/mailpit.ts:20:      `${process.env.MAILPIT_HOST}/api/v1/search`,
    frontend/tests/utils/mailpit.ts:30:        `${process.env.MAILPIT_HOST}/view/${email.ID}.html`,
    frontend/.env:2:MAILPIT_HOST=http://localhost:8025          sets it, does not read it
    compose.override.yml:92:      - MAILPIT_HOST=http://mailpit:8025   sets it, does not read it

Both reads are inside `waitForEmailHtml` (mailpit.ts:7-46). Only a Playwright test helper reads this
variable, so the prompt does not say "Ignore tests". This is one of only two functions in the repository
that read an environment variable directly. The other is `getEnvVar` in frontend/tests/config.ts:10-16,
which reads `process.env[name]` for a name its caller passes in. The Python code has no `os.environ` or
`getenv` at all (`rg -n -e 'os\.environ' -e 'getenv' backend scripts hooks` returns nothing). Application
TypeScript reads one only at module level (`import.meta.env.VITE_API_URL`, frontend/src/main.tsx:18), as
does frontend/playwright.config.ts (`PLAYWRIGHT_BASE_URL`, `CI`).

Graph: `waitForEmailHtml` exists as a Function node.

### fastapi-env-2 (env, new)

Prompt: Which backend function uses the value of the FIRST_SUPERUSER environment variable? Ignore tests.
Answer with the file and function name, one line.

    rg -n --hidden -w 'FIRST_SUPERUSER' .

    .env:7:FIRST_SUPERUSER=admin@example.com
    backend/app/core/config.py:65:    FIRST_SUPERUSER: EmailStr        field of class Settings(BaseSettings), config.py:15
    backend/app/core/db.py:25:        select(User).where(User.email == settings.FIRST_SUPERUSER)
    backend/app/core/db.py:29:            email=settings.FIRST_SUPERUSER,
    tests, ignored: backend/tests/api/routes/test_login.py:18,30; test_users.py:23,241,244,346,496;
                    backend/tests/utils/utils.py:19; frontend/tests/config.ts:18 getEnvVar("FIRST_SUPERUSER")
    not code: compose.yml:58, compose.override.yml:88, deployment.md, deployment-docker-compose.md

The backend reads environment variables only through pydantic-settings. `Settings` loads them from the
process environment and `../.env` (config.py:16-21, `env_file="../.env"`), and `settings = Settings()` runs
at config.py:91. The prompt therefore asks which function uses the value. The only non-test reader of
`settings.FIRST_SUPERUSER` is `init_db` (db.py:15-33), which looks the first superuser up and creates it if it
is missing.

### error-string (error, reused from v1)

Prompt (v1): Find where login rejects a wrong password. Give the file:line and the exact error message.

    rg -n -F 'Incorrect email or password' .

    backend/app/api/routes/login.py:34:        raise HTTPException(status_code=400, detail="Incorrect email or password")
    frontend/tests/login.spec.ts:69:  await expect(page.getByText("Incorrect email or password")).toBeVisible()

login.py:34 is inside `login_access_token`; it runs when `crud.authenticate` returns `None` (crud.py:53-54
when the password does not verify). The v1 prompt has no "Ignore tests" although a Playwright test contains
the string. It was kept unchanged as instructed, and "where login rejects" points at the backend raise.

### fastapi-error-1 (error, new)

Prompt: Where is the error "useTheme must be used within a ThemeProvider" thrown? Give the file:line,
nothing else.

    rg -n -F 'must be used within' frontend packages

    frontend/src/components/theme-provider.tsx:112:    throw new Error("useTheme must be used within a ThemeProvider")
    frontend/src/components/ui/sidebar.tsx:48:    throw new Error("useSidebar must be used within a SidebarProvider.")

The throw at line 112 is inside `useTheme` (theme-provider.tsx:108-115). The sidebar message is a similar
string from a different hook. `useTheme` is part of the message, so it is not in `must`.

### class-def (definition, reused from v1)

Prompt (v1): Which file and line defines the Settings class? One line.

    rg -n -w 'class Settings' .

    backend/app/core/config.py:15:class Settings(BaseSettings):

There is no other class, type or interface named `Settings` in Python or TypeScript.

### fastapi-definition-1 (definition, new)

Prompt: Which file and line defines the handleError function? One line.

    rg -n -w 'handleError' .

    frontend/src/utils.ts:17:export const handleError = function (this: (msg: string) => void, err: Error) {

There are 26 hits: 12 imports, 13 `handleError.bind(showErrorToast)` uses and this one definition. Two other
files with a "utils" name could be confused with it: frontend/src/lib/utils.ts (defines `cn`) and
backend/app/utils.py. Line `17` tells them apart.

Graph: no node for `handleError` (limit 5).

## Candidates not used

- `get_user_by_email`: 8 non-test call sites, above the spec's 3 to 6. As an impact target it gives 9
  functions, above the cap of 8.
- `get_password_hash` as an impact target: 4 direct callers plus 5 at level 2 make 9, above 8. It is used
  as a callers question instead.
- `send_email` callers (3 handlers in 3 files) fit the spec. One of them is the route handler `test_email`,
  which "Ignore tests" invites a model to drop, so `get_password_hash` was taken instead.
- scripts/prepare_release.py (a Typer CLI with `prepare`, `current_version` and `release_notes` commands)
  has real two-level structure. `get_current_version` has 4 callers and then `prepare`; `parse_version` goes
  through `bump_version` and `update_release_notes` up to `prepare_release`. The names are substrings of each
  other and of the file name (`current_version` of `get_current_version`, `release_notes` of
  `update_release_notes`, `prepare_release` of `prepare_release.py`), so a substring key could not tell a
  full answer from a partial one. The directory is also not indexed.
- The generated client (frontend/src/client/**) has calls between files. `serializePrimitiveParam` has 4
  callers in 3 files, but one caller is an inner closure (`querySerializer` inside `createQuerySerializer`).
  The level above runs through a callback parameter (`getUrl` calls the `querySerializer` it is passed), so
  the impact answer is not unique.
- React hooks: `useAuth` (10 callers), `useCustomToast` (12) and `useSidebar` (7) are above the range.
  `useTheme` (4 callers in 3 files) fits, but was not used, so the frontend has only one callers question
  and theme-provider.tsx stays for the error question.
- Impact targets whose level 2 is empty (every caller is a route handler), so they have no real second
  level: `crud.update_user`, `send_email`, `generate_password_reset_token`, `authenticate`.
