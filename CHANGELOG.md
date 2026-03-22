# Changelog

## [3.1.0](https://github.com/devartifex/copilot-unleashed/compare/v3.0.0...v3.1.0) (2026-03-22)


### Features

* accessibility, contrast audit, design tokens & reduced motion ([67db063](https://github.com/devartifex/copilot-unleashed/commit/67db063d9a405d38ccfe2a8db64f03d621da4e7c))
* add BODY_SIZE_LIMIT environment variable and update CSP for image sources ([ff0ee40](https://github.com/devartifex/copilot-unleashed/commit/ff0ee405e2a5e021acd1b3de9316af85b4982f6c))
* add push notification support and improve session handling in WebSocket ([5f0e954](https://github.com/devartifex/copilot-unleashed/commit/5f0e954a3060015442fc2f40d5c0a95ce7ec2545))
* complete SDK features — Hooks, MCP timeout, Image vision ([#49](https://github.com/devartifex/copilot-unleashed/issues/49), [#51](https://github.com/devartifex/copilot-unleashed/issues/51), [#52](https://github.com/devartifex/copilot-unleashed/issues/52)) ([#92](https://github.com/devartifex/copilot-unleashed/issues/92)) ([dde5b95](https://github.com/devartifex/copilot-unleashed/commit/dde5b954ffbafc1058d370adc21e97774cc13681))
* implement message queueing with send and cancel actions ([508b728](https://github.com/devartifex/copilot-unleashed/commit/508b728911b5e6a3cfb2962bc9835392a0339f30))
* improve WebSocket reconnection and session management ([41d460e](https://github.com/devartifex/copilot-unleashed/commit/41d460e65db31cb0fde5be323e3771c5a3ddce3b)), closes [#93](https://github.com/devartifex/copilot-unleashed/issues/93)
* Phase 0+1 — Infrastructure, GHAS, GitHub Flow + SDK features ([fd75bed](https://github.com/devartifex/copilot-unleashed/commit/fd75bed91dce218496b7dc5f554fd5f14ea419c0))
* populate chat history on session resume using session.getMessages() ([33566b9](https://github.com/devartifex/copilot-unleashed/commit/33566b9e7c3f55c60b4eaf3069d275e7e8bfdaef)), closes [#106](https://github.com/devartifex/copilot-unleashed/issues/106)
* SDK feature completion, UX improvements, security hardening ([0bff0b7](https://github.com/devartifex/copilot-unleashed/commit/0bff0b79bdbcd8308ae47cb18933adee0780bad5))
* search issues across all visible repos without requiring GITHUB_REPO ([aa6dd8e](https://github.com/devartifex/copilot-unleashed/commit/aa6dd8e17fd7c81f2b1bb7f914529f41c517f914))
* v4.0.0 — session persistence, PWA push, UI overhaul, Azure hardening ([75d1f65](https://github.com/devartifex/copilot-unleashed/commit/75d1f65a70fa9f74d962d54107fda5647b08f839))


### Bug Fixes

* **deps:** upgrade vite to v8, override cookie to &gt;=0.7.0 ([2930dd0](https://github.com/devartifex/copilot-unleashed/commit/2930dd00ad211c34666b02f4fb69ded08f7af491))
* keep @ and # autocomplete popovers visible with error feedback ([cfc6974](https://github.com/devartifex/copilot-unleashed/commit/cfc6974dc03fb9b6bb5d1dcaafe5b0a46b5f3d6b))
* prevent scale-to-zero, fix CLI sessions, improve eviction ([091b7be](https://github.com/devartifex/copilot-unleashed/commit/091b7be369e7ae2a966869b072b10713a71f0971))
* **security:** rewrite VAPID key generator to avoid clear-text logging alerts ([0a0a0c2](https://github.com/devartifex/copilot-unleashed/commit/0a0a0c2d1ba2d245d66c36ac7afb7a245589cbd8))
