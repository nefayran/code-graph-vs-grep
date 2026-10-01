# vscode: evidence for the v2 question set

> Answers are graded by whole-word, case-insensitive matching (`bench/run-copilot.mjs`, `PLAN-v2.md`). Notes below
> that discuss one `must` entry being a substring of another were written for plain substring matching; under
> whole-word matching those overlaps no longer let an answer that omits the shorter name pass.

Answer key for `questions-v2/vscode.json`, checked at the pinned commit.

- Repository: https://github.com/microsoft/vscode at `ec2e580674cdb512aa9b2a9596ab35d8a9590f1e`, a shallow clone
  written `<repo>/` here. `git rev-parse HEAD` in `<repo>/` printed that sha and `git status --short` printed
  nothing. The checkout was not modified, fetched or reindexed.
- Every command below was run from `<repo>/` with ripgrep 14.1.1 and `--sort path`, so the order of output lines is
  reproducible. A command without a path argument searches the whole checkout (`src/`, `extensions/`, `build/`,
  `cli/`, `scripts/`, `test/`, `resources/`), so a single hit there is the only occurrence in the repository. In the
  output below, indentation after `file:line:` is collapsed to one space and lines longer than 150 characters are cut
  and end in `…`.
- "Ignore tests" excludes files under any `test/` directory and files named `*.test.ts`. The same rule covers
  `*.integrationTest.ts` and the fixture `src/vs/workbench/api/test/browser/extHostDocumentData.test.perf-data.ts`.
- `extensions/copilot/src/util/vs/` vendors copies of many `src/vs/base` and `src/vs/editor` files, so a name defined in
  one of those files is defined twice in the repository. Every name used below was checked against the whole checkout,
  not only `src/vs`.
- The graph only proposed candidates. Queries ran against the codebase-memory-mcp index of `<repo>/` (218,883 nodes,
  1,057,332 edges; project written `<project>`), through the cbm-lean `graph_cypher` tool and through
  `printf '%s' '{"project":"<project>","query":"…"}' | codebase-memory-mcp cli query_graph` (one dump of all CALLS
  edges out of `Function` nodes, filtered in a script). A precomputed list of uniquely named functions and methods
  with 3 to 6 graph callers was the starting point for callers and impact. Every `must` entry comes from `rg` and from
  reading the code, never from the graph alone.
- Matching: `run-copilot.mjs` counts an answer correct when every `must` entry occurs in it as a whole word,
  case-insensitively, with `[A-Za-z0-9_]` as word characters. Two entries depend on that rule: `handle` in
  vscode-chain-1 is not matched by `handleRequest`, `_handleRoot` or the prompt's word "handler", and `start` and
  `_start` in vscode-callers-2 do not match each other. A script ran the driver's own regex over a reference answer
  for every question (each section ends with it): all 16 passed. It also ran nine decoy answers that each drop one
  step (the `handle` hop, `ExtensionHostConnection.start`, `NativeLocalProcessExtensionHost._start`,
  `_getElectronAccelerator`, `getUpdateType`, the two `main.ts` functions) or change one value (`argv.ts` renamed,
  `cursor.ts:270`, `research.ts`); every decoy failed on the entry it targeted.

## Summary

| id | type | must |
|---|---|---:|
| vscode-callers-1 | callers | 6 |
| vscode-callers-2 | callers | 10 |
| vscode-callees-1 | callees | 6 |
| vscode-chain-1 | chain | 6 |
| vscode-chain-2 | chain | 7 |
| vscode-impact-1 | impact | 10 |
| vscode-impact-2 | impact | 9 |
| vscode-impact-3 | impact | 7 |
| vscode-config-1 | config | 3 |
| vscode-config-2 | config | 2 |
| vscode-env-1 | env | 2 |
| vscode-env-2 | env | 2 |
| vscode-error-1 | error | 1 |
| vscode-error-2 | error | 1 |
| vscode-definition-1 | definition | 1 |
| vscode-definition-2 | definition | 1 |

8 structural (2 callers, 1 callees, 2 chain, 3 impact) and 8 exact (2 config, 2 env, 2 error, 2 definition). The
answers are spread over `src/vs/base`, `src/vs/editor`, `src/vs/platform`, `src/vs/code`, `src/vs/server` and
`src/vs/workbench`. Every call that a structural answer lists is a plain call written in the caller's body (a module
function, a namespace or static function, or a `this.` method), so `rg` and reading confirm it without following
dependency injection or event registration. Six of the level-2 calls, three in vscode-impact-2 and three in
vscode-impact-3, sit inside a callback that the caller passes to a scheduler (`DOM.scheduleAtNextAnimationFrame`,
`createCancelablePromise`); the named method that writes the call is the expected caller, and the sections say so.

## How the questions were chosen

- **callers**: candidates from the precomputed list, kept when the name is defined once in the whole checkout, every
  occurrence is under `src/vs/`, and the non-test call sites (3 to 6, in at least two files) are plain calls inside
  named functions. Rejected after checking:
  - `diffSets`: also defined in `extensions/copilot/src/util/vs/base/common/collections.ts`.
  - `createTextBuffer`: `src/vs/editor/test/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.test.ts:155` defines
    its own `createTextBuffer`.
  - `rgDiskPath`: also a property name (`ripgrepFileSearch.ts:23`, `fileSearch.ts:238`).
  - `createWithDirection`: also declared in `src/vs/monaco.d.ts:918`.
- **callees**: from the CALLS dump, module-level functions under `src/vs/{base,editor,platform,code,server}`,
  `src/vs/workbench/services` and `src/vs/workbench/api` with 4 to 6 distinct callees defined in at least two other
  files, a body of at most 45 lines and no arrow function or nested function in it (47 candidates), then reading the
  body. Rejected:
  - `getAllUnboundCommands`: two of its calls (`CommandsRegistry.getCommand`, `isNonEmptyArray`) sit inside the nested
    arrow function `addCommand`, so the expected list would depend on whether calls inside a closure count.
  - `TypeOperations.typeWithInterceptors`: seven callees, all defined in one file (`cursorTypeEditOperations.ts`).
- **chain**: one HTTP handler and one CLI entry point, followed hop by hop with `rg`. At every hop the next function
  has exactly one non-test caller, and that caller is the previous hop, so each path is the only one. Rejected: the
  `_executeFormatDocumentProvider` command (three functions in one file) and the WebSocket upgrade path from
  `handleUpgrade` (after one hop it continues through `protocol.onControlMessage` listeners).
