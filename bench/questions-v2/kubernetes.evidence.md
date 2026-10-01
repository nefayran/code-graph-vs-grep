# kubernetes: evidence for the v2 answer key

> Answers are graded by whole-word, case-insensitive matching (`bench/run-copilot.mjs`, `PLAN-v2.md`). Notes below
> that discuss one `must` entry being a substring of another were written for plain substring matching; under
> whole-word matching those overlaps no longer let an answer that omits the shorter name pass.

Repository: https://github.com/kubernetes/kubernetes at `6d805ebe018f428d503fdc01bb6d57bd9574f598`, a shallow
clone checked out at `<repo>/` (clean: `git status --porcelain` prints nothing, `git rev-parse HEAD` equals the
pin). Every command below runs from `<repo>/`. `rg` is ripgrep 14.1.1. After the `rg` pass, every
`path:line` fact quoted in this file (each one written as `` `path:line` `` followed by a code fragment) was
read again from the pinned commit with `git show HEAD:<path>`, not from the working tree, and the fragment
was found on that line.

"Ignore tests" in the prompts means `_test.go` files and the top-level `test/` tree, as in the spec. No
`must` entry depends on `vendor/`, on generated files (`zz_generated*`, `*.pb.go`) or on `_test.go` code.
All 16 questions are about code under `pkg/` and `cmd/`. Two answers mention a function in `staging/`
only as a non-key fact (see callees and chain-2), and no `must` entry points into `staging/`.

The graph was used only to propose candidates, through
`printf '%s' '{"project":"<project>","query":"<cypher>"}' | codebase-memory-mcp cli query_graph`
(codebase-memory-mcp 0.9.0), with `<project>` standing for the cbm project of `<repo>/` (146,421 nodes, 12,464
File nodes: `staging/` 7,332, `pkg/` 3,287, `test/` 854, `cmd/` 499, `cluster/` 172, `plugin/` 137, `api/` 129;
`vendor/` is not indexed). Every `must` entry comes from `rg` output and from reading the code.

## The set

| id | type | must | asks about |
|---|---|---:|---|
| kubernetes-callers-1 | callers | 12 | `RecheckDeletionTimestamp`, pkg/controller (6 call sites, 6 files) |
| kubernetes-callers-2 | callers | 5 | `MakeNestedMountpoints`, pkg/volume (4 call sites, 4 files) |
| kubernetes-callees-1 | callees | 4 | `GetEtcdImageTagFromStaticPod`, cmd/kubeadm (4 callees, 4 files) |
| kubernetes-chain-1 | chain | 7 | CLI command `kubeadm token create` down to `encodeTokenSecretData` |
| kubernetes-chain-2 | chain | 6 | informer event handler `addIPAddress` down to `PrefixContainsIP` |
| kubernetes-impact-1 | impact | 8 | `HashContainer`, pkg/kubelet (2 + 3 functions) |
| kubernetes-impact-2 | impact | 7 | `ConvertDownwardAPIFieldLabel`, pkg/apis + pkg/kubelet (2 + 3) |
| kubernetes-impact-3 | impact | 8 | `GetNameForAuthorizerMode`, pkg/kubeapiserver (2 + 3) |
| kubernetes-config-1 | config | 3 | kubelet default for `MaxPods` |
| kubernetes-config-2 | config | 2 | value of `ProxyHealthzPort` |
| kubernetes-env-1 | env | 2 | `KUBE_PROXY_NFTABLES_SKIP_KERNEL_VERSION_CHECK` |
| kubernetes-env-2 | env | 2 | `KUBE_NETWORK` |
| kubernetes-error-1 | error | 2 | "DisruptedPods map too big - ..." (raised) |
| kubernetes-error-2 | error | 2 | "Scheduler cache AssumePod failed" (logged) |
| kubernetes-definition-1 | definition | 2 | `HorizontalController` struct |
| kubernetes-definition-2 | definition | 2 | `CreateKubeAPIServerConfig` function |

Subsystems: workload controllers, volume plugins, kubeadm (callees, chain-1), ServiceCIDR controller,
kubelet runtime, API validation, kube-apiserver authorization, kubelet config, kube-proxy, apiserver pod
eviction, scheduler, HPA controller, kube-apiserver startup.

Rules applied to every structural question, beyond the spec:

- Each target and each `must` function name has exactly one `func` declaration in the whole repository
  (index of all `^func` lines in `.go` files, `vendor/` and `staging/` included), and no other declared
  function or type has the same name in a different case. `must` matching is case-insensitive, so
  `determineX` next to `DetermineX` would make one of them uncheckable.
- No `must` entry is a case-insensitive substring of another entry of the same question. A script built a
  reference answer per question from the facts below and checked that every entry is found, and that dropping
  any one function from the answer makes it fail. The only step that cannot be checked is the anonymous
  `RunE` closure at the top of chain-1, which has no name.

## How candidates were found

One query returns at most 100,000 rows ("result exceeded 100k rows"), so the CALLS edges were pulled in slices
with anchored regex filters, which work in this cbm version (`STARTS WITH` does not):

    MATCH (a)-[:CALLS]->(f:Function) WHERE f.file_path =~ '^pkg/.*'
    RETURN a.qualified_name, a.name, a.file_path, a.start_line, f.qualified_name, f.name, f.file_path, f.start_line
    LIMIT 99000

