# dub: evidence for the v2 question set

> Answers are graded by whole-word, case-insensitive matching (`bench/run-copilot.mjs`, `PLAN-v2.md`). Notes below
> that discuss one `must` entry being a substring of another were written for plain substring matching; under
> whole-word matching those overlaps no longer let an answer that omits the shorter name pass.

Answer key for `questions-v2/dub.json`, checked at the pinned commit.

- Repository: https://github.com/dubinc/dub at `d85e8839c3ee62c916f125b5b0710eb12a1f7892` (the v1 pin), checked out at `dub/`.
  `git rev-parse HEAD` in `dub/` printed that sha and `git status` was clean. The checkout was not modified.
- Every command below was run from `dub/` with ripgrep 14.1.1. Where hidden or git-ignored files could matter
  (`.env.example`, ignored build files), the search was repeated with `--hidden --no-ignore`.
- "Ignore tests" excludes `apps/web/tests/`, `apps/web/playwright/`, `*.test.*` and `*.spec.*` files, and test
  utilities. Scripts under `apps/web/scripts/` are non-test code; none of the answers below involve them.
- The graph only proposed candidates. Queries ran against the codebase-memory-mcp index of `dub/` (project name
  written `<project>` here), either as `printf '%s' '{"project":"<project>","query":"…"}' | codebase-memory-mcp cli query_graph`
  (a full dump of CALLS edges, filtered in a script) or as the same Cypher through the cbm-lean `graph_cypher` tool.
  Every `must` entry comes from `rg` and from reading the code, never from the graph alone.
- `must` entries are matched case-insensitively as substrings of the final answer. Each question below has a
  reference answer, and a script confirmed that every `must` entry is a substring of it.

## Summary

| id | type | new or reused | must |
|---|---|---|---:|
| callers | callers | reused | 5 |
| callees | callees | reused | 6 |
| dub-callers-1 | callers | new | 6 |
| call-chain | chain | reused | 3 |
| dub-chain-1 | chain | new | 4 |
| dub-impact-1 | impact | new | 5 |
| dub-impact-2 | impact | new | 6 |
| dub-impact-3 | impact | new | 6 |
| config-value | config | reused | 3 |
| const-value | config | reused | 2 |
| env-flag | env | reused | 2 |
| dub-env-1 | env | new | 2 |
| error-string | error | reused | 2 |
| dub-error-1 | error | new | 1 |
| class-def | definition | reused | 2 |
| dub-definition-1 | definition | new | 1 |

8 structural and 8 exact: 3 callers or callees, 2 chain, 3 impact, 2 config, 2 env, 2 error, 2 definition.

## v1 questions

Reused: the eight that fit a v2 type. Their `id`, `kind`, `prompt` and `must` are byte-identical to
`questions-large.json` (checked by script); only `type` was added. Every `must` entry was re-checked at the pin
(sections below).

Dropped, because no v2 type covers them:

- `symbol-source` asks for the full source of `assertValidDateRangeForPlan`. v2 has no source-retrieval type, and
  a definition question asks only for file:line, so this answer would be far longer than the other definition
  answers.
- `architecture` asks for the module layout of the monorepo.
- `route-scan` asks for the HTTP methods exported by route files.
- `import-site` asks which files import `LemonSqueezyClient`. Imports are not calls, so it is not a callers question.

Format differences kept from v1: `env-flag` asks for the line, not the function; `error-string` goes from a
behavior to the message, not from a message to its line; `class-def` keeps file and line as separate entries.
The new questions follow the v2 spec and use a single `file:line` entry where the prompt asks for a line.

Id collision: the reused ids (`callers`, `callees`, `call-chain`, `config-value`, `const-value`, `env-flag`,
`error-string`, `class-def`) are the same strings as ids in the v1 small-repository set (`questions.json`). If the
v2 sets for several repositories are merged into one file, select questions by repo and id, not by id alone.

## How the new questions were chosen

- **callers**: from the CALLS dump, functions under `apps/web/lib` with 3 to 6 distinct non-test callers in at least
  two files and a name held by one node only (248 candidates), then `rg`. `recomputePartnerPayoutState` has six
  call sites in six files: Stripe Connect v1 and v2 webhook handlers, a server action, and the PayPal OAuth callback.