- **impact**: for each clean candidate with 2 to 4 call sites, the enclosing functions at both levels from `rg`
  (private methods searched in their own file, other names in all of `src/vs`), keeping trees of 4 to 8 functions
  with distinct names and no anonymous caller. The three kept trees were then re-checked with `rg` over the whole
  checkout at both levels (sections below). Rejected after checking:
  - `atomicPosition`: its level-2 callers are `MoveOperations.left` and `MoveOperations.right`; `left` and `right` are
    words a wrong answer can contain in prose ("left arrow"), so the key could not tell whether they were found.
  - `deleteEnding`: its level-1 names `_acceptDeleteRange` and `_acceptInsertText` are also defined in
    `sparseMultilineTokens.ts`, `mirrorTextModel.ts` and two files under `extensions/copilot/`.
  - `getGitHubRemoteInfo`: its level-2 caller `asAttachment` is an interface method implemented dozens of times.
  - `withWorkingDirectoryScopeId`: one direct caller is the arrow function `publishScope` declared inside
    `withPublishedWorkingDirectoryIdentities`.
  - `getHoverProviderResultsAsAsyncIterable`: its level-2 callers are anonymous command handlers.
  - `createUpdateURL`: its three direct callers are the platform overrides of the abstract
    `AbstractUpdateService.buildUpdateFeedUrl` (`abstractUpdateService.ts:724`), which `abstractUpdateService.ts`
    also calls through `this` (lines 255 and 660), so the second level depends on dynamic dispatch.
  - `layout2d`: the level-1 method `QuickInputController.updateLayout` has five callers, one of them an event listener.
- **env**: `process.env` reads in non-test `src/vs` code that occur once there, then `rg` over the whole checkout.
  Rejected: `DISTRO_PRODUCT_JSON` (also read in `build/lib/policies/exportPolicyData.ts:125`),
  `VSCODE_SERVER_CUSTOM_GLIBC_LINKER` (also read by shell scripts under `resources/server/bin/` and by
  `cli/src/util/prereqs.rs`), `VSCODE_AGENT_FOLDER` and `VSCODE_CLI_AUTHORITY` (read at module top level, outside any
  function), `XDG_SESSION_TYPE` (read in two files).
- **error**: string literals passed to `throw new Error(…)` or to a `logService` call in non-test code whose text
  occurs once in the checkout, with the call and the message on one line.
- **config** and **definition**: a setting whose default is a named constant in another file, a numeric constant, and
  a class and a type alias each defined once in the checkout. `KeybindingResolver` and `BracketPairsTree` were
  rejected because files under `extensions/copilot/` (test fixtures) define classes with the same names.

## vscode-callers-1

Prompt: Which functions call toElectronAccelerator? Ignore tests. Answer with the caller name and file:line of each call
site, nothing else.

```
$ rg --sort path -n -w toElectronAccelerator
src/vs/base/common/keyCodes.ts:789: export function toElectronAccelerator(keyCode: KeyCode): string | null {
src/vs/platform/keybinding/common/usLayoutResolvedKeybinding.ts:52: return KeyCodeUtils.toElectronAccelerator(chord.keyCode);
src/vs/workbench/services/keybinding/common/macLinuxKeyboardMapper.ts:879: return KeyCodeUtils.toElectronAccelerator(immutableKeyCode);
src/vs/workbench/services/keybinding/common/macLinuxKeyboardMapper.ts:909: return KeyCodeUtils.toElectronAccelerator(constantKeyCode);
src/vs/workbench/services/keybinding/common/windowsKeyboardMapper.ts:406: return KeyCodeUtils.toElectronAccelerator(chord.keyCode);
```

One definition (inside `export namespace KeyCodeUtils`), four call sites in three files, no test call. Enclosing
functions, read in each file:

- `macLinuxKeyboardMapper.ts:872`: `public getElectronAcceleratorLabelForScanCodeChord(chord: ScanCodeChord | null): string | null {`
  in `export class MacLinuxKeyboardMapper` (line 351). Both calls, 879 and 909, are in this method: 879 returns for an
  immutable key code, 909 for a stable key code after the Linux OEM-key check.
- `windowsKeyboardMapper.ts:405`: `public getElectronAcceleratorForKeyBinding(chord: KeyCodeChord): string | null {` in
  `export class WindowsKeyboardMapper` (line 162); line 406 is its only statement.
- `usLayoutResolvedKeybinding.ts:51`: `protected _getElectronAccelerator(chord: KeyCodeChord): string | null {` in
  `export class USLayoutResolvedKeybinding` (line 15); line 52 is its only statement.

`must`: the three method names and the three file names. Graph: the same three callers.

Reference answer:

```
getElectronAcceleratorLabelForScanCodeChord (MacLinuxKeyboardMapper) - src/vs/workbench/services/keybinding/common/macLinuxKeyboardMapper.ts:879
getElectronAcceleratorLabelForScanCodeChord (MacLinuxKeyboardMapper) - src/vs/workbench/services/keybinding/common/macLinuxKeyboardMapper.ts:909
getElectronAcceleratorForKeyBinding (WindowsKeyboardMapper) - src/vs/workbench/services/keybinding/common/windowsKeyboardMapper.ts:406
_getElectronAccelerator (USLayoutResolvedKeybinding) - src/vs/platform/keybinding/common/usLayoutResolvedKeybinding.ts:52
```

## vscode-callers-2

Prompt: Which functions call removeDangerousEnvVariables? Ignore tests. Answer with the caller name and file:line of each
call site, nothing else.

```
$ rg --sort path -n -w removeDangerousEnvVariables
src/vs/base/common/processes.ts:134: export function removeDangerousEnvVariables(env: IProcessEnvironment | undefined): void {
src/vs/base/parts/ipc/node/ipc.cp.ts:16: import { removeDangerousEnvVariables } from '../../../common/processes.js';
src/vs/base/parts/ipc/node/ipc.cp.ts:205: removeDangerousEnvVariables(forkOpts.env);
src/vs/base/test/common/processes.test.ts:50: test('removeDangerousEnvVariables', () => {
src/vs/base/test/common/processes.test.ts:65: processes.removeDangerousEnvVariables(env);
src/vs/platform/utilityProcess/electron-main/utilityProcess.ts:17: import { removeDangerousEnvVariables } from '../../../base/common/processes.js';
src/vs/platform/utilityProcess/electron-main/utilityProcess.ts:294: removeDangerousEnvVariables(env);
src/vs/server/node/extensionHostConnection.ts:14: import { removeDangerousEnvVariables } from '../../base/common/processes.js';
src/vs/server/node/extensionHostConnection.ts:261: removeDangerousEnvVariables(env);
src/vs/server/node/remoteTerminalChannel.ts:12: import { removeDangerousEnvVariables } from '../../base/common/processes.js';
src/vs/server/node/remoteTerminalChannel.ts:216: removeDangerousEnvVariables(resolverEnv as platform.IProcessEnvironment);
src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts:13: import { removeDangerousEnvVariables } from '../../../../base/…
src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts:239: removeDangerousEnvVariables(env);
```

