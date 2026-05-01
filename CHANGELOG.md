# Changelog

## [2.1.0](https://github.com/gotgenes/pi-autoformat/compare/v2.0.0...v2.1.0) (2026-05-01)


### Features

* add PATH probe with per-flush cache ([aa97aa7](https://github.com/gotgenes/pi-autoformat/commit/aa97aa77a1a6070e13416290a56589fe4057f2d8))
* allow fallback chain steps in schema ([535190e](https://github.com/gotgenes/pi-autoformat/commit/535190e83681c3be80fafe2947edbca21be27360))
* dispatch fallback chain steps ([a263778](https://github.com/gotgenes/pi-autoformat/commit/a26377872eca7f0186aafa619a6fe3a6570298cf))
* resolve fallback chain steps ([6daed75](https://github.com/gotgenes/pi-autoformat/commit/6daed752eaca03c5f10885055c77f027121913a8))
* share PATH probe cache across flush ([8d0af4d](https://github.com/gotgenes/pi-autoformat/commit/8d0af4da40b16d542a374cad00cafe867d41fb5f))
* support fallback steps in chain grouping ([f07acc5](https://github.com/gotgenes/pi-autoformat/commit/f07acc5199795fa4f4779292179ca90d0c8da919))
* surface fallback context in flush reporting ([2159cfb](https://github.com/gotgenes/pi-autoformat/commit/2159cfbd6def3f418d14f244fc6fd8476210de66))
* surface unknown formatter names in chains as config issues ([f46f7af](https://github.com/gotgenes/pi-autoformat/commit/f46f7afa0c82188b7089841778beffeba225dca6))
* validate fallback chain steps in config loader ([ec52a14](https://github.com/gotgenes/pi-autoformat/commit/ec52a14574cfc3ef636b008423ad08c3b77cdaf2))


### Documentation

* document deprecation pattern for removed config fields ([988ae7b](https://github.com/gotgenes/pi-autoformat/commit/988ae7b0daed4f604354b9392bd7a89d0df36cc3))
* document fallback chain steps and project-config recommendation ([3bbc846](https://github.com/gotgenes/pi-autoformat/commit/3bbc846701a0e0551451e81eae4540cff3b36381))
* plan fallback chain step type ([#13](https://github.com/gotgenes/pi-autoformat/issues/13)) ([83df5ff](https://github.com/gotgenes/pi-autoformat/commit/83df5ff05587e686f9df41871f60de2057d5f79b))
* **prompts:** renumber ship-issue steps to 1-based indexing ([3f37ba6](https://github.com/gotgenes/pi-autoformat/commit/3f37ba6613aa67a496115bb366a497df3661b8f3))
* **prompts:** require clean git pull --ff-only before plan/tdd/ship ([22cfe92](https://github.com/gotgenes/pi-autoformat/commit/22cfe92a2cd6615951fc7ba027363c43a70dc177))

## [2.0.0](https://github.com/gotgenes/pi-autoformat/compare/v1.0.0...v2.0.0) (2026-05-01)


### ⚠ BREAKING CHANGES

* `formatterDefinition.extensions` is no longer declared in schemas/pi-autoformat.schema.json. Editor validators will flag stale `extensions` keys as unknown properties. The runtime loader still tolerates them with a deprecation notice.
* `FormatterDefinition.extensions` has been removed from the public TypeScript type and from built-in defaults. Code that reads or writes that field must be updated. On-disk configs are tolerated with a deprecation notice.

### Features

* drop extensions field from FormatterDefinition and loader ([3fd791e](https://github.com/gotgenes/pi-autoformat/commit/3fd791e9de7f44f863986ad55c3db94d964cdda4))
* drop extensions from pi-autoformat JSON schema ([018c1a7](https://github.com/gotgenes/pi-autoformat/commit/018c1a776dc7fe97b4957b06874ff3391c8b26ef))


### Documentation

* add issue-driven workflow prompt templates ([14295be](https://github.com/gotgenes/pi-autoformat/commit/14295be83f5953dbbc143d0a12440f759216c5f2))
* adopt one-sentence-per-line and code-fence language conventions ([544fc68](https://github.com/gotgenes/pi-autoformat/commit/544fc68ead478120948070d904ff9698a5aa1624))
* plan removing unused formatter extensions field ([#12](https://github.com/gotgenes/pi-autoformat/issues/12)) ([fe0b6bd](https://github.com/gotgenes/pi-autoformat/commit/fe0b6bdfbad38d48c163b4b714e1d48dcc249a29))
* reflow markdown to one sentence per line ([49bdefb](https://github.com/gotgenes/pi-autoformat/commit/49bdefb6ccd853e2422213854c460d405472fa7e))
* remove formatter extensions field and note deprecation ([ddc54cd](https://github.com/gotgenes/pi-autoformat/commit/ddc54cddfdbd90b8973b21631ce555a275b895b9))


### Miscellaneous Chores

* add npm keywords including pi-package for registry ([aee15c0](https://github.com/gotgenes/pi-autoformat/commit/aee15c092e3f399d174241ed55879bcb75818b49))

## [1.0.0](https://github.com/gotgenes/pi-autoformat/compare/v0.4.0...v1.0.0) (2026-05-01)


### ⚠ BREAKING CHANGES

* removes resolveFormatterChainForFile, executeFormatterChain, and FormatterExecutionResult. Default formatter commands no longer include $FILE; the schema rejects $FILE in formatter command arguments.
* failure summaries are now grouped per batch instead of per file (one line per failed batch listing the files it ran against).
* PromptAutoformatterResult now exposes groups[] instead of files[]; each group runs its chain once with all files appended.
* $FILE substitution is no longer supported. File paths are appended to the command automatically by the batch executor.

### Features

* add resolveChain for name-based formatter resolution ([b67dbc3](https://github.com/gotgenes/pi-autoformat/commit/b67dbc389441930b545275ee67d0f7aca601ca53))
* batch-dispatch chain steps via executeChainGroup ([83a6627](https://github.com/gotgenes/pi-autoformat/commit/83a6627433586dc46850a6bc81b809c55a4c7fc9))
* drop $FILE substitution and per-file dispatch path ([d26f825](https://github.com/gotgenes/pi-autoformat/commit/d26f825487e8fa3ced0498e23f64089abc9dee6d))
* group touched files by chain identity ([6a8832b](https://github.com/gotgenes/pi-autoformat/commit/6a8832b6e1c25518d558da295dba977ce086ae4d))
* reject $FILE in formatter commands ([3865b34](https://github.com/gotgenes/pi-autoformat/commit/3865b349b9ed9ef1dff1a66a3411511c4d82d4cf))
* report formatter results per batch ([d16d7b1](https://github.com/gotgenes/pi-autoformat/commit/d16d7b1694f566f2963af6d353b7ad4356305592))
* switch PromptAutoformatter to group-based batch dispatch ([42845ee](https://github.com/gotgenes/pi-autoformat/commit/42845eef246f7d7db2182c99596dd656e753f6de))


### Documentation

* document batch-by-default formatter dispatch ([1e363d2](https://github.com/gotgenes/pi-autoformat/commit/1e363d2755f67d766941ea5800196429cf2176dd))
* plan batch-by-default formatter dispatch ([#14](https://github.com/gotgenes/pi-autoformat/issues/14)) ([ce330cd](https://github.com/gotgenes/pi-autoformat/commit/ce330cd668edb33ffc9541ad1749c0af168498bd))

## [0.4.0](https://github.com/gotgenes/pi-autoformat/compare/v0.3.1...v0.4.0) (2026-05-01)


### Features

* **config:** add customMutationTools and eventBusMutationChannel schema ([f2a3ac4](https://github.com/gotgenes/pi-autoformat/commit/f2a3ac4b5579270a5938401b3e4b8418550fbe0a))
* extract touched paths from declared custom tool inputs ([665aaed](https://github.com/gotgenes/pi-autoformat/commit/665aaed00d322f40354cb2990e2bcb3ff89ed2c6))
* subscribe to EventBus channel for peer-emitted touched files ([8986535](https://github.com/gotgenes/pi-autoformat/commit/898653575f5b4a48b506af05b5c17e363c404555))
* wire customMutationTools into default autoformatter ([638f203](https://github.com/gotgenes/pi-autoformat/commit/638f2031ed556d369d223acdcb27006d8c649fa8))


### Documentation

* add plan for additional Pi mutation tools ([5c3fb35](https://github.com/gotgenes/pi-autoformat/commit/5c3fb35d30dd8a8a757d69533eb280a8d798ec89))
* capture design philosophy in AGENTS.md and README design goals ([e318d1b](https://github.com/gotgenes/pi-autoformat/commit/e318d1bd46b536f8b8d9adae435bf05ec864416a))
* document customMutationTools and eventBusMutationChannel ([5cc7c71](https://github.com/gotgenes/pi-autoformat/commit/5cc7c713a0cbad49a5b1f5ab83afbd272495483f))

## [0.3.1](https://github.com/gotgenes/pi-autoformat/compare/v0.3.0...v0.3.1) (2026-04-29)


### Bug Fixes

* do not bypass realpath escape check via lexical path in scope test ([89bbae5](https://github.com/gotgenes/pi-autoformat/commit/89bbae50597be7cf406ecb262c2bb71a7fe0e604))
* pass typecheck for AutoformatConfig and TestPi in tests ([f6e57b1](https://github.com/gotgenes/pi-autoformat/commit/f6e57b12fb7f7c070bb186b5c7369d0d6d5e94da))


### Documentation

* add status badges to README ([358ca02](https://github.com/gotgenes/pi-autoformat/commit/358ca02bfb43e8e64952d10c2d5784562c6e4e1b))
* bump pnpm badge to &gt;=10 to match packageManager ([175fd83](https://github.com/gotgenes/pi-autoformat/commit/175fd832d066c838a1a8721a8dc888dc0f3e99a3))

## [0.3.0](https://github.com/gotgenes/pi-autoformat/compare/v0.2.0...v0.3.0) (2026-04-29)


### Features

* add format scope filter with repo-root default and cwd fallback ([aa5449b](https://github.com/gotgenes/pi-autoformat/commit/aa5449b99a15ffa480e5fdd0140bedb08566bf31))
* detect file mutations from shell commands (opt-in) ([3d06d48](https://github.com/gotgenes/pi-autoformat/commit/3d06d48c96038463dfa46c85e1f6007668c5103e))


### Documentation

* add plan for shell-driven mutation coverage ([3784e7c](https://github.com/gotgenes/pi-autoformat/commit/3784e7cf8bc7c710865a60b99748aff227f686bb))

## [0.2.0](https://github.com/gotgenes/pi-autoformat/compare/v0.1.0...v0.2.0) (2026-04-29)


### Features

* add default formatter config with user overrides ([9d0d458](https://github.com/gotgenes/pi-autoformat/commit/9d0d4587a9ab8f3a4d1f9d717dc08eea69ee673e))
* add extension-owned config loader ([cca9655](https://github.com/gotgenes/pi-autoformat/commit/cca9655b9748de46952b1f6d3a161c2754128cef))
* add prompt-end autoformatter orchestration ([4bbacba](https://github.com/gotgenes/pi-autoformat/commit/4bbacbaaca298ab4ad35cd0508be5cd0be31a8b3))
* add touched-file queue with prompt-flush semantics ([b6cdec0](https://github.com/gotgenes/pi-autoformat/commit/b6cdec0d09a3c88dcf1ee896c9d808b2a2928e67))
* execute formatter chains sequentially with non-blocking failures ([869a8b9](https://github.com/gotgenes/pi-autoformat/commit/869a8b98442c6466ef36a226a7fa551d2f88098d))
* polish autoformat reporting ([f480c44](https://github.com/gotgenes/pi-autoformat/commit/f480c441e0cdb1a7f02db657c33f305a78c783bc))
* require explicit formatter chains ([2eda3a4](https://github.com/gotgenes/pi-autoformat/commit/2eda3a46d87426b1fa0d872ae16e1ae095cc3236))
* resolve formatter chains from config registry ([b28eeec](https://github.com/gotgenes/pi-autoformat/commit/b28eeec9bde6119df2fcb20479930e7ce976b2a7))
* wire autoformatting into pi lifecycle ([786f0f5](https://github.com/gotgenes/pi-autoformat/commit/786f0f55f9dc7d3902e559b56c52dfe5c3620147))


### Documentation

* add configuration schema and package docs ([032f3ad](https://github.com/gotgenes/pi-autoformat/commit/032f3adf4f5bb1d39814831dc72e2406b8e4244d))
* clarify formatter command resolution ([fb10662](https://github.com/gotgenes/pi-autoformat/commit/fb1066263dee5fbee534de0bf9644b383a3f605b))
* mark v1 plan complete ([b25e42e](https://github.com/gotgenes/pi-autoformat/commit/b25e42e88b5fce6e4a8f796673b4b002cfce506e))


### Miscellaneous Chores

* add prek and formatter configuration ([02eb50b](https://github.com/gotgenes/pi-autoformat/commit/02eb50b134a2a2a93f577088e9a5c33a4f86ad75))
* add project autoformat config ([d09ab48](https://github.com/gotgenes/pi-autoformat/commit/d09ab4866b10006318ba6370429160c6fe6e3c3c))
* initialize pnpm package metadata ([8644504](https://github.com/gotgenes/pi-autoformat/commit/86445046399a52e161a221f03ce57ad32eba2836))
* initialize repository plan and agent guidance ([548fa70](https://github.com/gotgenes/pi-autoformat/commit/548fa70aedfdacfce8e1225e682c1f6958b34770))