- **chain**: every simple CALLS path of 3 or 4 hops from a route-file module or a CLI command module, keeping paths
  that are the only path to their target. Paths that start with an auth wrapper (`withWorkspace`, `withSession`,
  `withPartnerProfile` and similar) were dropped. A CLI path (`dub login` → `oauthCallbackServer` → `setConfig`) was
  also unique, but only three functions long.
- **impact**: functions with 2 or 3 direct non-test callers and a two-level caller set of 4 to 8 functions, then
  `rg` at both levels. Rejected after checking:
  - `configureVercelNameservers`: also called by a one-off script (`apps/web/scripts/customers/annature/import-domains.ts:75`).
  - `processPartnerDeactivation`: its direct callers `deactivatePartner` and `bulkDeactivatePartners` are
    substrings of their own callers `deactivatePartnerAction` and `bulkDeactivatePartnersAction`, so the key
    could not tell the two levels apart.
  - `holdPendingCommissions`: shares callers with the callers question.
  - `deactivateProgram` and `syncUserPlanToPlain`: both go through `updateWorkspacePlan`, which is already in
    `dub-impact-2`.
- **exact**: `rg` for `process.env.X` reads that occur once in non-test code, `throw` statements whose message is
  unique in the repository and sits on the throw line, and exported types with one definition.

---

## callers (reused)

Prompt: Which functions or route files call createPaymentIntent? Ignore tests. Give the file:line of each call
site, nothing else.

must: `renew/route.ts`, `renewal-payments/route.ts`, `retry-failed/route.ts`, `process-payout-invoice-failure.ts`,
`initiate-premium-domain-registration.ts`

```
rg -n -w createPaymentIntent apps packages
```

Definition and call sites (each other hit is the matching `import` line):

```
apps/web/lib/stripe/create-payment-intent.ts:4:export const createPaymentIntent = async ({
apps/web/app/(ee)/api/admin/domains/renew/route.ts:122:  const { paymentIntent } = await createPaymentIntent({
apps/web/app/(ee)/api/cron/domains/renewal-payments/route.ts:154:    const res = await createPaymentIntent({
apps/web/app/(ee)/api/cron/invoices/retry-failed/route.ts:82:  await createPaymentIntent({
apps/web/app/(ee)/api/stripe/webhook/utils/process-payout-invoice-failure.ts:89:      const { paymentIntent, paymentMethod } = await createPaymentIntent({
apps/web/lib/api/domains/initiate-premium-domain-registration.ts:136:  const { paymentIntent } = await createPaymentIntent({
```

Five call sites in five files; no test or script hits. Each `must` entry is one file. `renew/route.ts` is not a
substring of `renewal-payments/route.ts`. Graph: the same five callers (three route modules,
`initiatePremiumDomainRegistration`, `processPayoutInvoiceFailure`).

Reference answer: the five `file:line` values above.

## callees (reused)

Prompt: What functions does approvePartner call? List the callee names only.

must: `getGroupOrThrow`, `throwIfPartnersLimitExceeded`, `queuePartnerSearchSync`, `dispatchWorkflows`,
`trackActivityLog`, `trackApplicationEvents`

```
rg -n -w 'getGroupOrThrow|throwIfPartnersLimitExceeded|queuePartnerSearchSync|dispatchWorkflows|trackActivityLog|trackApplicationEvents' apps/web/lib/api/partners/applications/approve-partner.ts
```

```
78:  const group = await getGroupOrThrow({
86:    throwIfPartnersLimitExceeded(program.workspace);
137:      queuePartnerSearchSync({ partnerIds: [partnerId], programId }),
139:      trackActivityLog({
154:      trackApplicationEvents({
160:      dispatchWorkflows({
```

All six calls sit inside `export async function approvePartner({` (lines 19 to 173). Other calls, not required by
the key: `prisma.programEnrollment.findUnique` (25), `new DubApiError` (52, 59, 71), `prisma.$transaction` (85),
`tx.programEnrollment.update` (88), `tx.programApplication.update` (109), `tx.project.update` (122), `waitUntil`
(134), `Promise.allSettled` (135).

Name note: only one function is called `approvePartner`. The name also belongs to an OpenAPI object
(`apps/web/lib/openapi/partners/approve-partner.ts:6: export const approvePartner: ZodOpenApiOperationObject = {`)
and to a local alias (`executeAsync: approvePartner` in
`apps/web/app/app.dub.co/(dashboard)/[slug]/(ee)/program/partners/applications/rejected/page-client.tsx:463`). The
graph wrongly records a call from `onConfirm` in that page to the function; the call goes to the alias.