One definition, five non-test call sites in five files, and one test call (`processes.test.ts:65`, excluded). All
imports are plain named imports, no alias. Enclosing functions, each call directly in the method body (the full range
from signature to call was read; no nested function in between):

- `ipc.cp.ts:176`: `private get client(): IPCClient {` in `export class Client` (line 84); call at 205 inside
  `if (!this._client) {`.
- `utilityProcess.ts:276`: `private createEnv(configuration: IUtilityProcessConfiguration): NodeJS.ProcessEnv {` in
  `export class UtilityProcess` (line 153); call at 294.
- `remoteTerminalChannel.ts:193`: `private async _createProcess(uriTransformer: IURITransformer, args: ICreateTerminalProcessArguments)`
  in `export class RemoteTerminalChannel` (line 90); call at 216.
- `extensionHostConnection.ts:247`: `public async start(startParams: IRemoteExtensionHostStartParams): Promise<void> {` in
  `export class ExtensionHostConnection` (line 108); call at 261 inside the method's `try` block.
- `localProcessExtensionHost.ts:221`: `private async _start(): Promise<IMessagePassingProtocol> {` in
  `export class NativeLocalProcessExtensionHost` (line 95); call at 239.

`must`: the five caller names (`client`, `createEnv`, `_createProcess`, `start`, `_start`) and the five file names.
Under whole-word matching `start` is not satisfied by `_start`, and `client` is satisfied by the getter or its class
`Client`, both of which name this call site. Graph: the same five callers.

Reference answer:

```
Client.client (getter) - src/vs/base/parts/ipc/node/ipc.cp.ts:205
UtilityProcess.createEnv - src/vs/platform/utilityProcess/electron-main/utilityProcess.ts:294
RemoteTerminalChannel._createProcess - src/vs/server/node/remoteTerminalChannel.ts:216
ExtensionHostConnection.start - src/vs/server/node/extensionHostConnection.ts:261
NativeLocalProcessExtensionHost._start - src/vs/workbench/services/extensions/electron-browser/localProcessExtensionHost.ts:239
```

## vscode-callees-1

Prompt: What functions does buildUserEnvironment call? List the callee names only.

```
$ rg --sort path -n -w buildUserEnvironment
src/vs/server/node/extensionHostConnection.ts:26: export async function buildUserEnvironment(startParamsEnv: { [key: string]: string | null } = {}, w…
src/vs/server/node/extensionHostConnection.ts:34: logService.error('ExtensionHostConnection#buildUserEnvironment resolving shell environment failed',…
src/vs/server/node/extensionHostConnection.ts:260: const env = await buildUserEnvironment(startParams.env, true, startParams.language, this._environm…
src/vs/server/node/remoteTerminalChannel.ts:29: import { buildUserEnvironment } from './extensionHostConnection.js';
src/vs/server/node/remoteTerminalChannel.ts:217: const baseEnv = await buildUserEnvironment(resolverEnv, !!args.shellLaunchConfig.useShellEnvironment…
```

One definition, at `extensionHostConnection.ts:26`; the body runs to line 69 and contains no nested function. Calls in
the body (read line by line):

```
27:  const nlsConfig = await getNLSConfiguration(language, environmentService.userDataPath);
32:  userShellEnv = await getResolvedShellEnv(configurationService, logService, environmentService.args, process.env);
34:  logService.error('ExtensionHostConnection#buildUserEnvironment resolving shell environment failed', error);
46:  VSCODE_NLS_CONFIG: JSON.stringify(nlsConfig)
49:  const binFolder = environmentService.isBuilt ? join(environmentService.appRoot, 'bin') : join(environmentService.appRoot, 'resources', 'server', 'bin-dev');
50:  const remoteCliBinFolder = join(binFolder, 'remote-cli');
52:  let PATH = readCaseInsensitive(env, 'PATH');
58:  setCaseInsensitive(env, 'PATH', PATH);
61:  env.BROWSER = join(binFolder, 'helpers', isWindows ? 'browser.cmd' : 'browser.sh');
64:  env.VSCODE_RECONNECTION_GRACE_TIME = String(environmentService.reconnectionGraceTime);
65:  logService.trace(`[reconnection-grace-time] Setting VSCODE_RECONNECTION_GRACE_TIME env var … ${Math.floor(…)}s)`);
67:  removeNulls(env);
```

Where the repository callees are defined (imports at `extensionHostConnection.ts:12` `import { delimiter, join } from
'../../base/common/path.js';`, line 19 `getResolvedShellEnv`, line 21 `getNLSConfiguration`):

```
$ rg --sort path -n 'export (async )?function (getNLSConfiguration|getResolvedShellEnv)\b|^export const join\b|^function (readCaseInsensitive|setCaseInsensitive|removeNulls)\b' src/vs
src/vs/base/common/path.ts:1579: export const join = (platformIsWin32 ? win32.join : posix.join);
src/vs/platform/shell/node/shellEnv.ts:32: export async function getResolvedShellEnv(configurationService: IConfigurationService, logService: ILogSer…
src/vs/server/node/extensionHostConnection.ts:352: function readCaseInsensitive(env: { [key: string]: string | undefined }, key: string): string | un…
src/vs/server/node/extensionHostConnection.ts:358: function setCaseInsensitive(env: { [key: string]: unknown }, key: string, value: string): void {
src/vs/server/node/extensionHostConnection.ts:364: function removeNulls(env: { [key: string]: unknown | null }): void {
src/vs/server/node/remoteLanguagePacks.ts:17: export async function getNLSConfiguration(language: string, userDataPath: string): Promise<INLSConfigur…
```

`must`: the six repository functions, defined in four files. Not in `must`: `logService.error` and `logService.trace`
(methods of the injected `ILogService` parameter) and the built-ins `JSON.stringify`, `String` and `Math.floor`; a
correct answer may list them or leave them out. Graph: exactly these six callees.

Reference answer:

```
getNLSConfiguration, getResolvedShellEnv, join, readCaseInsensitive, setCaseInsensitive, removeNulls
```

## vscode-chain-1

Prompt: Trace the call chain from the remote server's HTTP request handler, RemoteExtensionHostAgentServer.handleRequest
in src/vs/server/node/remoteExtensionHostAgentServer.ts, down to renderWorkbenchTemplate. List every function on the
path in order, with file:line for each, nothing else.

The entry point is the request listener of the server's HTTP server, `src/server-main.ts:91`
`const server = http.createServer(async (req, res) => {`, which ends in:

