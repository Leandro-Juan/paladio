# Changelog

## [3.1.0](https://github.com/Leandro-Juan/paladio/compare/v3.0.0...v3.1.0) (2026-11-27)


### Features

* **backend:** add category and lexical scoring to POI retrieval ([b7d88fe](https://github.com/Leandro-Juan/paladio/commit/b7d88fe24dafbd356ca8fc5ec4b5fa8ec57f5759))
* **backend:** add deal watch alerts migration and dynamic booking links ([3c82abb](https://github.com/Leandro-Juan/paladio/commit/3c82abb129572c3a6b2aa128f540ed70ddc91b3e))
* **backend:** add Google Flights provider and round-trip verification ([d497c4f](https://github.com/Leandro-Juan/paladio/commit/d497c4fab084b54c7685c21c109721bbeec8bd52))
* **backend:** add persistent trip generation jobs and manager ([590fe94](https://github.com/Leandro-Juan/paladio/commit/590fe94717853412b8ae39ab1266eeda9bf7898c))
* **backend:** enhance LLM model discovery and provider config ([2d4f0e4](https://github.com/Leandro-Juan/paladio/commit/2d4f0e4b6beb0e52cf20e51b0d29382eef02540b))
* **frontend:** add motion tokens, view transitions, and animation hooks ([9202f1b](https://github.com/Leandro-Juan/paladio/commit/9202f1bea37b914c5de553d140dcd53f0fff7a24))
* **frontend:** add persistent trip generation overlay and store ([dea3cb0](https://github.com/Leandro-Juan/paladio/commit/dea3cb0415fde9198f13080af3de558a14cc8b1a))
* **frontend:** enhance LLM config card and model selector ([55531c1](https://github.com/Leandro-Juan/paladio/commit/55531c1b8d155a32c7efadc0cb90fa8e1231cf0a))
* **frontend:** format transit durations over 59 minutes in hours ([d094818](https://github.com/Leandro-Juan/paladio/commit/d094818bef26b8873a4d637e55d2cb88df1d43f7))
* **frontend:** update i18n translations across all 10 locales ([1d41196](https://github.com/Leandro-Juan/paladio/commit/1d411963b4c2a9ece4261ad16f31f161a67dec82))
* **install:** auto-select free ports when defaults are in use ([a51403a](https://github.com/Leandro-Juan/paladio/commit/a51403a5395419b50487dd826a506afeb368f051))


### Bug Fixes

* **backend:** harden PBF downloads, Celery memory, and transit service ([22464ea](https://github.com/Leandro-Juan/paladio/commit/22464ea5c7dfbeb633cd80e3a316d2e6b5318009))
* **backend:** persist wallet key and improve ticket seeding ([1e02e54](https://github.com/Leandro-Juan/paladio/commit/1e02e54e8dc9a2132ccc07e53fa6f074ac7c044e))
* **ci:** eliminate flight sweep sleep hang and stabilize Playwright E2E specs ([03d794f](https://github.com/Leandro-Juan/paladio/commit/03d794f47143892bf661687de0e2e2483f428fee))
* **docs:** rebuild smooth 1x promo preview and host watchable tour video on Pages ([35c6369](https://github.com/Leandro-Juan/paladio/commit/35c6369636520991471f58c1941a28d96fd145e3))
* **frontend:** refine drag preview, media URLs, theme, and monitoring ([b0b028b](https://github.com/Leandro-Juan/paladio/commit/b0b028ba2b4a7851bf1ff8d6d0d6d2071665ca17))
* **security:** apply URI encoding sanitizer in sanitizeImageUrl ([ec11697](https://github.com/Leandro-Juan/paladio/commit/ec116978e5c6861170e68a46950de1e97b504256))
* **security:** harden auth, updater SSRF/size bounds, wallet storage, and C++ bindings ([0a07b29](https://github.com/Leandro-Juan/paladio/commit/0a07b29b0a3805e42b13ce3ece1b06423ce10749))
* **security:** harden SSRF, path injection, ReDoS, XSS, and error sanitization ([bc06d88](https://github.com/Leandro-Juan/paladio/commit/bc06d88a22572d9a2c030bf904b664b85ece0acd))
* **security:** isolate data-image Blob rendering from HTTP URL sanitization ([121164b](https://github.com/Leandro-Juan/paladio/commit/121164bd5207fbe9ce2239fe8130987697814ac5))
* **security:** isolate sanitized image preview rendering from JSX attribute XSS flows ([928bf65](https://github.com/Leandro-Juan/paladio/commit/928bf6569d89bc92e8adaec25ebc5d05bd07ced8))
* **tests:** align test_user_system with normalized preference and L2 embedding contracts ([ed598d3](https://github.com/Leandro-Juan/paladio/commit/ed598d3dac305592863389e8c9d8e9c49f46f821))
* **tests:** update portal CT locators, market defaults, and relative GTFS dates ([c2ab57e](https://github.com/Leandro-Juan/paladio/commit/c2ab57ef66283bf9a1b055aaa05995b73c49dfc5))
* **tests:** validate parsed booking URL hostname for CodeQL alert [#29](https://github.com/Leandro-Juan/paladio/issues/29) ([414f7f7](https://github.com/Leandro-Juan/paladio/commit/414f7f759a9c9d077605942ecb5bd42b057b2707))
* **trips:** fix blank trip timeout, city ranking, and generic hotel lookup ([f1a586c](https://github.com/Leandro-Juan/paladio/commit/f1a586ceb976271e8ef2d8722f99dea1c47d1932))


### Code Refactoring

* **backend:** centralize runtime data paths and add docker migrate service ([e6261c5](https://github.com/Leandro-Juan/paladio/commit/e6261c564951a0ae0be58f27cc8569f2758c5b12))
* **frontend:** move place placeholder illustrations into frontend components ([422bd9b](https://github.com/Leandro-Juan/paladio/commit/422bd9b7f1f747ec48d44a139d84c64a6fd8bb26))


### Documentation

* **assets:** rename dark logos to white and add promo media ([ec8f771](https://github.com/Leandro-Juan/paladio/commit/ec8f7710796ec0660c9ac6de250fc4edb5205c8f))
* document experimental deal scraping and updated install/data paths ([5128aa5](https://github.com/Leandro-Juan/paladio/commit/5128aa55f9324ddb3e2d1c71dd80353c2d6d4ae3))
* lower minimum and recommended RAM requirements to 4 GB and 8 GB ([2033d75](https://github.com/Leandro-Juan/paladio/commit/2033d75d36d44a9c3446ac238c3d992bdfac3f9e))
* mention drag-and-drop editing for blank trips in README ([2358348](https://github.com/Leandro-Juan/paladio/commit/2358348f8929a8f2d9628893dc35a8e7be855a9a))
* polish public-launch docs, templates, wiki sync, and repo hygiene ([6b91d49](https://github.com/Leandro-Juan/paladio/commit/6b91d493471de1d1fab1da3394d27e7137af0c86))
* **readme:** add live demo links, refreshed screenshots, and collapsed gallery ([5697b92](https://github.com/Leandro-Juan/paladio/commit/5697b926bd7111a60387fbad5b88582a00dae795))
* **readme:** embed 1080p product tour video directly ([99042ff](https://github.com/Leandro-Juan/paladio/commit/99042fff1def0e3902475af7c5c8648215f44400))
* **readme:** update 1080p video user-attachment URL ([2e3eba1](https://github.com/Leandro-Juan/paladio/commit/2e3eba12d1e595455b07d9928f715f9624ad56bb))
* update installation, self-hosting, and developer guides ([2decffe](https://github.com/Leandro-Juan/paladio/commit/2decffe7f3d9352f4c237c95479e9318137c362a))

## [3.0.0](https://github.com/Leandro-Juan/paladio/compare/v2.0.0...v3.0.0) (2026-11-24)

### Features

* **frontend:** upgrade to Next.js 16 with PWA Service Worker caching, IndexedDB offline trip pinning, and print PDF trip dossier
* **i18n:** full 10-locale internationalization (including Arabic RTL layout) and dynamic POI translation
* **workspace:** trip revision history with revert/restore, date shifting, trip duplication, saved place collections, receipt scanning, and hotel date syncing
* **monitoring:** bidirectional route & lodging monitoring, city storage vault, holiday preference synchronization, and 8-axis taste calibration
* **demo:** standalone encrypted `demo` branch with per-user hourly sandboxes, copy-on-write media, and optional Upstash Redis persistence
* **deploy:** self-hosted installers and automated multi-arch Docker image publishing

## [2.0.0](https://github.com/Leandro-Juan/paladio/compare/v1.0.0...v2.0.0) (2026-10-04)

### Features

* **itinerary:** Itinerary v2 combinatorial optimization engine with universal city readiness across arbitrary global destinations
* **itinerary:** 3-tier hierarchical attraction architecture, submodular diversity selection, and Hungarian day assignment
* **itinerary:** real-time Overpass OSM geocoding and live POI ingestion with multi-mirror failover
* **itinerary:** critic-repair refinement loop with pace calibration and meal scheduling
* **cpp_core:** C++20 TSPTW solver extension with dynamic arrival times, taxonomy categories, and expansion limiters
* **auth:** user administration flow, profile management, and collapsible sidebar UserMenu

## 1.2.0 (2026-10-02)


### Features

* **backend:** add manual constraints and unify ticket parsing via LLM ([0b857c4](https://github.com/Leandro-Juan/paladio/commit/0b857c44bdfda9fd5559c154b8a36a27186788f2))
* **backend:** add verify_semantic_rag cli utility ([a60c0d1](https://github.com/Leandro-Juan/paladio/commit/a60c0d1fe1bc129fcc7cefda194f62b6b5aa7d54))
* **backend:** auto-trigger GTFS download on trip creation and filter registry ([cc56e04](https://github.com/Leandro-Juan/paladio/commit/cc56e04ac1fb79af9ee38040a5e739ecb4249fa0))
* **backend:** automate osm road ingestion, async gtfs compilation, and 1-click transit upgrade ([791579a](https://github.com/Leandro-Juan/paladio/commit/791579aeaedf792d77529d2cd89fe058daffbb1e))
* **backend:** implement 768D semantic RAG and permanent taste learning ([edd9d6d](https://github.com/Leandro-Juan/paladio/commit/edd9d6d4b366259ea218a46762813c6dbb885583))
* **backend:** implement dynamic GTFS resolution via Mobility Database ([cd82952](https://github.com/Leandro-Juan/paladio/commit/cd82952810dae2b9701788d5bf6879dbd62b656c))
* **backend:** implement dynamic multi-city transit and POI pricing ([8aa13e5](https://github.com/Leandro-Juan/paladio/commit/8aa13e51e3a535ee556431b93d4283c218f5788c))
* **backend:** implement LLM RAG prompt analysis and balanced POI selection ([1b22912](https://github.com/Leandro-Juan/paladio/commit/1b22912f28552c729ee69d40b50017b22adea3bd))
* **backend:** implement multimodal GTFS transit routing and maneuvers ([66e0d28](https://github.com/Leandro-Juan/paladio/commit/66e0d282fdd44cdcdfef58f95d8a08784780f1e7))
* **backend:** implement persistent ML taste evolution from prompt ([2a6f8ca](https://github.com/Leandro-Juan/paladio/commit/2a6f8ca989ba5b35f4dd6cb0633142b1cccfb89b))
* **backend:** implement sequential GTFS compilation queue and bounds ([211f592](https://github.com/Leandro-Juan/paladio/commit/211f592582d5e949608f2988c3da42b1fb50fcb4))
* **backend:** implement two-node verification and guardrails architecture ([ec0cd7d](https://github.com/Leandro-Juan/paladio/commit/ec0cd7d68f3245f0ece6dd2c80fdd228b54547e4))
* **backend:** replace mocked affinity and centrality with ML score and popularity heuristics ([67b80e8](https://github.com/Leandro-Juan/paladio/commit/67b80e809ff46d7fd1ef5c27afd829dd097aa865))
* **backend:** resolve public transit fares & airport surcharges ([c8aa46c](https://github.com/Leandro-Juan/paladio/commit/c8aa46c8648f1ba93f9d0adf451ce85cf2fbd0c0))
* **backend:** update test client with interactive trip creation and mock tickets ([2662d91](https://github.com/Leandro-Juan/paladio/commit/2662d91776a16341596dfa1336ab453959a59b02))
* **budget:** add itemized cost exclusion with amber consistency warning and integrate transit fees ([a50e8fb](https://github.com/Leandro-Juan/paladio/commit/a50e8fbc8822016901b333a94c409f6666d87ab9))
* **cpp_core:** restructure into paladio-core with Diataxis docs, benchmarks, and isolated CI ([7257944](https://github.com/Leandro-Juan/paladio/commit/7257944658d0f6720db5337eaacf07752b003f5b))
* **frontend:** add breakfast meal window support and backend mapping ([e15f63b](https://github.com/Leandro-Juan/paladio/commit/e15f63b45130d7860a7c46ca8b981b770c5996af))
* **frontend:** add day cluster tabs, territory polygons, and svg pins ([bdd9c15](https://github.com/Leandro-Juan/paladio/commit/bdd9c15afff4ab9eb3d1a43a46a93bf17b3e6172))
* **frontend:** add dual currency conversion widget to dashboard ([2ada9ea](https://github.com/Leandro-Juan/paladio/commit/2ada9eab1a320ecfea5eb7b8be51810607a88d5a))
* **frontend:** add operations calendar and unify dashboard telemetry ([7e47eb8](https://github.com/Leandro-Juan/paladio/commit/7e47eb8a9f3bcf25b7e825e6e93a4c2a57b0858b))
* **frontend:** add POI category badges and timeline visual tags ([1f79d5a](https://github.com/Leandro-Juan/paladio/commit/1f79d5a623d8ee3c1460b9eeb5dc0d45c4771433))
* **frontend:** add user-isolated notification system with toasts ([c4d3b8b](https://github.com/Leandro-Juan/paladio/commit/c4d3b8b409828e77ec45dc0869c6094a1b6fb00f))
* **frontend:** implement GTFS-aware transit upgrade and flight buffers ([3d5f50d](https://github.com/Leandro-Juan/paladio/commit/3d5f50d32a5c1f3bc981bc6df49562d3b7184695))
* **frontend:** implement sovereign user auth and config tab ([e958611](https://github.com/Leandro-Juan/paladio/commit/e9586114a0ddf990e60516c80527f5395b5d96b9))
* **frontend:** implement trip completion detection and archive filtering ([e5e7628](https://github.com/Leandro-Juan/paladio/commit/e5e76287bcc086d5dd58e330c06b4fb1e0221398))
* **frontend:** integrate horizontal logo lockup and remove redundant titles ([ad1f899](https://github.com/Leandro-Juan/paladio/commit/ad1f899eeae1b5f58d17c4db341e8d4d9d2330aa))
* **frontend:** make left navigation sidebar collapsible into icon rail ([9233460](https://github.com/Leandro-Juan/paladio/commit/9233460091c5e98f54c3f2b318de359e58154959))
* **frontend:** render red abort modal for guardrails rejection ([4605795](https://github.com/Leandro-Juan/paladio/commit/460579525ae8e43270f2ce80f492e2fde265d4aa))
* **frontend:** render turn-by-turn transit steps and transit routing in ui ([058d43a](https://github.com/Leandro-Juan/paladio/commit/058d43ac0ceaa14d1a307337dca80597d3cb4fa8))
* **frontend:** replace emojis with SVG pictograms and animated spinner ([8b786b3](https://github.com/Leandro-Juan/paladio/commit/8b786b35d8a71e710058ba8128e3453bee28621e))
* **frontend:** replace gtfs recompile with delete and fix abort modal ([15c5563](https://github.com/Leandro-Juan/paladio/commit/15c556354ecb1d7114ba3b38ff6b14944ae8e2c0))
* **swarm:** enable normal graph execution and date selection for simulated trips ([984751b](https://github.com/Leandro-Juan/paladio/commit/984751b8aaa8a100aac095f84ee5a7e4677bda0d))
* **trips:** add multi-user crew, budget dissection, and tricount ledger ([4ceca7a](https://github.com/Leandro-Juan/paladio/commit/4ceca7a7f365255aa2ff0a44884b9dc3f8860ed5))
* **trips:** enforce trip participant uniqueness and minimum crew requirements ([fe8b7b0](https://github.com/Leandro-Juan/paladio/commit/fe8b7b0712cdbf81e2113648b62dfb2f79ee31d4))


### Bug Fixes

* **assets:** optimize logo padding and tab favicon scale for visual parity ([3929875](https://github.com/Leandro-Juan/paladio/commit/3929875dfb2f1b787d11bd184299cfa9007a5475))
* **backend:** add attractions scalar migration and fix ci pytest configuration ([bfb96f3](https://github.com/Leandro-Juan/paladio/commit/bfb96f32ec1c19ec82729a5dffb434dc4f4a9948))
* **backend:** add geocoding coordinate resolution and hermetic test data ([d4ba8a6](https://github.com/Leandro-Juan/paladio/commit/d4ba8a6e53c6758e8df7ab16cf4b4b0fcc9b747c))
* **backend:** alter users embedding column from jsonb to vector ([e9cbe7a](https://github.com/Leandro-Juan/paladio/commit/e9cbe7aed0cbe09020c4f7ec0b2ba1712dcee205))
* **backend:** configure Postgres CI service and mock travel provider ([620513e](https://github.com/Leandro-Juan/paladio/commit/620513e24663b6a1eb23ee26ace9bc47c7711847))
* **backend:** disable meal deadlines for short partial days ([3b40ebb](https://github.com/Leandro-Juan/paladio/commit/3b40ebb148a83cc0314f4b53719305fd064b8643))
* **backend:** fix multi-day solver meal constraints and empty itinerary ([b683313](https://github.com/Leandro-Juan/paladio/commit/b683313a2d598dad8beb0c5f15fb665f1d084156))
* **backend:** fix shopping default and enable prompt-driven taste evolution ([a55f115](https://github.com/Leandro-Juan/paladio/commit/a55f11503d270d7ea95af3b9c91ee6c4a1e6197c))
* **backend:** fix TransitRoutingError import in trip upgrade endpoint ([4756e14](https://github.com/Leandro-Juan/paladio/commit/4756e14704723a89aa3ef5bd0271b7264856cad0))
* **backend:** gate live semantic rag tests and harmonize docker endpoints for ci ([b46abc5](https://github.com/Leandro-Juan/paladio/commit/b46abc5bd0a7b34938cd3b9621ab7cbb448db1aa))
* **backend:** improve agent tool calling and resolve IATA mapping ([e4c2798](https://github.com/Leandro-Juan/paladio/commit/e4c27981e69a258bd39e903e23adf4bb8eb94d26))
* **backend:** isolate transit feeds and cap Valhalla build concurrency ([c2dac32](https://github.com/Leandro-Juan/paladio/commit/c2dac3237075555fefb43c01f25820b4871ea0e1))
* **backend:** mark osm_status as READY upon successful tile compilation ([8194e09](https://github.com/Leandro-Juan/paladio/commit/8194e09e41f9d976fae03e5d327bb010996057b9))
* **backend:** prevent transit compilation timeout and handle fallback estimates ([6a404cf](https://github.com/Leandro-Juan/paladio/commit/6a404cfd04d32a6bbc4067730563383042e859fa))
* **backend:** remove duplicate clarification event on verification interrupt ([d858eef](https://github.com/Leandro-Juan/paladio/commit/d858eef6273fa063221f3bb13833fc2529c0f1f2))
* **backend:** remove invalid interrupt outside runnable context in iata mapping ([e61e58b](https://github.com/Leandro-Juan/paladio/commit/e61e58b64af917693affc24f5f7fb00bbec09ccd))
* **backend:** resolve GTFS transit cache column and sequential queueing ([6298ed1](https://github.com/Leandro-Juan/paladio/commit/6298ed1737f2b69e1c843864e45c40e874e22f32))
* **backend:** update madrid gtfs url and stabilize valhalla service ([0f96474](https://github.com/Leandro-Juan/paladio/commit/0f96474a940bdbfcf5ccf011b96ab3fe9562e59e))
* **build:** add wheel install target and pre-install build deps in CI ([ad9244a](https://github.com/Leandro-Juan/paladio/commit/ad9244ae07164914b0cf662b4fb412dcf27c3cb3))
* **core:** remediate comprehensive audit issues across engine, api, and ui ([2314e6a](https://github.com/Leandro-Juan/paladio/commit/2314e6ac9c9b3d988b94c358eadd3ea4b736d95d))
* **cpp_core:** guard test sanitizers, harmonize exceptions, add typing stubs and install targets ([2539b06](https://github.com/Leandro-Juan/paladio/commit/2539b06381feb162c119388da93b6ca0b48e8519))
* **docs:** resolve GitHub LaTeX MathJax rendering error and update GitHub Pages workflow ([70d9d88](https://github.com/Leandro-Juan/paladio/commit/70d9d88bb5bf642cbdaa62a371fb2d94e196287d))
* fixed a websocket reconnection bug ([ca8cefd](https://github.com/Leandro-Juan/paladio/commit/ca8cefdf148da48a9c0b3387db84a7e52f18ee10))
* **frontend:** add date constraints and quick auto-fix in verification cockpit ([a1263ee](https://github.com/Leandro-Juan/paladio/commit/a1263eee95b354e0d02dc9055fe04d51ccbc0a6f))
* **frontend:** display failed and unavailable cities in control center ([ffec940](https://github.com/Leandro-Juan/paladio/commit/ffec9404a7469458498c645fefda30dfef27c2de))
* **frontend:** ensure portable screenshot path and resilient mock websocket for ci e2e tests ([5dc3db4](https://github.com/Leandro-Juan/paladio/commit/5dc3db473bcee8467664ce184db62d8bd342aae2))
* **frontend:** handle active mission countdown and verify past trip completion ([7730686](https://github.com/Leandro-Juan/paladio/commit/77306865fc7184941c5d403bbfcd4e15fbba5f35))
* **frontend:** isolate live tests from standard e2e CI suite ([dc65010](https://github.com/Leandro-Juan/paladio/commit/dc65010ce9dd9ceadf607deb32f6f641ee7f28ab))
* **frontend:** replace CARTO basemap with keyless Esri Canvas ([6e49855](https://github.com/Leandro-Juan/paladio/commit/6e4985562211918b8421b0569b69b25d3761d1e6))
* **frontend:** restore auth headings for E2E tests and add env template ([870663f](https://github.com/Leandro-Juan/paladio/commit/870663fdcffdca49e9eb722645100083c54b1393))
* **frontend:** separate guardrail logic checks from verify cockpit ([c377bac](https://github.com/Leandro-Juan/paladio/commit/c377bacf827dc919c44bdbf4d5db6387e232bb71))
* **frontend:** use white logo for browser tab icon ([445ab8b](https://github.com/Leandro-Juan/paladio/commit/445ab8bbfda762ceaac0ad1c89333984958320b4))
* purge mocked fallbacks, restore solver invariants, and decouple domain ([60ae467](https://github.com/Leandro-Juan/paladio/commit/60ae467cb333351f1dd060630bcce03afebd38de))
* resolve bridge test failures and make e2e test skip dynamic ([89446a4](https://github.com/Leandro-Juan/paladio/commit/89446a4d0a888838bc7d338fc909d03e078adb22))
* resolve comprehensive audit flaws and restore solver invariants ([29fb297](https://github.com/Leandro-Juan/paladio/commit/29fb297c3cb8e07ce4a7e25acbf84423dca49416))
* **security:** resolve CodeQL path injection alerts in cleanup_city_gtfs_resources ([58345a4](https://github.com/Leandro-Juan/paladio/commit/58345a4bdaef0b28663108aaa8fa65fe55d97e41))
* **security:** resolve Dependabot vulnerabilities and remove unreferenced proxy script ([57a6d82](https://github.com/Leandro-Juan/paladio/commit/57a6d8257d1b595dc16237abd0c42a0a60c40005))
* **swarm:** enforce user confirmation of parsed data before guardrails ([15bb2ea](https://github.com/Leandro-Juan/paladio/commit/15bb2ea34481f4dfae63ed45a56e4bdf7c32ed31))
* **tests:** resolve failing pipeline tests by mocking LLM calls and fixing assert sequence ([9a6977d](https://github.com/Leandro-Juan/paladio/commit/9a6977d9977984070a353c708dce8896a7eff803))


### Performance Improvements

* **backend:** skip external exchange rate fetch during test mode ([69a4c25](https://github.com/Leandro-Juan/paladio/commit/69a4c25d6fc179215c8c70463335f7e25f9263d4))


### Code Refactoring

* **backend:** apply phase 1-5 comprehensive code audit fixes ([cdf80f1](https://github.com/Leandro-Juan/paladio/commit/cdf80f15351c626b506040882eac825cb38a4b95))
* **backend:** eliminate poi schedule and financials submodels ([ffa69b5](https://github.com/Leandro-Juan/paladio/commit/ffa69b587a1cf6b4c041d8a69b19a259f18dc104))
* **backend:** eliminate TransitEdge and streamline transit matrix handling ([2000b01](https://github.com/Leandro-Juan/paladio/commit/2000b019eb6dff344984ad3d9aae36a07bbb867e))
* **backend:** integrate SQL-backed ML profiles and dynamic RAG collections ([0c27f8e](https://github.com/Leandro-Juan/paladio/commit/0c27f8e0e14294ec7ead8250f931f7e1e917e0e2))
* **backend:** remove dead planner_fetch node from swarm graph ([e5e3eda](https://github.com/Leandro-Juan/paladio/commit/e5e3eda837e287a1943aa298680720915b7d264a))
* **backend:** remove rag node from swarm pipeline ([eb0058d](https://github.com/Leandro-Juan/paladio/commit/eb0058d504cf17ed1d9270f888991e8bc54d3d23))
* **backend:** remove scrapers and external flight/hotel API dependencies ([dba1645](https://github.com/Leandro-Juan/paladio/commit/dba1645cd9fffe5c0efac4395c2738d3b3ce0807))
* **backend:** replace hardcoded Madrid MVP with dynamic RAG and TravelDataProviders ([d9ef049](https://github.com/Leandro-Juan/paladio/commit/d9ef049815a3e68584913e602508097e9db04eca))
* **backend:** replace JAX MLP with pure NumPy sovereign hybrid scorer ([0f86090](https://github.com/Leandro-Juan/paladio/commit/0f86090947b4d416b0dfc1cd7d2708fa236d107a))
* **backend:** separate prompt analyzer and rag into distinct nodes ([1e94e5e](https://github.com/Leandro-Juan/paladio/commit/1e94e5eb3a99478a7e1bb83e1a5f84de2c9e89de))
* eliminate linter suppression directives across codebase ([11b4113](https://github.com/Leandro-Juan/paladio/commit/11b4113d6f19adc447111fc5dee73dc3efa16f33))


### Documentation

* add design spec for public showcase docs, AGPLv3 licensing, and Diátaxis portal ([4309fa5](https://github.com/Leandro-Juan/paladio/commit/4309fa54bbd8ce03f6981804caafe1f4247af186))
* add frontend notification system design specification ([22c00cc](https://github.com/Leandro-Juan/paladio/commit/22c00ccf12ce55997ee85fc37a570c8f987edaa0))
* add initial readme to cpp core ([c810a3b](https://github.com/Leandro-Juan/paladio/commit/c810a3b4242522584a7129325963bea0fdaaa5e3))
* **agents:** enforce mandatory versioning and tagging protocol ([b5a2a89](https://github.com/Leandro-Juan/paladio/commit/b5a2a896e8d67e325b20b510738c60a589eaf99f))
* align GitHub Pages URL to lowercase in mkdocs and README ([34108d3](https://github.com/Leandro-Juan/paladio/commit/34108d356e634887f49fb5872dbe27eaf9935adb))
* enrich design spec with frontend, POI database, and backlog roadmap horizons ([ec80678](https://github.com/Leandro-Juan/paladio/commit/ec8067898dfbea5707696b6fc2da92c876b589fc))
* establish public showcase, AGPLv3 license, and Diátaxis documentation portal ([c703e1d](https://github.com/Leandro-Juan/paladio/commit/c703e1dd69d9117d6dc782e5edd01da305f6f52c))
* fix Mermaid diagram syntax and LaTeX MathJax underscore parsing errors ([7ea7550](https://github.com/Leandro-Juan/paladio/commit/7ea7550fd64a98381f95bdc0847ea71cdeb7ce02))
* modernize trip tutorial with Active Engine and boost logo contrast ([c58d59e](https://github.com/Leandro-Juan/paladio/commit/c58d59ef262c5be7e18e68de968402e0af9d5863))
* restore clean logo and Paladio title on root README ([01e42a3](https://github.com/Leandro-Juan/paladio/commit/01e42a36ed2c20593b06fb6b66ee3d6747c05c37))
* **spec:** add design specification for paladio-core showcase ([fa2c550](https://github.com/Leandro-Juan/paladio/commit/fa2c550d96836557646927bbe3291f28d7cdbbc6))
* update LangGraph architecture diagrams with DB collision flow ([125f3f8](https://github.com/Leandro-Juan/paladio/commit/125f3f869053ff2af69ba65f126fd0a25086d35e))
* update Phase 4 to focus on reactive UI and frontend experience ([763a150](https://github.com/Leandro-Juan/paladio/commit/763a1507daa71719cff3c4528c8bb844efddcd9c))
* use logo_horizontal_dark in README headers and keep core title ([6f80a5a](https://github.com/Leandro-Juan/paladio/commit/6f80a5a436b0bbc378886feff536b5eb4718d4eb))