Reference answer: getGroupOrThrow, throwIfPartnersLimitExceeded, queuePartnerSearchSync, trackActivityLog,
trackApplicationEvents, dispatchWorkflows.

## dub-callers-1 (new)

Prompt: Which functions call recomputePartnerPayoutState? Ignore tests. Answer with the caller name and file:line
of each call site, nothing else.

must: `recipient-configuration-updated.ts`, `recipient-account-closed.ts`, `account-updated.ts`,
`account-application-deauthorized.ts`, `set-default-payout-method.ts`, `paypal/callback/route.ts`

```
rg -n -w recomputePartnerPayoutState apps packages
rg -n --hidden --no-ignore 'recomputePartnerPayoutState|recompute-partner-payout-state' .   # no re-export, alias or ignored file
rg -n '^(export )?(async )?(function|const) ' <each caller file>                          # enclosing function
```

| call site | enclosing function (lines) |
|---|---|
| `apps/web/app/(ee)/api/stripe/connect/v2/webhook/recipient-configuration-updated.ts:44` `} = await recomputePartnerPayoutState(partner);` | `recipientConfigurationUpdated` (8-84) |
| `apps/web/app/(ee)/api/stripe/connect/v2/webhook/recipient-account-closed.ts:36` `await recomputePartnerPayoutState({` | `recipientAccountClosed` (6-53) |
| `apps/web/app/(ee)/api/stripe/connect/webhook/account-updated.ts:52` `await recomputePartnerPayoutState(partner);` | `accountUpdated` (23-248) |
| `apps/web/app/(ee)/api/stripe/connect/webhook/account-application-deauthorized.ts:35` `await recomputePartnerPayoutState({` | `accountApplicationDeauthorized` (5-52) |
| `apps/web/lib/actions/partners/set-default-payout-method.ts:51` `const { activePayoutMethods } = await recomputePartnerPayoutState(partner);` | `setDefaultPayoutMethodAction` (19 to end of file) |
| `apps/web/app/(ee)/api/paypal/callback/route.ts:70` `await recomputePartnerPayoutState({` | `GET` (13-116) |

The definition is `apps/web/lib/payouts/recompute-partner-payout-state.ts:19`. The only other hit is the log label
`"[recomputePartnerPayoutState]"` at line 106 of that file. There are no test or script references. Each caller
file imports the function under its own name.

The key uses file names: two callers are anonymous bodies (the server action passed to `.action(…)` and the GET
handler), and the graph reports `set-default-payout-method.ts` as a module. Lines are left out because four of the six
calls are multi-line statements whose first line is not the line with the function name: recipient-account-closed.ts
35/36, account-application-deauthorized.ts 34/35, paypal/callback/route.ts 69/70, and
recipient-configuration-updated.ts 38/44.

Graph: the same six callers.

Reference answer: the six rows above, as caller name plus `file:line`.

## call-chain (reused)

Prompt: Trace the call chain from the HTTP endpoint that approves a partner application down to the database
write. Answer as an ordered list of file:line steps.

must: `approve/route.ts`, `approve-partner.ts`, `programEnrollment.update`

```
rg -n 'approvePartner\(|POST =' 'apps/web/app/(ee)/api/partners/applications/approve/route.ts'
rg -n 'export async function approvePartner|programEnrollment.update' apps/web/lib/api/partners/applications/approve-partner.ts
find apps/web/app -path '*approve*' -name route.ts
```

```
apps/web/app/(ee)/api/partners/applications/approve/route.ts:8:// POST /api/partners/applications/approve – Approve a pending partner
apps/web/app/(ee)/api/partners/applications/approve/route.ts:9:export const POST = withWorkspace(
apps/web/app/(ee)/api/partners/applications/approve/route.ts:17:    await approvePartner({
apps/web/lib/api/partners/applications/approve-partner.ts:19:export async function approvePartner({
apps/web/lib/api/partners/applications/approve-partner.ts:85:  await prisma.$transaction(async (tx) => {
apps/web/lib/api/partners/applications/approve-partner.ts:88:    const programEnrollment = await tx.programEnrollment.update({
```