```
$ rg --sort path -n 'handleRequest\(req' src/server-main.ts src/vs/server/node/remoteExtensionHostAgentServer.ts
src/server-main.ts:97: return remoteExtensionHostAgentServer.handleRequest(req, res);
src/vs/server/node/remoteExtensionHostAgentServer.ts:115: public async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<vo…
src/vs/server/node/remoteExtensionHostAgentServer.ts:597: handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
```

(Line 597 is the `IServerAPI` interface declaration. The name `handleRequest` also exists elsewhere, for example
`mcpGatewayService.ts:405` and `timelinePane.ts:645`, which is why the prompt names the class and file.)

```
$ rg --sort path -n '\.handle\(|async handle\(' src/vs/server
src/vs/server/node/remoteExtensionHostAgentServer.ts:193: this._webClientServer.handle(req, res, parsedUrl, pathname);
src/vs/server/node/webClientServer.ts:184: async handle(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: URL, pathname: string): Promi…

$ rg --sort path -n -w 'renderWorkbenchTemplate|_handleRoot' src
src/vs/server/node/webClientServer.ts:122: export function renderWorkbenchTemplate(template: string, values: Record<string, string>): string {
src/vs/server/node/webClientServer.ts:190: return this._handleRoot(req, res, parsedUrl);
src/vs/server/node/webClientServer.ts:302: private async _handleRoot(req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: URL): Promise<vo…
src/vs/server/node/webClientServer.ts:473: data = renderWorkbenchTemplate(workbenchTemplate, values);
src/vs/server/test/node/webClientServer.test.ts:12: import { createNlsUrl, createScriptNonce, createWorkbenchContentSecurityPolicy, isSafeBasePath, r…
src/vs/server/test/node/webClientServer.test.ts:58: const rendered = renderWorkbenchTemplate(template, values);
src/vs/server/test/node/webClientServer.test.ts:86: const rendered = renderWorkbenchTemplate(template, {
src/vs/server/test/node/webClientServer.test.ts:108: const rendered = renderWorkbenchTemplate(template, {
```

The path, read hop by hop:

1. `RemoteExtensionHostAgentServer.handleRequest` (`remoteExtensionHostAgentServer.ts:115`). After the `/version`,
   `/delay-shutdown`, connection-token and `/vscode-remote-resource` branches, line 193 calls
   `this._webClientServer.handle(req, res, parsedUrl, pathname)`; `_webClientServer` is declared
   `WebClientServer | null` at line 75.
2. `WebClientServer.handle` (`webClientServer.ts:184`, in `export class WebClientServer` at line 160). For
   `pathname === '/'`, line 190 returns `this._handleRoot(req, res, parsedUrl)`. Line 193 is its only caller.
3. `WebClientServer._handleRoot` (`webClientServer.ts:302`). Line 473, inside a `try`, sets
   `data = renderWorkbenchTemplate(workbenchTemplate, values)`. Line 190 is its only caller.
4. `renderWorkbenchTemplate` (`webClientServer.ts:122`). Line 473 is its only non-test caller.

Each hop has a single caller, so this is the only path. `must`: the four function names and the two files. The entry
`handle` is a whole word: `handleRequest`, `_handleRoot` and "handler" in the prompt do not match it, so an answer that
skips the second hop fails. Graph: the edges `handleRequest → handle`, `handle → _handleRoot` and
`_handleRoot → renderWorkbenchTemplate` are present, and each target has only that caller.

Reference answer:

```
1. RemoteExtensionHostAgentServer.handleRequest - src/vs/server/node/remoteExtensionHostAgentServer.ts:115
2. WebClientServer.handle - src/vs/server/node/webClientServer.ts:184
3. WebClientServer._handleRoot - src/vs/server/node/webClientServer.ts:302
4. renderWorkbenchTemplate - src/vs/server/node/webClientServer.ts:122
```

## vscode-chain-2

Prompt: Trace the call chain from the CLI entry point main() in src/vs/code/node/cli.ts down to parseArgs in
src/vs/platform/environment/node/argv.ts. List every function on the path in order, with file:line for each, nothing
else.

The `code` CLI bootstrap `src/cli.ts` loads the module, and the module calls `main` at top level:

```
$ rg --sort path -n code/node/cli src/cli.ts
26:await import('./vs/code/node/cli.js');

$ rg --sort path -n 'export async function main|^main\(process.argv\)|argvHelper|environment/node/argv' src/vs/code/node/cli.ts
18:import { buildHelpMessage, buildStdinMessage, buildVersionMessage, NATIVE_CLI_COMMANDS, OPTIONS } from '../../platform/environment/node/argv.js';
19:import { addArg, parseCLIProcessArgv } from '../../platform/environment/node/argvHelper.js';
44:export async function main(argv: string[]): Promise<void> {
592:main(process.argv)

$ rg --sort path -n -w 'parseCLIProcessArgv|parseAndValidate' src
src/vs/code/node/cli.ts:19: import { addArg, parseCLIProcessArgv } from '../../platform/environment/node/argvHelper.js';
src/vs/code/node/cli.ts:48: args = parseCLIProcessArgv(argv);
src/vs/platform/environment/node/argvHelper.ts:13: function parseAndValidate(cmdLineArgs: string[], reportWarnings: boolean): NativeParsedArgs {
src/vs/platform/environment/node/argvHelper.ts:85: return parseAndValidate(args, reportWarnings);
src/vs/platform/environment/node/argvHelper.ts:91: export function parseCLIProcessArgv(processArgv: string[]): NativeParsedArgs {
src/vs/platform/environment/node/argvHelper.ts:99: return parseAndValidate(args, true);
src/vs/workbench/api/test/browser/extHostDocumentData.test.perf-data.ts:6: export const _$_$_expensive = '{"seq":0,"type":"response","command":"compl…

$ rg --sort path -n -w parseArgs src/vs/platform/environment/node src/vs/code/node
src/vs/platform/environment/node/argv.ts:277: export function parseArgs<T>(args: string[], options: OptionDescriptions<T>, errorReporter: ErrorReport…
src/vs/platform/environment/node/argv.ts:320: const subcommandOptions = parseArgs(newArgs, options as OptionDescriptions<Record<string, unknown>>, re…
src/vs/platform/environment/node/argvHelper.ts:11: import { ErrorReporter, NATIVE_CLI_COMMANDS, OPTIONS, parseArgs } from './argv.js';
src/vs/platform/environment/node/argvHelper.ts:44: const args = parseArgs(cmdLineArgs, OPTIONS, reportWarnings ? errorReporter : undefined);
```

