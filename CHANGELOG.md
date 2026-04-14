# Changelog

## [1.1.0](https://github.com/devartifex/copilot-unleashed/compare/v1.0.0...v1.1.0) (2026-04-14)


### Features

* add image paste and drag-and-drop to chat input ([1b2af56](https://github.com/devartifex/copilot-unleashed/commit/1b2af56939e12cdbd3b996addfa62c4e3f5fe39e))
* add image paste, drag-and-drop, and fix upload CSRF/size issues ([#141](https://github.com/devartifex/copilot-unleashed/issues/141)) ([10d4560](https://github.com/devartifex/copilot-unleashed/commit/10d4560335f0bdb25ff127ff7d363473ea8e4013))
* add loading state to various panels and improve user experience during data fetching ([e48f46c](https://github.com/devartifex/copilot-unleashed/commit/e48f46c0a449e2ea472cbe5f759de5f64fcf63f1))
* add missing slash commands for settings, sessions, and status ([229b91c](https://github.com/devartifex/copilot-unleashed/commit/229b91cb4d2e5d6eb8013ffd9ac3ec9287501778))
* add UI components for SDK feature parity ([7722ef3](https://github.com/devartifex/copilot-unleashed/commit/7722ef379437da1dd306a1c85e28fcc76ef2127f))
* add Workspace file browser panel to Settings modal ([c0de12e](https://github.com/devartifex/copilot-unleashed/commit/c0de12ec8c8c6260072e70edca90d622967c822a))
* enhance file handling in AttachmentManager — implement blob URL caching and cleanup, improve error handling in ChatMessage ([7fe3736](https://github.com/devartifex/copilot-unleashed/commit/7fe373620a7491c92fb28550dcd7caba756e4984))
* inject and auto-refresh MCP OAuth tokens from CLI token store ([d6e9bed](https://github.com/devartifex/copilot-unleashed/commit/d6e9bedceabce7297f65436f6d3582036b10c769))
* load conversation history from CLI session-store.db on resume ([3643be4](https://github.com/devartifex/copilot-unleashed/commit/3643be48eec89626f3b75055bf57a751a35929cc))
* streamline chat UX — reduce event noise, consolidate usage, fix notifications ([0001392](https://github.com/devartifex/copilot-unleashed/commit/0001392dc166642f3df207e4dabb539ae2928ade))
* UI Modernization — Typography, Icons, Desktop Layout, Overlays ([cfc444f](https://github.com/devartifex/copilot-unleashed/commit/cfc444febe28202df32455b8369564fdc5c4b3a5))
* UI modernization — typography, icons, desktop layout, overlays ([#110](https://github.com/devartifex/copilot-unleashed/issues/110)) ([660e709](https://github.com/devartifex/copilot-unleashed/commit/660e7097dbf67338b52e35659e164c9f8334a25b))
* UI Modernization — Typography, Icons, Desktop Layout, Overlays ([#128](https://github.com/devartifex/copilot-unleashed/issues/128)) ([cfc444f](https://github.com/devartifex/copilot-unleashed/commit/cfc444febe28202df32455b8369564fdc5c4b3a5))
* upgrade to @github/copilot-sdk v0.2.2 with full feature parity ([6a4a206](https://github.com/devartifex/copilot-unleashed/commit/6a4a20647cd54d8b39508f0ab9ddf465e8fc77e3))
* upgrade to Copilot SDK v0.2.2 — Release 2.0 ([522bc12](https://github.com/devartifex/copilot-unleashed/commit/522bc12f7848f9ef80edf7a501d967f043540d99))


### Bug Fixes

* **a11y:** hide mobile sidebar from keyboard when closed ([dbd4c0f](https://github.com/devartifex/copilot-unleashed/commit/dbd4c0f3bbca09889a52fa620ef366133d8c9e7a))
* add aria-label to collapsed sidebar icon-only buttons ([8356601](https://github.com/devartifex/copilot-unleashed/commit/83566019846d06c116ccafd4f49641d6b62b1de4))
* add aria-label to collapsed sidebar icon-only buttons for accessibility ([3656645](https://github.com/devartifex/copilot-unleashed/commit/3656645549c507e54129c60710caa8167c02826c))
* address all 13 Copilot review suggestions ([aa44267](https://github.com/devartifex/copilot-unleashed/commit/aa44267caf8a43b3814d09270a3d76f9d7a41865))
* address copilot review — drop MIME filter, restrict CSRF origins ([b93f834](https://github.com/devartifex/copilot-unleashed/commit/b93f83498d024dab67336ef47fd395f9f3c2edb2))
* and update dependencies in package-lock.json to resolve vulnerabilities ([4869859](https://github.com/devartifex/copilot-unleashed/commit/48698596beaf4583ef5c393312a955043f2792bc))
* attach menu jump, iOS keyboard position, native picker overlap ([#110](https://github.com/devartifex/copilot-unleashed/issues/110)) ([434c01b](https://github.com/devartifex/copilot-unleashed/commit/434c01b12611be6a11fef7d3416e626773986c2e))
* docker compose command and update quickstart docs ([bd6c49c](https://github.com/devartifex/copilot-unleashed/commit/bd6c49c8b9f5eb15ad06a1e98c927b1e34e6b6d0))
* eliminate double scrollbar in settings modal ([#110](https://github.com/devartifex/copilot-unleashed/issues/110)) ([a82ed1a](https://github.com/devartifex/copilot-unleashed/commit/a82ed1ade7facce36fe382805d4046bdf7cb1f7c))
* filter phantom sessions from sidebar ([2060890](https://github.com/devartifex/copilot-unleashed/commit/206089098a257a35eb4ef05a74bacf1b82e48b00))
* guard writeHead against double-header crash on page refresh ([de963b1](https://github.com/devartifex/copilot-unleashed/commit/de963b127be4eca74fb359350846f9fa01060ed9))
* handle Windows path separators in attachment and session path display ([bb9daa8](https://github.com/devartifex/copilot-unleashed/commit/bb9daa812aad6b8b5b1daa603c8e335a1da7953f))
* remove fallback glyph from spinner component ([ca0c30b](https://github.com/devartifex/copilot-unleashed/commit/ca0c30b9715583a39101387fbb2798a26b7ed1ec))
* rename helpIn animation to avoid codespell false positive ([1b29341](https://github.com/devartifex/copilot-unleashed/commit/1b293419eda219c37553418d0b302152212690cd))
* replace 💭 emoji with Lucide Brain icon in ReasoningBlock ([0c312e6](https://github.com/devartifex/copilot-unleashed/commit/0c312e66f969fe00cd055b538a8bf3768cfe3f54))
* replace 💭 emoji with Lucide Brain icon in ReasoningBlock ([cc60dd7](https://github.com/devartifex/copilot-unleashed/commit/cc60dd73e07728874b6d2b9a6ad69d40030014b4))
* reset plan state on new session creation and clearMessages ([21e0ab7](https://github.com/devartifex/copilot-unleashed/commit/21e0ab7a60692473e26ee2de1b64413e93505321))
* resolve 4 component bugs found in audit ([2f33ec9](https://github.com/devartifex/copilot-unleashed/commit/2f33ec913057ef9c2594b5c1fd023269099f88bf))
* resolve all svelte-check errors and a11y warnings ([b0926ce](https://github.com/devartifex/copilot-unleashed/commit/b0926ce259c671163a08380531b061f6a5a98a53))
* resolve CSRF origin mismatch and raise upload body size limit ([9bbbe5e](https://github.com/devartifex/copilot-unleashed/commit/9bbbe5e90d6127e175a8b60ab40170273e57049b))
* resolve security findings and update dependencies ([ce27837](https://github.com/devartifex/copilot-unleashed/commit/ce27837af39711756b9cb9bff32cfaeabed3d565))
* revert spinner to braille, fix settings scrollbar, center model picker ([#110](https://github.com/devartifex/copilot-unleashed/issues/110)) ([952caed](https://github.com/devartifex/copilot-unleashed/commit/952caeda7814cc637635329d843e5aa54a14dcf4))
* sanitize filename in upload API to allow only safe characters, add logging for upload ID and filename validation ([7fe3736](https://github.com/devartifex/copilot-unleashed/commit/7fe373620a7491c92fb28550dcd7caba756e4984))
* settings accordion flex-shrink, taller model picker on desktop ([#110](https://github.com/devartifex/copilot-unleashed/issues/110)) ([ace6cc0](https://github.com/devartifex/copilot-unleashed/commit/ace6cc0e1c3f0eab6ef62daa72f158fb585a401c))
* unify desktop modal styles across all overlays ([#110](https://github.com/devartifex/copilot-unleashed/issues/110)) ([f39a86a](https://github.com/devartifex/copilot-unleashed/commit/f39a86a1a109a7dfa304a378b07e8829db2e6b71))
* update npm script names for clarity and consistency ([146cf68](https://github.com/devartifex/copilot-unleashed/commit/146cf68445b193686db095ef34761452f4732716))
* update skills directory references and clean up unused styles in settings components ([a6b225c](https://github.com/devartifex/copilot-unleashed/commit/a6b225cf0f78feb27b806dba62d6d8817ed09fe5))
* usage only after response, notification after render, hide report_intent ([085c477](https://github.com/devartifex/copilot-unleashed/commit/085c477699db1df384b33ef3150e247a63262ffd))