Path: `POST` (route.ts:9) → `approvePartner` (approve-partner.ts:19) → `tx.programEnrollment.update`
(approve-partner.ts:88). The same transaction also writes `tx.programApplication.update` (109) and
`tx.project.update` (122); the key requires only the enrollment write.

Other route files with "approve" in the path:
- `bounties/[bountyId]/submissions/[submissionId]/approve/route.ts` approves bounty submissions and does not call
  `approvePartner`.
- `workflows/partner-approved/route.ts` (an Upstash workflow endpoint) does not call `approvePartner`.
- `cron/partners/auto-approve/route.ts` reaches `approvePartner` through `autoApprovePartnerJob.execute`
  (`apps/web/lib/jobs/handlers/auto-approve-partner-job.ts:136`). An answer that took this route would still match
  `approve/route.ts`, which is a substring of `auto-approve/route.ts`.

The server action `approvePartnerApplicationAction` (`apps/web/lib/actions/partners/approve-partner-application.ts:14`,
call at :27) also calls `approvePartner`, but it is not an API route.

Reference answer: route.ts:9 POST → route.ts:17 approvePartner(…) → approve-partner.ts:19 approvePartner →
approve-partner.ts:88 tx.programEnrollment.update.

## dub-chain-1 (new)

Prompt: Trace the call path from the GET /api/cron/trial-emails handler down to differenceInCalendarDaysUTC.
Answer as an ordered list of steps, each with the function name and file:line, nothing else.

must: `executeTrialEmailCronBatch`, `runTrialEmailCron`, `getDueTrialEmailTypes`, `differenceInCalendarDaysUTC`

```
rg -n -w 'executeTrialEmailCronBatch|runTrialEmailCron|getDueTrialEmailTypes|differenceInCalendarDaysUTC' apps packages -g '!**/tests/**'
rg -n '^import' apps/web/lib/cron/with-cron.ts
```

```
apps/web/app/(ee)/api/cron/trial-emails/route.ts:23:async function executeTrialEmailCronBatch(startingAfter?: string) {
apps/web/app/(ee)/api/cron/trial-emails/route.ts:25:  const result = await runTrialEmailCron({
apps/web/app/(ee)/api/cron/trial-emails/route.ts:57:export const GET = withCron(async () => executeTrialEmailCronBatch(undefined));
apps/web/app/(ee)/api/cron/trial-emails/route.ts:62:  return await executeTrialEmailCronBatch(startingAfter);
apps/web/lib/email/run-trial-email-cron.ts:50:export async function runTrialEmailCron({
apps/web/lib/email/run-trial-email-cron.ts:133:    const due = getDueTrialEmailTypes({
apps/web/lib/email/trial-email-schedule.ts:20:function differenceInCalendarDaysUTC(left: Date, right: Date): number {
apps/web/lib/email/trial-email-schedule.ts:27:export function getDueTrialEmailTypes({
apps/web/lib/email/trial-email-schedule.ts:42:  const daysUntilEnd = differenceInCalendarDaysUTC(trialEndsAt, now);
```

The path, in order:

1. `GET` handler, `apps/web/app/(ee)/api/cron/trial-emails/route.ts:57`
2. `executeTrialEmailCronBatch`, route.ts:23 (called at :57)
3. `runTrialEmailCron`, `apps/web/lib/email/run-trial-email-cron.ts:50` (called at route.ts:25)
4. `getDueTrialEmailTypes`, `apps/web/lib/email/trial-email-schedule.ts:27` (called at run-trial-email-cron.ts:133, inside `runTrialEmailCron`, lines 50-217)
5. `differenceInCalendarDaysUTC`, trial-email-schedule.ts:20, not exported (called at :42, inside `getDueTrialEmailTypes`)

The path is unique. Each function after `executeTrialEmailCronBatch` has exactly one non-test caller.
`executeTrialEmailCronBatch` is also called by the POST handler (:62), and the prompt fixes GET.
`withCron` (`apps/web/lib/cron/with-cron.ts`) imports nothing from the trial-email modules. Tests call
`runTrialEmailCron` and `getDueTrialEmailTypes` (`apps/web/tests/email/`), but a test cannot be on a path that
starts at the GET handler.