(The `perf-data.ts` hit is a JSON string inside a test fixture.)

The path:

1. `main` (`src/vs/code/node/cli.ts:44`); line 48 calls `parseCLIProcessArgv(argv)` inside a `try`.
2. `parseCLIProcessArgv` (`argvHelper.ts:91`); line 99 returns `parseAndValidate(args, true)`.
3. `parseAndValidate` (`argvHelper.ts:13`, module-private); line 44 calls
   `parseArgs(cmdLineArgs, OPTIONS, reportWarnings ? errorReporter : undefined)`.
4. `parseArgs` (`argv.ts:277`).

Why the path is unique: `cli.ts` imports only `addArg` and `parseCLIProcessArgv` from `argvHelper.js`, and only
`buildHelpMessage`, `buildStdinMessage`, `buildVersionMessage`, `NATIVE_CLI_COMMANDS` and `OPTIONS` from `argv.js`;
inside `argv.ts` the only call to `parseArgs` is its own recursion at line 320. The other non-test callers of
`parseArgs` (`rg -n -w parseArgs src --glob '!**/test/**'`: `server.cli.ts:134`, `server.main.ts:37`,
`extensionHostDebugIpc.ts:47`, `agentHostServerMain.ts:162`, `agentHostMain.ts:90`, `ptyHostMain.ts:65`) belong to
other entry points that `cli.ts` does not import. The name `parseArgs` is defined in many files (build scripts,
smoke-test tools, notebook actions), which is why the prompt names the file.

`must`: the four function names and the three files. Graph: `main → parseCLIProcessArgv`,
`parseCLIProcessArgv → parseAndValidate` (the second caller of `parseAndValidate` is `parseMainProcessArgv`, which
`main` does not call) and `parseAndValidate → parseArgs`. The graph also resolves the `assert` call in
`parseAndValidate` to the vendored `extensions/copilot/src/util/vs/base/common/assert.ts`; the code imports Node's
`assert` module, but that callee is off the path.

Reference answer:

```
1. main - src/vs/code/node/cli.ts:44
2. parseCLIProcessArgv - src/vs/platform/environment/node/argvHelper.ts:91
3. parseAndValidate - src/vs/platform/environment/node/argvHelper.ts:13
4. parseArgs - src/vs/platform/environment/node/argv.ts:277
```

## vscode-impact-1

Prompt: If the signature of isInnoSetupInstall changes, which non-test functions call it directly, and which functions
call those? Ignore tests. Answer with the function name and file of each, grouped by level, nothing else.