and the same for `f:Method`, for `^cmd/.*` and `^plugin/.*`, and with the filter on `a.file_path` for
out-edges. Scripts over those slices proposed: functions with 3 to 6 non-test callers in 2 or more files
(callers), functions with 4 to 6 project callees in 2 or more files (callees), two-level caller trees of 4 to
8 functions (impact), and paths of 4 to 6 functions from informer handlers (`AddFunc:`/`UpdateFunc:`/
`DeleteFunc:` values), kubeadm commands and phases, and kubelet route handlers, kept only when exactly one
path reached the target (chain). Each surviving candidate was then checked with one `rg -n -w -t go` pass
over the whole repository and by reading every call site.

## What the graph gets wrong at this pin

Found while looking for candidates; each item was checked against the code. None of them touches an edge
that the 16 answers depend on (for each question the graph's own answer is quoted below and matches).

1. Methods with the same name on different receiver types in one package collapse into one node, keyed by
   package and method name. `pkg/registry/core/pod/rest/subresources.go` declares `Connect` four times:
   - `pkg/registry/core/pod/rest/subresources.go:76` `func (r *ProxyREST) Connect(`
   - `pkg/registry/core/pod/rest/subresources.go:115` `func (r *AttachREST) Connect(`
   - `pkg/registry/core/pod/rest/subresources.go:190` `func (r *ExecREST) Connect(`
   - `pkg/registry/core/pod/rest/subresources.go:276` `func (r *PortForwardREST) Connect(`

   The graph has one Method node `...pkg.registry.core.pod.rest.Connect` (lines 276 to 307) whose callees
   are the union of the four bodies (`AttachLocation`, `ExecLocation`, `PortForwardLocation`,
   `ResourceLocation`, ...). A chain through `ExecREST.Connect` is unique in the code but not in the graph,
   so no question goes through such a method.
2. A method call on a library value is linked by name to an unrelated project method:
   - `pkg/controller/servicecidrs/servicecidrs_controller.go:200` `c.queue.Add(cidr)` (a workqueue) is linked
     to `pkg/controller/controller_utils.go:283` `func (e *ControlleeExpectations) Add(add, del int64) {`.
   - `pkg/kubelet/eviction/eviction_manager.go:621` `containerUsed.Add(*diskUsage(containerStat.Rootfs))`
     (a `resource.Quantity`) is linked to the interface method declaration
     `pkg/kubelet/server/server.go:154` `Add(service *restful.WebService) *restful.Container`.
   - Calls such as `fInfo.IsDir()` and `time.Now()` in pkg/kubelet are linked to same-named methods in
     unrelated `_test.go` files.
3. Go conversions such as `int(x)` produce CALLS edges to a synthetic node `builtins.int` with file
   `<python-builtins>`: 308 such edges leave functions in `cmd/` and `pkg/`.
4. Spurious self-edges: the graph has `UpdateOrCreateTokens -> UpdateOrCreateTokens`, but the function
   (`cmd/kubeadm/app/phases/bootstraptoken/node/token.go:40` `func UpdateOrCreateTokens(`) never calls
   itself; `rg -w` finds its only calls at node/token.go:36 and init/bootstraptoken.go:90 (chain-1 below).
5. `vendor/` is not indexed, so the graph cannot see the vendored dependencies at all. No answer needs them.

## kubernetes-callers-1 (callers)

Prompt: Which functions call RecheckDeletionTimestamp? Ignore tests. Answer with the caller name and
file:line of each call site, nothing else.

must: `claimPods`, `getPodsForJob`, `getReplicaSetsForDeployment`, `getDaemonPods`, `controlledHistories`,
`canAdoptFunc`, `replica_set.go`, `job_controller.go`, `deployment_controller.go`, `daemon_controller.go`,
`update.go`, `stateful_set.go`.

    rg -n -w -t go RecheckDeletionTimestamp

8 hits: the definition, its doc comment (controller_ref_manager.go:387) and six calls. None is in a
`_test.go` file, under `test/` or under `vendor/`. Each call passes a closure, but the call itself is a
direct package-level call `controller.RecheckDeletionTimestamp(...)`. Definition:

- `pkg/controller/controller_ref_manager.go:391` `func RecheckDeletionTimestamp(`

Call sites, each with the nearest preceding top-level `func` line (no other `func` line lies between them):

- `pkg/controller/replicaset/replica_set.go:866` `canAdoptFunc := controller.RecheckDeletionTimestamp(`
  in `pkg/controller/replicaset/replica_set.go:863` `func (rsc *ReplicaSetController) claimPods(`
- `pkg/controller/job/job_controller.go:888` `canAdoptFunc := controller.RecheckDeletionTimestamp(`
  in `pkg/controller/job/job_controller.go:875` `func (jm *Controller) getPodsForJob(`
- `pkg/controller/deployment/deployment_controller.go:538` `canAdoptFunc := controller.RecheckDeletionTimestamp(`
  in `pkg/controller/deployment/deployment_controller.go:525` `func (dc *DeploymentController) getReplicaSetsForDeployment(`
- `pkg/controller/daemon/daemon_controller.go:776` `dsNotDeleted := controller.RecheckDeletionTimestamp(`
  in `pkg/controller/daemon/daemon_controller.go:764` `func (dsc *DaemonSetsController) getDaemonPods(`
- `pkg/controller/daemon/update.go:477` `canAdoptFunc := controller.RecheckDeletionTimestamp(`
  in `pkg/controller/daemon/update.go:463` `func (dsc *DaemonSetsController) controlledHistories(`
- `pkg/controller/statefulset/stateful_set.go:411` `return controller.RecheckDeletionTimestamp(`
  in `pkg/controller/statefulset/stateful_set.go:410` `func (ssc *StatefulSetController) canAdoptFunc(`

Graph: `MATCH (a)-[:CALLS]->(f) WHERE f.name = 'RecheckDeletionTimestamp' RETURN a.name, a.file_path LIMIT 50`
returns the same six callers. Note: four call lines assign to a local variable named `canAdoptFunc`; the
`stateful_set.go` entry still catches an answer that leaves out the real `canAdoptFunc` method.

## kubernetes-callers-2 (callers)

Prompt: Which functions call MakeNestedMountpoints? Ignore tests. Answer with the caller name and file:line
of each call site, nothing else.

must: `SetUpAt`, `configmap.go`, `secret.go`, `projected.go`, `downwardapi.go`.

    rg -n -w -t go MakeNestedMountpoints

6 hits: the definition, its doc comment (nested_volumes.go:101) and four calls, none in tests or vendor.

- `pkg/volume/util/nested_volumes.go:102` `func MakeNestedMountpoints(`
- `pkg/volume/configmap/configmap.go:222` `volumeutil.MakeNestedMountpoints(b.volName, dir, b.pod)`
  in `pkg/volume/configmap/configmap.go:182` `func (b *configMapVolumeMounter) SetUpAt(`
- `pkg/volume/secret/secret.go:218` `volumeutil.MakeNestedMountpoints(b.volName, dir, b.pod)`
  in `pkg/volume/secret/secret.go:178` `func (b *secretVolumeMounter) SetUpAt(`
- `pkg/volume/projected/projected.go:207` `volumeutil.MakeNestedMountpoints(s.volName, dir, *s.pod)`
  in `pkg/volume/projected/projected.go:188` `func (s *projectedVolumeMounter) SetUpAt(`
- `pkg/volume/downwardapi/downwardapi.go:191` `volumeutil.MakeNestedMountpoints(b.volName, dir, *b.pod)`
  in `pkg/volume/downwardapi/downwardapi.go:170` `func (b *downwardAPIVolumeMounter) SetUpAt(`

All four callers are methods named `SetUpAt` on different types in different packages; the four file base
names carry the check. Graph: the same query with `MakeNestedMountpoints` returns these four `SetUpAt` nodes
(one per package, so no merging as in item 1 above).

## kubernetes-callees-1 (callees)

Prompt: What functions does GetEtcdImageTagFromStaticPod call? List the callee names only.

must: `GetStaticPodFilepath`, `ReadStaticPodFromDisk`, `TagFromImage`, `convertImageTagMetadataToSemver`.

The whole body is four calls to four functions, in four files; there is no library call:

- `cmd/kubeadm/app/phases/upgrade/staticpods.go:673` `func GetEtcdImageTagFromStaticPod(manifestDir string) (string, error) {`
- `cmd/kubeadm/app/phases/upgrade/staticpods.go:674` `realPath := constants.GetStaticPodFilepath(constants.Etcd, manifestDir)`
- `cmd/kubeadm/app/phases/upgrade/staticpods.go:675` `pod, err := staticpod.ReadStaticPodFromDisk(realPath)`
- `cmd/kubeadm/app/phases/upgrade/staticpods.go:680` `return convertImageTagMetadataToSemver(image.TagFromImage(pod.Spec.Containers[0].Image)), nil`
- `cmd/kubeadm/app/phases/upgrade/staticpods.go:681` `}`

Definitions (one each in the repository):

- `cmd/kubeadm/app/constants/constants.go:599` `func GetStaticPodFilepath(`
- `cmd/kubeadm/app/util/staticpod/utils.go:214` `func ReadStaticPodFromDisk(`
- `cmd/kubeadm/app/util/image/image.go:32` `func TagFromImage(`
- `cmd/kubeadm/app/phases/upgrade/staticpods.go:684` `func convertImageTagMetadataToSemver(`

Graph: `MATCH (a)-[:CALLS]->(f) WHERE a.name = 'GetEtcdImageTagFromStaticPod' RETURN f.name, f.file_path LIMIT 50`
returns exactly these four.

## kubernetes-chain-1 (chain)

Prompt: Trace the call chain from the RunE handler of the "kubeadm token create" command down to
encodeTokenSecretData. Ignore tests. List every function on the path in order, with file:line for each,
nothing else.

must: `RunCreateToken`, `CreateNewTokens`, `UpdateOrCreateTokens`, `BootstrapTokenToSecret`,
`encodeTokenSecretData`, `token.go`, `utils.go`.

Path: RunE closure (cmd/token.go:112) -> `RunCreateToken` -> `CreateNewTokens` -> `UpdateOrCreateTokens` ->
`BootstrapTokenToSecret` -> `encodeTokenSecretData`. The closure is anonymous, so it is not in `must`;
`newCmdToken`, the function that builds the command, is not in `must` either, because an answer may name the
closure without it.

- `cmd/kubeadm/app/cmd/token.go:59` `func newCmdToken(`
- `cmd/kubeadm/app/cmd/token.go:101` `Use:                   "create [token]",`
- `cmd/kubeadm/app/cmd/token.go:112` `RunE: func(tokenCmd *cobra.Command, args []string) error {`
- `cmd/kubeadm/app/cmd/token.go:132` `return RunCreateToken(out, client, cfgPath, cfg, printJoinCommand, certificateKey, kubeConfigFile)`
- `cmd/kubeadm/app/cmd/token.go:230` `func RunCreateToken(`
- `cmd/kubeadm/app/cmd/token.go:250` `if err := tokenphase.CreateNewTokens(client, internalcfg.BootstrapTokens); err != nil {`
- `cmd/kubeadm/app/phases/bootstraptoken/node/token.go:35` `func CreateNewTokens(`
- `cmd/kubeadm/app/phases/bootstraptoken/node/token.go:36` `return UpdateOrCreateTokens(client, true, tokens)`
- `cmd/kubeadm/app/phases/bootstraptoken/node/token.go:40` `func UpdateOrCreateTokens(`
- `cmd/kubeadm/app/phases/bootstraptoken/node/token.go:52` `updatedOrNewSecret := bootstraptokenv1.BootstrapTokenToSecret(&token)`
- `cmd/kubeadm/app/apis/bootstraptoken/v1/utils.go:99` `func BootstrapTokenToSecret(`
- `cmd/kubeadm/app/apis/bootstraptoken/v1/utils.go:106` `Data: encodeTokenSecretData(bt, time.Now()),`
- `cmd/kubeadm/app/apis/bootstraptoken/v1/utils.go:112` `func encodeTokenSecretData(`

Why the path is unique. Walking up from the target with

    rg -n -w -t go -e RunCreateToken -e CreateNewTokens -e UpdateOrCreateTokens -e BootstrapTokenToSecret \
       -e encodeTokenSecretData -e createShortLivedBootstrapToken -e runBootstrapToken -e runUploadCerts

the only non-test caller of `encodeTokenSecretData` is `BootstrapTokenToSecret`, whose only non-test caller is
`UpdateOrCreateTokens`. That one has two callers, `CreateNewTokens` and the init phase function:

- `cmd/kubeadm/app/cmd/phases/init/bootstraptoken.go:90` `nodebootstraptokenphase.UpdateOrCreateTokens(client, false,`
- `cmd/kubeadm/app/cmd/phases/init/bootstraptoken.go:60` `Run: runBootstrapToken,`

`CreateNewTokens` has two callers, `RunCreateToken` and `createShortLivedBootstrapToken`:

- `cmd/kubeadm/app/phases/copycerts/copycerts.go:72` `nodebootstraptokenphase.CreateNewTokens(client, tokens)`
- `cmd/kubeadm/app/phases/copycerts/copycerts.go:94` `tokenID, err := createShortLivedBootstrapToken(client)`
- `cmd/kubeadm/app/cmd/phases/init/uploadcerts.go:70` `copycerts.UploadCerts(client, data.Cfg(), data.CertificateKey())`
- `cmd/kubeadm/app/cmd/phases/init/uploadcerts.go:35` `Run:   runUploadCerts,`

So the other branches start at `runBootstrapToken` and `runUploadCerts`, which are referenced only as
`Run:` values of `kubeadm init` phases. The closure calls only `validation.ValidateMixedArguments`
(token.go:117), `bto.ApplyTo` (121), `cmdutil.GetKubeConfigPath` (126), `getClientForTokenCommands` (127)
and `RunCreateToken` (132). `RunCreateToken` reaches the token code only through
`tokenphase.CreateNewTokens` (250). Its other calls go to configuration loading (242) and to building the
join command (260, 268), and none of these calls a `kubeadm init` phase.

Graph: the CALLS edges `newCmdToken -> RunCreateToken -> CreateNewTokens -> UpdateOrCreateTokens ->
BootstrapTokenToSecret -> encodeTokenSecretData` are all present. The graph has no node for the closure and
attaches its calls to `newCmdToken`.

## kubernetes-chain-2 (chain)

Prompt: Trace the call chain from the IPAddress add event handler addIPAddress in
pkg/controller/servicecidrs/servicecidrs_controller.go down to PrefixContainsIP. Ignore tests. List every
function on the path in order, with file:line for each, nothing else.

must: `addIPAddress`, `containingServiceCIDRs`, `ContainsAddress`, `PrefixContainsIP`,
`servicecidrs_controller.go`, `servicecidr.go`.

The handler is registered on the IPAddress informer:

- `pkg/controller/servicecidrs/servicecidrs_controller.go:102` `ipAddressInformer.Informer().AddEventHandlerWithOptions(cache.ResourceEventHandlerFuncs{`
- `pkg/controller/servicecidrs/servicecidrs_controller.go:103` `c.addIPAddress,`

Path:

- `pkg/controller/servicecidrs/servicecidrs_controller.go:193` `func (c *Controller) addIPAddress(obj interface{}) {`
- `pkg/controller/servicecidrs/servicecidrs_controller.go:199` `for _, cidr := range c.containingServiceCIDRs(ip) {`
- `pkg/controller/servicecidrs/servicecidrs_controller.go:242` `func (c *Controller) containingServiceCIDRs(`
- `pkg/controller/servicecidrs/servicecidrs_controller.go:257` `serviceCIDRs := servicecidr.ContainsAddress(c.serviceCIDRLister, address)`
- `pkg/api/servicecidr/servicecidr.go:76` `func ContainsAddress(`
- `pkg/api/servicecidr/servicecidr.go:86` `if PrefixContainsIP(prefix, address) {`
- `pkg/api/servicecidr/servicecidr.go:100` `func PrefixContainsIP(`

Commands:

    rg -n -w -t go -e addIPAddress -e containingServiceCIDRs -e ContainsAddress -e PrefixContainsIP

Why the path is unique. `addIPAddress` makes two calls, `c.containingServiceCIDRs(ip)` (199) and
`c.queue.Add(cidr)` (200, a client-go workqueue). `containingServiceCIDRs` calls `netip.ParseAddr`, the
apimachinery `sets` helpers and `servicecidr.ContainsAddress`. `ContainsAddress` calls the lister's `List`,
`labels.Everything`, `netip.ParsePrefix` and `PrefixContainsIP`. Code under `staging/` (client-go,
apimachinery) cannot import `k8s.io/kubernetes` (the repository's AGENTS.md states the rule), so the library
calls cannot lead back to `PrefixContainsIP`. The other callers of the two helpers are not reachable from the
handler:

- `pkg/api/servicecidr/servicecidr.go:72` `return ContainsAddress(serviceCIDRLister, address)` (in `ContainsIP`)
- `pkg/controller/servicecidrs/servicecidrs_controller.go:413` `servicecidr.ContainsAddress(c.serviceCIDRLister, address)` (in `canDeleteCIDR`)
- `pkg/registry/core/service/ipallocator/cidrallocator.go:315` `servicecidr.PrefixContainsIP(prefix, address)` (in `MetaAllocator.getAllocator`)

The chain stops at `PrefixContainsIP` because the next callee, `broadcastAddress`, is declared twice in
the repository (`pkg/api/servicecidr/servicecidr.go:120` `func broadcastAddress(` and
`pkg/registry/core/service/ipallocator/ipallocator.go:593` `func broadcastAddress(`).

Graph: callees of `addIPAddress` are `containingServiceCIDRs` and a wrong `Add` (item 2 above); callees of
`containingServiceCIDRs` include `ContainsAddress`; callees of `ContainsAddress` include
`PrefixContainsIP`. A search over the graph found exactly one path between the two ends.

## kubernetes-impact-1 (impact)

Prompt: If the signature of HashContainer changes, which non-test functions call it directly, and which
functions call those? Ignore tests. Answer with the function name and file of each, grouped by level,
nothing else.

must: `containerChanged`, `newContainerAnnotations`, `computePodActions`, `computeInitContainerActions`,
`generateContainerConfig`, `kuberuntime_manager.go`, `labels.go`, `kuberuntime_container.go`.

    rg -n -w -t go -e HashContainer -e containerChanged -e newContainerAnnotations

Outside `_test.go` files (27 hits there): the definitions, two doc comments, one comment in
kubelet_pods.go:804 that names the function without calling it, and these calls.

- `pkg/kubelet/container/helpers.go:196` `func HashContainer(`

Level 1:

- `pkg/kubelet/kuberuntime/kuberuntime_manager.go:671` `expectedHash := kubecontainer.HashContainer(container)`
  in `pkg/kubelet/kuberuntime/kuberuntime_manager.go:670` `func containerChanged(`
- `pkg/kubelet/kuberuntime/labels.go:117` `kubecontainer.HashContainer(container)`
  in `pkg/kubelet/kuberuntime/labels.go:108` `func newContainerAnnotations(`

Level 2:

- `pkg/kubelet/kuberuntime/kuberuntime_container.go:1164` `containerChanged(container, status)`
  in `pkg/kubelet/kuberuntime/kuberuntime_container.go:1063` `func (m *kubeGenericRuntimeManager) computeInitContainerActions(`
- `pkg/kubelet/kuberuntime/kuberuntime_manager.go:1435` `containerChanged(&container, containerStatus)`
  in `pkg/kubelet/kuberuntime/kuberuntime_manager.go:1272` `func (m *kubeGenericRuntimeManager) computePodActions(`
- `pkg/kubelet/kuberuntime/kuberuntime_container.go:378` `Annotations: newContainerAnnotations(`
  in `pkg/kubelet/kuberuntime/kuberuntime_container.go:343` `func (m *kubeGenericRuntimeManager) generateContainerConfig(`

5 functions. Graph: `MATCH (b)-[:CALLS]->(a)-[:CALLS]->(f) WHERE f.name = 'HashContainer' RETURN a.name,
a.file_path, b.name, b.file_path LIMIT 100` returns these five plus test-only rows
(`makeBasePodAndStatus` in kuberuntime_manager_test.go calls `HashContainer`, and test functions call
`newContainerAnnotations`), which "Ignore tests" removes.

## kubernetes-impact-2 (impact)

Prompt: If the signature of ConvertDownwardAPIFieldLabel changes, which non-test functions call it directly,
and which functions call those? Ignore tests. Answer with the function name and file of each, grouped by
level, nothing else.

must: `validateObjectFieldSelector`, `podFieldSelectorRuntimeValue`, `validateDownwardAPIVolumeFile`,
`validateEnvVarValueFrom`, `makeEnvironmentVariables`, `validation.go`, `kubelet_pods.go`.

    rg -n -w -t go -e ConvertDownwardAPIFieldLabel -e validateObjectFieldSelector -e podFieldSelectorRuntimeValue

3 hits in `_test.go` files; the rest are below, plus doc comments and a TODO comment in
pkg/volume/downwardapi/downwardapi.go:256 that names `podFieldSelectorRuntimeValue` without calling it.

- `pkg/apis/core/pods/helpers.go:61` `func ConvertDownwardAPIFieldLabel(`

Level 1:

- `pkg/apis/core/validation/validation.go:2952` `podshelper.ConvertDownwardAPIFieldLabel(`
  in `pkg/apis/core/validation/validation.go:2940` `func validateObjectFieldSelector(`
- `pkg/kubelet/kubelet_pods.go:1040` `podshelper.ConvertDownwardAPIFieldLabel(`
  in `pkg/kubelet/kubelet_pods.go:1039` `func (kl *Kubelet) podFieldSelectorRuntimeValue(`

Level 2:

- `pkg/apis/core/validation/validation.go:1134` `validateObjectFieldSelector(file.FieldRef`
  in `pkg/apis/core/validation/validation.go:1127` `func validateDownwardAPIVolumeFile(`
- `pkg/apis/core/validation/validation.go:2902` `validateObjectFieldSelector(ev.ValueFrom.FieldRef`
  in `pkg/apis/core/validation/validation.go:2891` `func validateEnvVarValueFrom(`
- `pkg/kubelet/kubelet_pods.go:907` `kl.podFieldSelectorRuntimeValue(`
  in `pkg/kubelet/kubelet_pods.go:784` `func (kl *Kubelet) makeEnvironmentVariables(`

5 functions. Graph: the two-hop query above with `ConvertDownwardAPIFieldLabel` returns exactly these.

## kubernetes-impact-3 (impact)

Prompt: If the signature of GetNameForAuthorizerMode changes, which non-test functions call it directly,
and which functions call those? Ignore tests. Answer with the function name and file of each, grouped by
level, nothing else.

must: `LoadAndValidateData`, `buildAuthorizationConfiguration`, `LoadAndValidateFile`, `checkFile`,
`ToAuthorizationConfig`, `config.go`, `authorization.go`, `reload.go`.

    rg -n -w -t go -e GetNameForAuthorizerMode -e LoadAndValidateData -e buildAuthorizationConfiguration

No hit is in a test file; besides the lines below there are only doc comments (config.go:163, 198;
authorization.go:252).

- `pkg/kubeapiserver/authorizer/config.go:165` `func GetNameForAuthorizerMode(`

Level 1:

- `pkg/kubeapiserver/authorizer/config.go:207` `GetNameForAuthorizerMode(string(authorizer.Type))`
  in `pkg/kubeapiserver/authorizer/config.go:181` `func LoadAndValidateData(`
- `pkg/kubeapiserver/options/authorization.go:285` `authorizer.GetNameForAuthorizerMode(mode)`
  in `pkg/kubeapiserver/options/authorization.go:253` `func (o *BuiltInAuthorizationOptions) buildAuthorizationConfiguration(`

Level 2:

- `pkg/kubeapiserver/authorizer/config.go:174` `LoadAndValidateData(data, compiler, requireNonWebhookTypes)`
  in `pkg/kubeapiserver/authorizer/config.go:169` `func LoadAndValidateFile(`
- `pkg/kubeapiserver/authorizer/reload.go:265` `LoadAndValidateData(data, r.compiler, r.requireNonWebhookTypes)`
  in `pkg/kubeapiserver/authorizer/reload.go:248` `func (r *reloadableAuthorizerResolver) checkFile(`
- `pkg/kubeapiserver/options/authorization.go:235` `o.buildAuthorizationConfiguration()`
  in `pkg/kubeapiserver/options/authorization.go:208` `func (o *BuiltInAuthorizationOptions) ToAuthorizationConfig(`

5 functions. Graph: the two-hop query with `GetNameForAuthorizerMode` returns exactly these.

## kubernetes-config-1 (config)

Prompt: What default does the kubelet apply to MaxPods when KubeletConfiguration leaves it unset, and which
function in which file sets it? One line.

must: `110`, `SetDefaults_KubeletConfiguration`, `defaults.go`.

    rg -n -t go 'MaxPods\s*=\s*[0-9]'

Three hits: the default, the API fuzzer (pkg/kubelet/apis/config/fuzzer/fuzzer.go:70, which fills random
round-trip objects and is not a default) and a test constant (pkg/kubelet/userns/userns_manager_test.go:47).

- `pkg/kubelet/apis/config/v1beta1/defaults.go:59` `func SetDefaults_KubeletConfiguration(`
- `pkg/kubelet/apis/config/v1beta1/defaults.go:193` `if obj.MaxPods == 0 {`
- `pkg/kubelet/apis/config/v1beta1/defaults.go:194` `obj.MaxPods = 110`

No other top-level `func` line lies between lines 59 and 194. The `--max-pods` flag
(cmd/kubelet/app/options/options.go:461) takes its default from the configuration object, not from a
literal.

## kubernetes-config-2 (config)

Prompt: What is the value of ProxyHealthzPort, and which file defines it? One line.

must: `10256`, `ports.go`.

    rg -n -t go 'ProxyHealthzPort\s*='

One hit, in a `const` block:

- `pkg/cluster/ports/ports.go:39` `ProxyHealthzPort = 10256`

`rg -n -w 10256 -t go pkg/cluster cmd/kube-proxy pkg/proxy` shows the number elsewhere only in doc comments,
flag help text and tests.

## kubernetes-env-1 (env)

Prompt: Which Go function reads the KUBE_PROXY_NFTABLES_SKIP_KERNEL_VERSION_CHECK environment variable?
Answer with the file and function name, one line.

must: `supported.go`, `getNFTablesInterface`.

    rg -n -w KUBE_PROXY_NFTABLES_SKIP_KERNEL_VERSION_CHECK

All file types: the read, a comment on the line above it, and two CHANGELOG-1.33.md entries.

- `pkg/proxy/nftables/supported.go:71` `os.Getenv("KUBE_PROXY_NFTABLES_SKIP_KERNEL_VERSION_CHECK")`
- `pkg/proxy/nftables/supported.go:34` `func getNFTablesInterface(`

`getNFTablesInterface` is the only top-level function in supported.go.

## kubernetes-env-2 (env)

Prompt: Which Go function reads the KUBE_NETWORK environment variable? Answer with the file and function
name, one line.

must: `proxier.go`, `getNetworkName`.

    rg -n -w KUBE_NETWORK

All file types: two lines in pkg/proxy/winkernel/proxier.go and six in
cluster/gce/windows/k8s-node-setup.psm1. The PowerShell module sets the variable in `Set-EnvironmentVars`
(line 306) and reads it in `Configure-HostNetworkingService` (lines 830 to 849), which is why the prompt asks
for the Go function.

- `pkg/proxy/winkernel/proxier.go:266` `hnsNetworkName = os.Getenv("KUBE_NETWORK")`
- `pkg/proxy/winkernel/proxier.go:263` `func getNetworkName(hnsNetworkName string) (string, error) {`

Line 268 in the same function returns the error "Environment variable KUBE_NETWORK and network-flag not
initialized"; it does not read the variable.

## kubernetes-error-1 (error)

Prompt: Where is the error "DisruptedPods map too big - too many evictions not confirmed by PDB controller"
raised? Ignore tests. Give the file:line, nothing else.

must: `eviction.go`, `456`.

    rg -n -F 'DisruptedPods map too big'

All file types: the raise and one expected-error string in pkg/registry/core/pod/storage/eviction_test.go:612.

- `pkg/registry/core/pod/storage/eviction.go:456` `goerrors.New("DisruptedPods map too big - too many evictions not confirmed by PDB controller")`
- `pkg/registry/core/pod/storage/eviction.go:442` `func (r *EvictionREST) checkAndDecrement(`

The message is created inline in `checkAndDecrement`, not in a package-level variable, so "raised" points
to one line.

## kubernetes-error-2 (error)

Prompt: Where is the message "Scheduler cache AssumePod failed" logged? Give the file:line, nothing else.

must: `algorithm.go`, `626`.

    rg -n -F 'Scheduler cache AssumePod failed'

All file types: one hit.

- `pkg/scheduler/algorithm.go:626` `logger.Error(err, "Scheduler cache AssumePod failed")`
- `pkg/scheduler/algorithm.go:618` `func (a *SchedulingAlgorithm) AssumeAndReserveInCache(`

A near-identical message sits 40 lines lower, so an answer has to match the exact text:

- `pkg/scheduler/algorithm.go:666` `logger.Error(err, "Scheduler snapshot AssumePod failed")`
- `pkg/scheduler/algorithm.go:657` `func (a *SchedulingAlgorithm) AssumeAndReserveInSnapshot(`

## kubernetes-definition-1 (definition)

Prompt: Which file and line defines the HorizontalController struct? One line.

must: `horizontal.go`, `93`.

    rg -n -t go 'type HorizontalController\b'

One hit; no function, variable or constant of that name exists, and no type differs only in case.

- `pkg/controller/podautoscaler/horizontal.go:93` `type HorizontalController struct {`

The graph stores the same line (Struct node, start_line 93).

## kubernetes-definition-2 (definition)

Prompt: Which file and line defines the CreateKubeAPIServerConfig function? One line.

must: `server.go`, `210`.

    rg -n -t go 'func CreateKubeAPIServerConfig\b'

One hit. The signature spans several lines; line 210 holds the `func` keyword and the name.

- `cmd/kube-apiserver/app/server.go:210` `func CreateKubeAPIServerConfig(`

The graph stores the same line (Function node, start_line 210).

## Candidates not used

Valid candidates passed over to keep the set spread across subsystems, and candidates rejected because the
answer key would have been ambiguous:

- `DetermineEffectiveSecurityContext` (callers): one caller is
  `pkg/kubelet/kuberuntime/security_context.go:30` `func (m *kubeGenericRuntimeManager) determineEffectiveSecurityContext(`,
  the same name in a different case, so case-insensitive matching cannot tell caller and target apart.
- `NewBestEffort` (callers): the callers are per-platform functions (`createProxier` is declared 3 times,
  `initNetworkUtil` 2, `CleanupLeftovers` 4) and two call sites share the base name `cleanup.go`.
- `AddPodPVCIndexerIfNotPresent` (callers): three of four callers are named `NewController`, and the base
  name `controller.go` is a substring of the other files' names.
- `rolloutRolling` (callees): seven distinct callees, one over the limit of six.
- `ValidationOptionsForPersistentVolumeClaim` (callees): `ClaimContainsAllocatedResources` is a
  case-insensitive prefix of `ClaimContainsAllocatedResourceStatus`, so the first could not be checked:
  `pkg/apis/core/validation/validation.go:2395` `if helper.ClaimContainsAllocatedResources(oldPvc) ||`.
- `numNodesToFind` (callees): the name is also a local variable and a parameter in the same file
  (`pkg/scheduler/algorithm.go:366` `numNodesToFind := a.numNodesToFind(`), and one callee is an interface
  method.
- Kubelet node log handler (chain): `journalServer.ServeHTTP -> nodeLogQuery.Copy -> copyForBoot ->
  copyFileLogs -> heuristicsCopyFileLogs -> heuristicsCopyFileLog` is a unique path, but `Copy`,
  `copyFileLogs` and `heuristicsCopyFileLog` are case-insensitive substrings of other names on it, so half of
  the path could not be checked:
  `pkg/kubelet/kubelet_server_journal.go:356` `heuristicsCopyFileLogs(ctx, w, nodeLogDir, service)`.
- `ExecREST.Connect -> ExecLocation -> streamLocation -> streamParams` (chain): unique in the code, but the
  graph merges the four `Connect` methods of the package (graph item 1).
- Garbage collector debug handler (chain): two routes to the DOT builder, and `ToDOTNodesAndEdgesForObj` and
  `toDOTNodesAndEdgesForObj` differ only in case.
- `RemoveAllOneFilesystemCommon` (impact): it calls itself,
  `pkg/util/removeall/removeall.go:79` `err1 := RemoveAllOneFilesystemCommon(mounter, path+string(os.PathSeparator)+name, remove)`.
- `frameworkForPod` (impact): the second level holds `ScheduleOne`, `scheduleOnePod` and
  `scheduleOnePodGroup`, which are case-insensitive substrings of each other.
- `parseResolvConf` (impact): the second level depends on the build platform because of a function-value
  alias, `pkg/kubelet/network/dns/dns_other.go:22` `var getHostDNSConfig = getDNSConfig`.
- `NewCertificateController` (impact, 2 + 5 functions) and `keyIDFromPublicKey` (impact, 3 + 3): valid,
  not used for spread; `keyIDFromPublicKey` also has a caller `StaticPublicKeysGetter` whose name equals the
  type `staticPublicKeysGetter` up to case.
- `SYSTEMDRIVE` (env): read in `NewManagerImpl`, next to `newManagerImpl` in the same file:
  `pkg/kubelet/cm/devicemanager/manager.go:147` `func NewManagerImpl(`.
- `DISABLE_HTTP2` (env): read in three places, two in cmd/kubelet/app/server.go and one in staging,
  `staging/src/k8s.io/apimachinery/pkg/util/net/http.go:134` `if s := os.Getenv("DISABLE_HTTP2"); len(s) > 0 {`.
- `KubeControllerManagerPort` (config): declared in three files,
  `pkg/cluster/ports/ports.go:42` `KubeControllerManagerPort = 10257`,
  `cmd/kubeadm/app/constants/constants.go:410` `KubeControllerManagerPort = 10257` and
  `test/e2e/framework/ports.go:27` `KubeControllerManagerPort = 10257`.
- Package-level error values such as `pkg/scheduler/scheduler.go:57` `ErrNoNodesAvailable = fmt.Errorf("no nodes available to schedule pods")`
  (error): the message is defined in one place and returned in others, so "raised" would be ambiguous.