The key holds the three intermediate functions and the target; the target is also named in the prompt. The entry
is left out: the prompt fixes it, it is an anonymous arrow wrapped in `withCron`, and a correct answer can name it
as "GET /api/cron/trial-emails" or by its file. An answer that also lists `withCron` is neither required nor
penalized.

Graph: a 4-hop Cypher query ending at `differenceInCalendarDaysUTC` returns exactly one row: trial-emails/route.ts
(module) → executeTrialEmailCronBatch → runTrialEmailCron → getDueTrialEmailTypes → differenceInCalendarDaysUTC.

Reference answer: the five steps above.

## dub-impact-1 (new)

Prompt: If the signature of fundFinancialAccount changes, which non-test functions call it directly, and which
functions call those? Answer with the name and file:line of each function, as two lists (direct callers, then
their callers), nothing else.

must: `createStablecoinPayout`, `queueStripePayouts`, `forceWithdrawal`, `send-stripe-payout/route.ts`,
`charge-succeeded/route.ts`

```
rg -n -w 'fundFinancialAccount|createStablecoinPayout|queueStripePayouts' apps packages
rg -n --hidden --no-ignore 'fundFinancialAccount|fund-financial-account' .
```

`fundFinancialAccount` is defined at `apps/web/lib/stripe/fund-financial-account.ts:13`.

Direct callers:

```
apps/web/lib/partners/create-stablecoin-payout.ts:38:export const createStablecoinPayout = async ({
apps/web/lib/partners/create-stablecoin-payout.ts:268:    await fundFinancialAccount({
apps/web/app/(ee)/api/cron/payouts/charge-succeeded/queue-stripe-payouts.ts:16:export async function queueStripePayouts({
apps/web/app/(ee)/api/cron/payouts/charge-succeeded/queue-stripe-payouts.ts:65:        await fundFinancialAccount({
```

(`createStablecoinPayout` is the only top-level function in its 428-line file.)

Their callers:

```
apps/web/app/(ee)/api/cron/payouts/send-stripe-payout/route.ts:18:export const POST = withCron(async ({ rawBody }) => {
apps/web/app/(ee)/api/cron/payouts/send-stripe-payout/route.ts:53:      await createStablecoinPayout({
apps/web/lib/actions/partners/force-withdrawal.ts:41:export const forceWithdrawal = async (
apps/web/lib/actions/partners/force-withdrawal.ts:55:      await createStablecoinPayout({
apps/web/app/(ee)/api/cron/payouts/charge-succeeded/route.ts:23:export const POST = withCron(async ({ rawBody }) => {
apps/web/app/(ee)/api/cron/payouts/charge-succeeded/route.ts:100:      queueStripePayouts({
```

That is 5 functions in all, with no test or script callers. Grep noise that is not a call: comments naming
`fundFinancialAccount` (queue-stripe-payouts.ts:50) and `createStablecoinPayout` (queue-stripe-payouts.ts:58), and
a log label in create-stablecoin-payout.ts:365. `forceWithdrawalAction` (force-withdrawal.ts:12) calls
`forceWithdrawal` at :37, which is a third level and not asked for. `charge-succeeded/route.ts` does not match the
sibling file `charge-succeeded/queue-stripe-payouts.ts`.

Graph: the same two direct callers and the same three second-level callers (the POST handlers appear as their route
modules).

Reference answer: direct callers createStablecoinPayout, queueStripePayouts; their callers the POST handler in
send-stripe-payout/route.ts, forceWithdrawal, and the POST handler in charge-succeeded/route.ts.

## dub-impact-2 (new)

Prompt: If the signature of getBillingStartDate changes, which non-test functions call it directly, and which
functions call those? Answer with the name and file:line of each function, as two lists (direct callers, then
their callers), nothing else.

must: `recomputeWorkspaceUsage`, `getNetworkInvitesUsage`, `updateWorkspacePlan`, `message-partner.ts`,
`invite-partner-from-network.ts`, `invites-usage/route.ts`

```
rg -n -w 'getBillingStartDate|recomputeWorkspaceUsage|getNetworkInvitesUsage' apps packages
rg -n '^(export )?(async )?(function|const) ' <each caller file>
```

`getBillingStartDate` is defined in `packages/utils/src/functions/datetime/billing-utils.ts:54` and imported from
`@dub/utils`, so the question crosses from a package into the app.

Direct callers:

