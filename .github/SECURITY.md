# Security Policy

Paladio takes the security, privacy, and integrity of our sovereign travel intelligence platform seriously. As a system designed for 100% self-hosted, air-gappable operation, we prioritize local data isolation, secure inter-service communication, and robust memory safety across our C++ and Python engines.

---

## Supported Versions

Only the latest active major/minor release stream receives security updates. We strongly recommend all operators run the latest tagged release.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you believe you have found a security vulnerability in Paladio, please report it responsibly using one of the following methods:

1. **GitHub Security Advisory (Preferred):**
   Submit a confidential advisory directly via GitHub at:
   [https://github.com/Leandro-Juan/paladio/security/advisories/new](https://github.com/Leandro-Juan/paladio/security/advisories/new)

2. **Direct Maintainer Email:**
   If GitHub Security Advisories are inaccessible, email the principal maintainer directly:
   **Leandro Juan** — [l.juanalba@proton.me](mailto:l.juanalba@proton.me)
   *(Subject line: `[SECURITY] Vulnerability in Paladio`)*

---

## What to Include in Your Report

To help us triage and resolve the issue quickly, please provide as much context as possible:

- **Component Affected:** (e.g., FastAPI Gateway, C++ Core Solver, LangGraph Swarm, Docker Compose networking, Next.js frontend).
- **Vulnerability Type:** (e.g., Memory safety / buffer handling, authentication/authorization bypass, SSRF, injection, denial of service).
- **Reproduction Steps:** Step-by-step instructions or minimal reproducer script.
- **Proof of Concept:** Working exploit or curl command demonstrating the issue without causing denial of service to shared resources.
- **Impact Assessment:** What an attacker could achieve if the vulnerability is exploited.

---

## Response & Disclosure Process

1. **Acknowledgement:** We will acknowledge receipt of your report within **48 hours**.
2. **Assessment & Triage:** Within **5 business days**, we will confirm or clarify the vulnerability and provide an estimated timeline for remediation.
3. **Fix & Validation:** A fix will be developed in a private branch and thoroughly validated against our test suites and sanitizers (AddressSanitizer, UBSan).
4. **Coordinated Disclosure:** A security advisory and patched release (e.g., `v1.0.x`) will be published. With your permission, we will publicly credit your contribution in the release notes.