```
$ rg --sort path -n -w 'isInnoSetupInstall|getWin32UpdateType|installMutex|checkInnoSetupMutex'
src/vs/code/electron-main/app.ts:96: import { isInnoSetupInstall } from '../../platform/update/electron-main/win32UpdateType.js';
src/vs/code/electron-main/app.ts:1683: this.installMutex();
src/vs/code/electron-main/app.ts:1801: private async installMutex(): Promise<void> {
src/vs/code/electron-main/app.ts:1803: if (isWindows && win32MutexName && isInnoSetupInstall(this.productService.target)) {
src/vs/code/electron-main/main.ts:64: import { isInnoSetupInstall } from '../../platform/update/electron-main/win32UpdateType.js';
src/vs/code/electron-main/main.ts:364: const innoSetupActive = await this.checkInnoSetupMutex(productService, logService, () => {
src/vs/code/electron-main/main.ts:560: private async checkInnoSetupMutex(productService: IProductService, logService: ILogService, onActive: () => vo…
src/vs/code/electron-main/main.ts:561: if (!(isWindows && productService.win32MutexName && productService.win32VersionedUpdate && isInnoSetupInstall(…
src/vs/code/electron-main/main.ts:577: logService.info(`checkInnoSetupMutex: ${updatingMutexName} is held, waiting up to ${(pollIntervalMs * retries)…
src/vs/code/electron-main/main.ts:585: logService.info(`checkInnoSetupMutex: ${updatingMutexName} released after ${Date.now() - start}ms`);
src/vs/code/electron-main/main.ts:588: logService.warn(`checkInnoSetupMutex: ${updatingMutexName} still held after ${Date.now() - start}ms, giving up…
src/vs/platform/update/electron-main/updateService.win32.ts:39: import { getWin32UpdateType } from './win32UpdateType.js';
src/vs/platform/update/electron-main/updateService.win32.ts:701: return getWin32UpdateType(this.productService.target);
src/vs/platform/update/electron-main/win32UpdateType.ts:8: export function isInnoSetupInstall(target: string | undefined): boolean {
src/vs/platform/update/electron-main/win32UpdateType.ts:12: export function getWin32UpdateType(target: string | undefined): UpdateType {
src/vs/platform/update/electron-main/win32UpdateType.ts:13: return isInnoSetupInstall(target) ? UpdateType.Setup : UpdateType.Archive;
src/vs/platform/update/test/electron-main/win32UpdateType.test.ts:9: import { getWin32UpdateType, isInnoSetupInstall } from '../../electron-main/win3…
src/vs/platform/update/test/electron-main/win32UpdateType.test.ts:18: setupInstall: isInnoSetupInstall(target),
src/vs/platform/update/test/electron-main/win32UpdateType.test.ts:19: updateType: getWin32UpdateType(target)
src/vs/platform/update/test/electron-main/win32UpdateType.test.ts:30: setupInstall: isInnoSetupInstall(target),
src/vs/platform/update/test/electron-main/win32UpdateType.test.ts:31: updateType: getWin32UpdateType(target)

$ rg --sort path -n 'private afterWindowOpen|private async claimInstance|protected override getUpdateType|^export class CodeApplication|^class CodeMain|^export class Win32UpdateService' src/vs/code/electron-main/app.ts src/vs/code/electron-main/main.ts src/vs/platform/update/electron-main/updateService.win32.ts
src/vs/code/electron-main/app.ts:216: export class CodeApplication extends Disposable {
src/vs/code/electron-main/app.ts:1675: private afterWindowOpen(instantiationService: IInstantiationService): void {
src/vs/code/electron-main/main.ts:92: class CodeMain {
src/vs/code/electron-main/main.ts:352: private async claimInstance(logService: ILogService, environmentMainService: IEnvironmentMainService, lifecycl…
src/vs/platform/update/electron-main/updateService.win32.ts:52: export class Win32UpdateService extends AbstractUpdateService implements IRelaunchHan…
src/vs/platform/update/electron-main/updateService.win32.ts:700: protected override getUpdateType(): UpdateType {
```

Level 1, the non-test callers of `isInnoSetupInstall` (tests at `win32UpdateType.test.ts:18` and `:30` excluded):

- `CodeApplication.installMutex` (`app.ts:1801`), call at 1803.
- `CodeMain.checkInnoSetupMutex` (`main.ts:560`), call at 561.
- `getWin32UpdateType` (`win32UpdateType.ts:12`), call at 13.

Level 2, the callers of those (each level-1 function has exactly one non-test caller; the hits at `main.ts:577`, `585`
and `588` are log strings inside `checkInnoSetupMutex`):

- `installMutex` is called at `app.ts:1683` (`this.installMutex();`) in `CodeApplication.afterWindowOpen`
  (line 1675), directly in the method body.
- `checkInnoSetupMutex` is called at `main.ts:364` in `CodeMain.claimInstance` (line 352), inside the method's `try`
  block. The arrow function passed as its third argument is a callback, not a caller.
- `getWin32UpdateType` is called at `updateService.win32.ts:701` in `Win32UpdateService.getUpdateType` (line 700),
  whose only statement it is.

Six functions in four files. `must`: the six names and the four files. Graph: the same three level-1 and three level-2
functions.

Reference answer:

```
Direct callers:
- CodeApplication.installMutex - src/vs/code/electron-main/app.ts
- CodeMain.checkInnoSetupMutex - src/vs/code/electron-main/main.ts
- getWin32UpdateType - src/vs/platform/update/electron-main/win32UpdateType.ts
Their callers:
- CodeApplication.afterWindowOpen - src/vs/code/electron-main/app.ts
- CodeMain.claimInstance - src/vs/code/electron-main/main.ts
- Win32UpdateService.getUpdateType - src/vs/platform/update/electron-main/updateService.win32.ts
```

## vscode-impact-2

Prompt: If the signature of layoutVirtualizedSections changes, which non-test functions call it directly, and which
functions call those? Ignore tests. Answer with the function name and file of each, grouped by level, nothing else.

Paths below are under `src/vs/workbench/contrib/chat/browser/aiCustomization/`.

```
$ rg --sort path -n -w 'layoutVirtualizedSections|layoutMcpSectionLists|layoutPluginSectionLists|layoutMigrationSectionLists'
src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts:115: import { getVirtualizedSectionMinimumHeight, layoutVirt…
src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts:2676: private layoutMigrationSectionLists(): void {
src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts:2680: const heights = layoutVirtualizedSections(this.migrati…
src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts:2699: this.layoutMigrationSectionLists();
src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts:2709: this.layoutMigrationSectionLists();
src/vs/workbench/contrib/chat/browser/aiCustomization/customizationCardList.ts:140: export function layoutVirtualizedSections(root: HTMLElement, sect…
src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts:70: import { createCustomizationCardPrimaryAction, CustomizationCardListContro…
src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts:2456: private layoutMcpSectionLists(): void {
src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts:2461: const heights = layoutVirtualizedSections(content, this.sectionLists.map…
src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts:2478: this.layoutMcpSectionLists();
src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts:52: import { createCustomizationCardPrimaryAction, CustomizationCardListCon…
src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts:1353: private layoutPluginSectionLists(): void {
src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts:1359: const heights = layoutVirtualizedSections(content, this.sectionLists.…
src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts:1373: this.layoutPluginSectionLists();
src/vs/workbench/contrib/chat/test/browser/aiCustomization/aiCustomizationListWidget.test.ts:35: import { createCustomizationCardPrimaryAction, Custo…
src/vs/workbench/contrib/chat/test/browser/aiCustomization/aiCustomizationListWidget.test.ts:244: const expanded = layoutVirtualizedSections(root, [
src/vs/workbench/contrib/chat/test/browser/aiCustomization/aiCustomizationListWidget.test.ts:249: const redistributed = layoutVirtualizedSections(roo…
src/vs/workbench/contrib/chat/test/browser/aiCustomization/aiCustomizationListWidget.test.ts:283: const constrained = layoutVirtualizedSections(root,…
src/vs/workbench/contrib/chat/test/browser/aiCustomization/aiCustomizationListWidget.test.ts:313: const heights = layoutVirtualizedSections(root, sec…

$ rg --sort path -n 'private schedule(Mcp|Plugin|Migration)SectionLayout\(|^export class (McpListWidget|PluginListWidget|AICustomizationManagementEditor) ' src/vs/workbench/contrib/chat/browser/aiCustomization
src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts:544: export class AICustomizationManagementEditor extends Ed…
src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts:2692: private scheduleMigrationSectionLayout(): void {
src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts:1670: export class McpListWidget extends Disposable {
src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts:2476: private scheduleMcpSectionLayout(): void {
src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts:739: export class PluginListWidget extends Disposable {
src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts:1371: private schedulePluginSectionLayout(): void {
```

Level 1, the non-test callers (four test calls in `aiCustomizationListWidget.test.ts` excluded), each call directly in
the method body:

- `McpListWidget.layoutMcpSectionLists` (`mcpListWidget.ts:2456`), call at 2461.
- `PluginListWidget.layoutPluginSectionLists` (`pluginListWidget.ts:1353`), call at 1359.
- `AICustomizationManagementEditor.layoutMigrationSectionLists` (`aiCustomizationManagementEditor.ts:2676`), call at
  2680.

Level 2: the three level-1 methods are private, and each has one caller in its own class:

- `layoutMcpSectionLists` is called at `mcpListWidget.ts:2478` in `McpListWidget.scheduleMcpSectionLayout` (line
  2476), inside the callback that the method passes to `DOM.scheduleAtNextAnimationFrame`.
- `layoutPluginSectionLists` is called at `pluginListWidget.ts:1373` in
  `PluginListWidget.schedulePluginSectionLayout` (line 1371), inside the same kind of callback.
- `layoutMigrationSectionLists` is called at `aiCustomizationManagementEditor.ts:2699` (directly) and 2709 (inside
  the animation-frame callback), both in `AICustomizationManagementEditor.scheduleMigrationSectionLayout` (line 2692).

Six functions in three files. `must`: the six names and the three files. Graph: the same tree, plus a self-edge
`layoutVirtualizedSections → layoutVirtualizedSections`. The body (lines 140 to 204) contains only arrow callbacks
and no recursive call, so the self-edge is an indexing artifact.

Reference answer:

```
Direct callers:
- McpListWidget.layoutMcpSectionLists - src/vs/workbench/contrib/chat/browser/aiCustomization/mcpListWidget.ts
- PluginListWidget.layoutPluginSectionLists - src/vs/workbench/contrib/chat/browser/aiCustomization/pluginListWidget.ts
- AICustomizationManagementEditor.layoutMigrationSectionLists - src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts
Their callers:
- McpListWidget.scheduleMcpSectionLayout - mcpListWidget.ts
- PluginListWidget.schedulePluginSectionLayout - pluginListWidget.ts
- AICustomizationManagementEditor.scheduleMigrationSectionLayout - aiCustomizationManagementEditor.ts
```

## vscode-impact-3

Prompt: If the signature of sortEditsByYieldTo changes, which non-test functions call it directly, and which functions
call those? Ignore tests. Answer with the function name and file of each, grouped by level, nothing else.

```
$ rg --sort path -n -w 'sortEditsByYieldTo|getPasteEdits|getDropEdits' src
src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts:40: import { createCombinedWorkspaceEdit, sortEditsByYieldTo } from './edit.js';
src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts:361: const editSession = await this.getPasteEdits(supportedProviders, dataTransf…
src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts:445: let editSession = disposables.add(await this.getPasteEdits(supportedProvide…
src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts:597: private async getPasteEdits(providers: readonly DocumentPasteEditProvider[]…
src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts:620: edits: sortEditsByYieldTo(edits),
src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.ts:33: import { sortEditsByYieldTo } from './edit.js';
src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.ts:128: const editSession = disposables.add(await this.getDropEdits(providers,…
src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.ts:151: private async getDropEdits(providers: readonly DocumentDropEditProvide…
src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.ts:172: edits: sortEditsByYieldTo(edits),
src/vs/editor/contrib/dropOrPasteInto/browser/edit.ts:36: export function sortEditsByYieldTo<T extends {
src/vs/editor/contrib/dropOrPasteInto/test/browser/editSort.test.ts:9: import { sortEditsByYieldTo } from '../../browser/edit.js';
src/vs/editor/contrib/dropOrPasteInto/test/browser/editSort.test.ts:21: suite('sortEditsByYieldTo', () => {
src/vs/editor/contrib/dropOrPasteInto/test/browser/editSort.test.ts:26: assert.deepStrictEqual(sortEditsByYieldTo(edits), []);
src/vs/editor/contrib/dropOrPasteInto/test/browser/editSort.test.ts:34: assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.kind?.value), ['b…
src/vs/editor/contrib/dropOrPasteInto/test/browser/editSort.test.ts:45: assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.kind?.value), ['b…
src/vs/editor/contrib/dropOrPasteInto/test/browser/editSort.test.ts:54: assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.kind?.value), ['b…
src/vs/editor/contrib/dropOrPasteInto/test/browser/editSort.test.ts:65: assert.deepStrictEqual(sortEditsByYieldTo(edits).map(x => x.kind?.value), ['c…

$ rg --sort path -n 'private doPasteInline|private showPasteAsPick|private async onDropIntoEditor|^export class' src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.ts
src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts:79: export class CopyPasteController extends Disposable implements IEditorContri…
src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts:323: private doPasteInline(allProviders: readonly DocumentPasteEditProvider[], s…
src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts:417: private showPasteAsPick(preference: PastePreference | undefined, allProvide…
src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.ts:42: export class DropIntoEditorController extends Disposable implements IEd…
src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.ts:93: private async onDropIntoEditor(editor: ICodeEditor, position: IPosition…
```

Level 1, the non-test callers (five test calls in `editSort.test.ts` excluded):

- `CopyPasteController.getPasteEdits` (`copyPasteController.ts:597`): line 620 is in the object the method returns,
  `edits: sortEditsByYieldTo(edits),`, after the provider callback that ends at line 614.
- `DropIntoEditorController.getDropEdits` (`dropIntoEditorController.ts:151`): line 172, in the same position.

Level 2: both level-1 methods are private:

- `getPasteEdits` is called at `copyPasteController.ts:361` in `CopyPasteController.doPasteInline` (line 323) and at
  445 in `CopyPasteController.showPasteAsPick` (line 417), each inside the async callback the method hands to
  `createCancelablePromise`.
- `getDropEdits` is called at `dropIntoEditorController.ts:128` in `DropIntoEditorController.onDropIntoEditor`
  (line 93), inside the same kind of callback.

Five functions in two files. Outside `src/`, `rg -n -w 'getPasteEdits|getDropEdits' extensions` finds only unrelated
symbols: the tsserver command name `'getPasteEdits'` in `extensions/typescript-language-features`
(`copyPaste.ts:190`, `typescriptService.ts:80`) and a method of a test proxy in `extensions/copilot`
(`languageServerProxy.ts:305`). `must`: the five names and the two files. Graph: the same tree, plus a self-edge
`sortEditsByYieldTo → sortEditsByYieldTo`. The function defines nested helpers `yieldsTo` and `visit`, and `visit` is
the recursive one; `sortEditsByYieldTo` never calls itself.

Reference answer:

```
Direct callers:
- CopyPasteController.getPasteEdits - src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts
- DropIntoEditorController.getDropEdits - src/vs/editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.ts
Their callers:
- CopyPasteController.doPasteInline - copyPasteController.ts
- CopyPasteController.showPasteAsPick - copyPasteController.ts
- DropIntoEditorController.onDropIntoEditor - dropIntoEditorController.ts
```

## vscode-config-1

Prompt: What is the default value of the search.maxResults setting, and which constant in which file defines it? One
line.

```
$ rg --sort path -n -F 'search.maxResults'
src/vs/workbench/contrib/search/browser/search.common.contribution.ts:83: 'search.maxResults': {
src/vs/workbench/contrib/search/browser/search.common.contribution.ts:86: markdownDescription: nls.localize('search.maxResults', "Controls the maximu…
src/vs/workbench/contrib/search/browser/searchAccessibilityHelp.ts:137: content.push(localize('search.settingMaxResults', "- `search.maxResults`: Maxim…

$ sed -n 83,87p src/vs/workbench/contrib/search/browser/search.common.contribution.ts
  'search.maxResults': {
   type: ['number', 'null'],
   default: DEFAULT_MAX_SEARCH_RESULTS,
   markdownDescription: nls.localize('search.maxResults', "Controls the maximum number of search results, this can be set to `null` (empty) to return…
  },

$ rg --sort path -n 'DEFAULT_MAX_SEARCH_RESULTS\s*='
src/vs/workbench/services/search/common/search.ts:32: export const DEFAULT_MAX_SEARCH_RESULTS = 20000;
```

The setting is registered once (line 83; line 86 is a localization key and `searchAccessibilityHelp.ts:137` a help
string). Its default is the constant `DEFAULT_MAX_SEARCH_RESULTS`, imported at `search.common.contribution.ts:16` from
`../../../services/search/common/search.js` and defined once, as `20000`, at `search.ts:32`. `must`: `20000`,
`DEFAULT_MAX_SEARCH_RESULTS`, `search.ts`. As a whole word, `search.ts` is not matched by `rawSearchService.ts` or
`searchService.ts`.

Reference answer: `20000: DEFAULT_MAX_SEARCH_RESULTS in src/vs/workbench/services/search/common/search.ts:32 (the
setting's default at search.common.contribution.ts:85).`

## vscode-config-2

Prompt: What is the value of MATCHES_LIMIT, and which file defines it? One line.

```
$ rg --sort path -n 'MATCHES_LIMIT\s*='
src/vs/editor/contrib/find/browser/findModel.ts:81: export const MATCHES_LIMIT = 19999;
```

One definition in the checkout. `findState.ts`, `findWidget.ts` and `notebookFindWidget.ts` import it from
`findModel.js`; no other file defines it. `must`: `19999`, `findModel.ts`.

Reference answer: `19999, defined in src/vs/editor/contrib/find/browser/findModel.ts:81`

## vscode-env-1

Prompt: Which file and function read the environment variable VSCODE_CLI_ENCODING? Ignore tests. Answer with the file
path and the function name, nothing else.

```
$ rg --sort path -n -w VSCODE_CLI_ENCODING
src/vs/base/node/terminalEncoding.ts:46: const cliEncodingEnv = process.env['VSCODE_CLI_ENCODING'];
src/vs/base/node/terminalEncoding.ts:49: console.log(`Found VSCODE_CLI_ENCODING variable: ${cliEncodingEnv}`);
src/vs/workbench/services/textfile/test/node/encoding/encoding.integrationTest.ts:20: process.env['VSCODE_CLI_ENCODING'] = 'utf16le';

$ sed -n 42,46p src/vs/base/node/terminalEncoding.ts
export async function resolveTerminalEncoding(verbose?: boolean): Promise<string> {
 let rawEncodingPromise: Promise<string | undefined>;

 // Support a global environment variable to win over other mechanics
 const cliEncodingEnv = process.env['VSCODE_CLI_ENCODING'];
```

The only read is line 46, in `resolveTerminalEncoding`; line 49 logs the value, and the integration test writes the
variable. `must`: `terminalEncoding.ts`, `resolveTerminalEncoding`.

Reference answer: `src/vs/base/node/terminalEncoding.ts, resolveTerminalEncoding`

## vscode-env-2

Prompt: Which file and function read the environment variable DEV_WINDOW_SRC? Answer with the file path and the
function name, nothing else.

```
$ rg --sort path -n -w DEV_WINDOW_SRC
src/vs/base/parts/ipc/electron-main/ipcMain.ts:132: if (url === process.env.DEV_WINDOW_SRC && (host === 'localhost' || host.startsWith('localhost:'))…

$ rg --sort path -n '^class ValidatedIpcMain|private validateEvent' src/vs/base/parts/ipc/electron-main/ipcMain.ts
13:class ValidatedIpcMain implements Event.NodeEventEmitter {
106: private validateEvent(channel: string, event: electron.IpcMainEvent | electron.IpcMainInvokeEvent): boolean {
```

One occurrence in the whole checkout, read with dot access inside `if (process.env.VSCODE_DEV) {` in
`ValidatedIpcMain.validateEvent`, which runs from line 106 to past line 132. `must`: `ipcMain.ts`, `validateEvent`.

Reference answer: `src/vs/base/parts/ipc/electron-main/ipcMain.ts, ValidatedIpcMain.validateEvent`

## vscode-error-1

Prompt: Which file and line raises the error "ModelService: Cannot add model because it already exists!"? Answer as
file:line, nothing else.

```
$ rg --sort path -n -F 'ModelService: Cannot add model because it already exists!'
src/vs/editor/common/services/modelService.ts:352: throw new Error('ModelService: Cannot add model because it already exists!');

$ rg --sort path -n 'export class ModelService|private _createModelData' src/vs/editor/common/services/modelService.ts
84:export class ModelService extends Disposable implements IModelService {
307: private _createModelData(value: string | ITextBufferFactory, languageIdOrSelection: string | ILanguageSelection, resource: URI | undefined, isFo…
```

One occurrence in the checkout; the `throw` and the message are on line 352, in `ModelService._createModelData`.
`must`: `modelService.ts:352`.

Reference answer: `src/vs/editor/common/services/modelService.ts:352`

## vscode-error-2

Prompt: Which file and line logs the warning "Shell integration failed to add capabilities within 10 seconds"? Answer
as file:line, nothing else.

```
$ rg --sort path -n -F 'Shell integration failed to add capabilities within 10 seconds'
src/vs/platform/terminal/common/xterm/shellIntegrationAddon.ts:460: this._logService.warn('Shell integration failed to add capabilities within 10 sec…

$ rg --sort path -n 'export class ShellIntegrationAddon|private async _ensureCapabilitiesOrAddFailureTelemetry' src/vs/platform/terminal/common/xterm/shellIntegrationAddon.ts
330:export class ShellIntegrationAddon extends Disposable implements IShellIntegration, ITerminalAddon {
453: private async _ensureCapabilitiesOrAddFailureTelemetry(): Promise<void> {
```

One occurrence in the checkout; the `this._logService.warn(…)` call and the message are on line 460, inside the
`setTimeout` callback of `ShellIntegrationAddon._ensureCapabilitiesOrAddFailureTelemetry`. `must`:
`shellIntegrationAddon.ts:460`.

Reference answer: `src/vs/platform/terminal/common/xterm/shellIntegrationAddon.ts:460`

## vscode-definition-1

Prompt: Which file and line defines the CursorsController class? Answer as file:line, nothing else.

```
$ rg --sort path -n 'class CursorsController\b'
src/vs/editor/common/cursor/cursor.ts:27: export class CursorsController extends Disposable {
```

One definition in the checkout, with no decorator line above it. `must`: `cursor.ts:27`; as a whole word it is not
matched by `cursor.ts:270`.

Reference answer: `src/vs/editor/common/cursor/cursor.ts:27`

## vscode-definition-2

Prompt: Which file and line defines the ContextKeyExpression type? Answer as file:line, nothing else.

```
$ rg --sort path -n '(type|interface|class|enum)\s+ContextKeyExpression\s*[=<{(]'
src/vs/platform/contextkey/common/contextkey.ts:84: export type ContextKeyExpression = (
```

One definition in the checkout: the union type alias that starts at line 84 and closes at line 90. Other hits of
`type ContextKeyExpression` are type-only imports (`import { type ContextKeyExpression … }`), not definitions.
`must`: `contextkey.ts:84`.

Reference answer: `src/vs/platform/contextkey/common/contextkey.ts:84`