```
apps/web/lib/api/billing/recompute-workspace-usage.ts:8:export async function recomputeWorkspaceUsage(
apps/web/lib/api/billing/recompute-workspace-usage.ts:11:  const billingStart = getBillingStartDate(workspace.billingCycleStart);
apps/web/lib/api/partners/get-network-invites-usage.ts:5:export async function getNetworkInvitesUsage(
apps/web/lib/api/partners/get-network-invites-usage.ts:17:            gt: getBillingStartDate(workspace.billingCycleStart),
apps/web/lib/api/partners/get-network-invites-usage.ts:22:            gt: getBillingStartDate(workspace.billingCycleStart),
```

Their callers:

```
apps/web/app/(ee)/api/stripe/webhook/utils/update-workspace-plan.ts:34:export async function updateWorkspacePlan({
apps/web/app/(ee)/api/stripe/webhook/utils/update-workspace-plan.ts:110:    ? await recomputeWorkspaceUsage(workspace)
apps/web/lib/messages/message-partner.ts:34:export const messagePartnerAction = authActionClient
apps/web/lib/messages/message-partner.ts:115:      const networkInvitesUsage = await getNetworkInvitesUsage(workspace);
apps/web/lib/actions/partners/invite-partner-from-network.ts:19:export const invitePartnerFromNetworkAction = authActionClient
apps/web/lib/actions/partners/invite-partner-from-network.ts:29:    const networkInvitesUsage = await getNetworkInvitesUsage(workspace);
apps/web/app/(ee)/api/network/partners/invites-usage/route.ts:6:export const GET = withWorkspace(
apps/web/app/(ee)/api/network/partners/invites-usage/route.ts:8:    const usage = await getNetworkInvitesUsage(workspace);
```

That is 6 functions in all, with no test or script callers. In each caller file the enclosing declaration shown is
the last top-level declaration before the call. The key uses function names for named functions, and file names
for the two server actions and the route handler: their bodies are anonymous closures, and the graph reports them
as modules.

Graph: the same direct callers and second-level callers.

Reference answer: direct callers recomputeWorkspaceUsage, getNetworkInvitesUsage; their callers
updateWorkspacePlan, messagePartnerAction (message-partner.ts), invitePartnerFromNetworkAction
(invite-partner-from-network.ts), and the GET handler in network/partners/invites-usage/route.ts.

## dub-impact-3 (new)

Prompt: If the signature of resolvePartnerMacros changes, which non-test functions call it directly, and which
functions call those? Answer with the name and file:line of each function, as two lists (direct callers, then
their callers), nothing else.

must: `applyAppsFlyerParameters`, `extractAndResolveUtmParams`, `generatePartnerLink`, `applyGroupUtmToLink`,
`update-default-links/route.ts`, `sync-group-utm-job.ts`

```
rg -n -w 'resolvePartnerMacros|applyAppsFlyerParameters|extractAndResolveUtmParams' apps packages
rg -n --hidden --no-ignore 'resolvePartnerMacros|partners/macros' .
```

`resolvePartnerMacros` is defined at `apps/web/lib/partners/macros.ts:43`.

Direct callers:

```
apps/web/lib/integrations/appsflyer/apply-parameters.ts:10:export function applyAppsFlyerParameters({
apps/web/lib/integrations/appsflyer/apply-parameters.ts:22:    urlObj.searchParams.set(key, resolvePartnerMacros(value, context));
apps/web/lib/api/utm/extract-and-resolve-utm-params.ts:10:export const extractAndResolveUtmParams = (
apps/web/lib/api/utm/extract-and-resolve-utm-params.ts:23:      const resolved = resolvePartnerMacros(value, context).slice(
```

(The call at :23 is inside a `.map` callback in the body of `extractAndResolveUtmParams`, lines 10-31.)

Their callers:

