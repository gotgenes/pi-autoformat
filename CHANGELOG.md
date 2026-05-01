# Changelog

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
