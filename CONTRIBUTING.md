# Contributing to Paladio

Thank you for your interest in contributing to **Paladio**! We welcome community contributions, bug reports, and enhancements that uphold our core philosophy: **absolute data sovereignty, deterministic mathematical rigor, and high-performance local intelligence**.

Paladio is open source under the **GNU Affero General Public License v3.0 (AGPLv3)** and is created and maintained by **Leandro Juan**.

---

## 1. Developer Certificate of Origin (DCO)

To ensure that all contributions are legally sound and respect open-source licensing integrity, Paladio enforces the **Developer Certificate of Origin (DCO 1.1)**. 

Every commit must be signed off by the author using `git commit -s`. By adding this sign-off line, you certify that:

```text
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

### How to Sign Off:
Simply pass `-s` or `--signoff` when committing:
```bash
git commit -s -m "feat(swarm): add dynamic meal window parsing"
```
This automatically appends:
```text
Signed-off-by: Jane Developer <jane@example.com>
```

---

## 2. Project Governance & Authorship

- **Project Lead & Principal Maintainer:** Leandro Juan (`Leandro-Juan`).
- **License Compliance:** All contributions merged into this repository are released under the AGPLv3. Contributors acknowledge that Leandro Juan retains sole authorship of the base system and release authority.
- **Legal Notice Preservation:** Consistent with standard AGPLv3 Section 4 & 7 legal notice preservation practices, attribution notices in source headers, CLI `--version` commands, and UI footers (`Powered by Paladio | Created by Leandro Juan`) must remain intact.

---

## 3. Development Workflow & Engineering Standards

### 3.1. Code Quality & Formatting
We maintain strict production standards across all languages:
- **Python (3.11+):**
  - Formatted and linted with **Ruff**:
    ```bash
    ruff check .
    ruff format --check .
    ```
  - Full type annotations enforced (`from typing import ...`).
- **Frontend (Next.js 15 / React / TypeScript):**
  - Strict TypeScript compliance (`npm run build` or `npm run lint`).
  - Styled with modern Tailwind CSS and Lucide icons.
- **C++20 Combinatorial Engine (`cpp_core/`):**
  - Formatted with `.clang-format` (LLVM/Google style).
  - Note: `cpp_core/` is mirrored automatically to the standalone repository [`paladio-core`](https://github.com/Leandro-Juan/paladio-core) via GitHub Actions.

### 3.2. Running Tests
Before opening a pull request, ensure the test suite passes locally:
```bash
# Python backend tests
pytest backend/tests/

# C++ core unit tests (if modifying cpp_core)
cmake -S cpp_core -B cpp_core/build
cmake --build cpp_core/build -j $(nproc)
ctest --test-dir cpp_core/build --output-on-failure
```

---

## 4. Submitting a Pull Request (PR)

1. **Fork the Repository:** Create your own branch from `main` (`git checkout -b feat/my-improvement`).
2. **Follow Commit Conventions:** Use conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`, `perf: ...`).
3. **Sign Off Your Commits:** Ensure all commits contain `Signed-off-by`.
4. **Open a PR:** Provide a clear description of the problem solved, architectural implications, and verification steps.
5. **CI Verification:** Ensure all GitHub Actions workflows pass (C++ builds, Python tests, MkDocs verification).

Thank you for helping make Paladio the premier sovereign travel optimization platform!