```
apps/web/app/(ee)/api/cron/groups/update-default-links/route.ts:39:export async function POST(req: Request) {
apps/web/app/(ee)/api/cron/groups/update-default-links/route.ts:176:          url = applyAppsFlyerParameters({
apps/web/lib/api/partners/generate-partner-link.ts:91:export const generatePartnerLink = async ({
apps/web/lib/api/partners/generate-partner-link.ts:153:      processedLink.url = applyAppsFlyerParameters({
apps/web/lib/jobs/handlers/sync-group-utm-job.ts:27:export const syncGroupUtmJob = defineJob({
apps/web/lib/jobs/handlers/sync-group-utm-job.ts:30:  async handle(input) {
apps/web/lib/jobs/handlers/sync-group-utm-job.ts:116:        const resolvedUtmParams = extractAndResolveUtmParams(
apps/web/lib/jobs/handlers/sync-group-utm-job.ts:121:        const resolvedUtmColumns = extractAndResolveUtmParams(
apps/web/lib/api/utm/apply-group-utm-to-link.ts:7:export function applyGroupUtmToLink<T extends ProcessedLinkProps>({
apps/web/lib/api/utm/apply-group-utm-to-link.ts:36:  const resolvedUtmParams = extractAndResolveUtmParams(utmTemplate, utmContext);
apps/web/lib/api/utm/apply-group-utm-to-link.ts:37:  const resolvedUtmColumns = extractAndResolveUtmParams(
```

That is 6 functions in all, with no test or script callers. `generatePartnerLink` is the last declaration in its
176-line file, and `POST` is the only function in update-default-links/route.ts. Not a call:
`sync-group-utm-job.ts:105: } & ReturnType<typeof extractAndResolveUtmParams>;` is a type reference. Four other
files import different names from `@/lib/partners/macros`. The job handler is a method, so the key uses its file
name.

Graph: the same direct callers and second-level callers (the job handler appears as `handle`).

Reference answer: direct callers applyAppsFlyerParameters, extractAndResolveUtmParams; their callers the POST
handler in cron/groups/update-default-links/route.ts, generatePartnerLink, syncGroupUtmJob.handle
(sync-group-utm-job.ts), applyGroupUtmToLink.

## config-value (reused)

Prompt: What is the highest page number allowed for offset pagination in the API, and which constant in which file
sets it? One line.

must: `1000`, `MAX_OFFSET_PAGE`, `pagination.ts`

```
rg -n -w MAX_OFFSET_PAGE apps packages
```

```
apps/web/lib/api/pagination.ts:22:export const MAX_OFFSET_PAGE = 1000;
apps/web/lib/api/pagination.ts:73:  if (page > MAX_OFFSET_PAGE) {
apps/web/lib/api/pagination.ts:76:      message: `Page is too big (cannot be more than ${MAX_OFFSET_PAGE}), recommend using cursor-based pagination instead.`,
```

Pages above 1000 are rejected, so 1000 is the highest allowed. The other hits are test names
(`tests/links/list-links.test.ts:145`, `tests/commissions/pagination.test.ts:115`,
`playwright/api/customers/customers-pagination.spec.ts:37`). Known weakness, unchanged from v1: `pagination.ts`
also matches `use-pagination.ts`.

Reference answer: 1000, set by MAX_OFFSET_PAGE in apps/web/lib/api/pagination.ts:22.

## const-value (reused)

Prompt: What is the value of DEFAULT_PAGINATION_LIMIT, and which file defines it? One line.

must: `100`, `misc.ts`

```
rg -n -w DEFAULT_PAGINATION_LIMIT apps packages
```

```
packages/utils/src/constants/misc.ts:31:export const DEFAULT_PAGINATION_LIMIT = 100;
```

There is a single definition; the other hits import or use the constant (`packages/ui/src/hooks/use-pagination.ts:1, 11`,
`apps/web/lib/zod/schemas/analytics.ts:10, 528, 541`). Known weaknesses, unchanged from v1: `100` also matches
`1000`, and `misc.ts` also matches `apps/web/lib/zod/schemas/misc.ts`.

Reference answer: 100, defined in packages/utils/src/constants/misc.ts:31.

## env-flag (reused)

Prompt: Which file reads the environment variable PARTNER_SEARCH_READ_ENABLED, and at which line?

must: `search/provider.ts`, `34`

```
rg -n --hidden PARTNER_SEARCH_READ_ENABLED apps packages
```

```
apps/web/lib/api/partners/search/provider.ts:33:export function isPartnerSearchReadEnabled(): boolean {
apps/web/lib/api/partners/search/provider.ts:34:  return process.env.PARTNER_SEARCH_READ_ENABLED?.trim() === "true";
```

The other hits are `apps/web/.env.example:32` (documentation only) and
`apps/web/tests/partners/partner-search-provider-switches.test.ts`, which sets and deletes the variable. This v1
prompt asks for the line; `dub-env-1` asks for the function, as the v2 spec does.

Reference answer: apps/web/lib/api/partners/search/provider.ts:34.

## dub-env-1 (new)

Prompt: Which file and function read the environment variable VERCEL_GIT_COMMIT_REF? Answer with the file path and
the function name, nothing else.

must: `send-via-resend.ts`, `resendEmailForOptions`

```
rg -n --hidden --no-ignore VERCEL_GIT_COMMIT_REF .
rg -n 'const resendEmailForOptions|^};' packages/email/src/send-via-resend.ts
```

```
packages/email/src/send-via-resend.ts:35:const resendEmailForOptions = (
packages/email/src/send-via-resend.ts:54:  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF;
packages/email/src/send-via-resend.ts:89:};
```

This is the only mention of the variable in the repository: it is not in `.env.example` or `turbo.json`, and no
test references it. The read is inside `resendEmailForOptions` (lines 35-89), and the value tags the email subject
on preview deployments (line 61).

Reference answer: packages/email/src/send-via-resend.ts, resendEmailForOptions.

## error-string (reused)

Prompt: Where does the API reject a metadata filter that mixes AND and OR? Give the file and the exact error message.

must: `metadata-filters.ts`, `Metadata query cannot mix AND and OR`

```
rg -n -F 'Metadata query cannot mix AND and OR' apps packages
```

`apps/web/lib/api/commissions/metadata-filters.ts`, inside `parseCommissionMetadataQuery` (starts at line 109):

```
129:  if (hasAnd && hasOr) {
130:    throw new DubApiError({
131:      code: "unprocessable_entity",
132:      message: "Metadata query cannot mix AND and OR.",
```

The other hits are test expectations (`apps/web/tests/commissions/metadata-filters.test.ts:142`,
`apps/web/playwright/api/commissions/commissions-list.spec.ts:185`).

Reference answer: apps/web/lib/api/commissions/metadata-filters.ts:132, "Metadata query cannot mix AND and OR."

## dub-error-1 (new)

Prompt: Which file and line raises the error "Fast settlement is only supported for ACH payment."? Answer as
file:line, nothing else.

must: `confirm-payouts.ts:171`

```
rg -n --hidden --no-ignore -F 'Fast settlement is only supported for ACH payment.' .
rg -n -i --hidden --no-ignore 'fast settlement is only supported' .
```

`apps/web/lib/actions/partners/confirm-payouts.ts`, inside `confirmPayoutsAction` (starts at line 52):

```
170:    if (fastSettlement && paymentMethod.type !== "us_bank_account") {
171:      throw new Error("Fast settlement is only supported for ACH payment.");
```

Both searches return only this line, so no test, UI string or log repeats the message. The `throw` and the message
share line 171, so the line is unambiguous.

Reference answer: apps/web/lib/actions/partners/confirm-payouts.ts:171.

## class-def (reused)

Prompt: Which file and line defines the LemonSqueezyClient class? One line.

must: `lemonsqueezy/client.ts`, `59`

```
rg -n 'class LemonSqueezyClient' apps packages
```

```
apps/web/lib/lemonsqueezy/client.ts:59:export class LemonSqueezyClient extends HttpBaseClient {
```

Graph: a Class node at the same file and line.

Reference answer: apps/web/lib/lemonsqueezy/client.ts:59.

## dub-definition-1 (new)

Prompt: Which file and line defines the ProcessedLinkProps type? Answer as file:line, nothing else.

must: `lib/types.ts:399`

```
rg -n -e '(type|interface) ProcessedLinkProps\b' apps packages
rg -c -w ProcessedLinkProps apps packages      # 17 files, 40 lines mention the name
```

```
apps/web/lib/types.ts:399:export type ProcessedLinkProps = Omit<NewLinkProps, ProcessedLinkOverrides> &
```

This is the only definition (the declaration continues on the next lines). One test file,
`apps/web/tests/misc/apply-group-utm-to-link.test.ts`, uses the type without defining it. The key says
`lib/types.ts:399` rather than `types.ts:399` because many files in the repository are named `types.ts`. Graph: a
Type node at `apps/web/lib/types.ts:399`.

Reference answer: apps/web/lib/types.ts:399.
