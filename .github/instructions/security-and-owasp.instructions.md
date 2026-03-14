---
applyTo: '*'
description: "Secure coding based on OWASP Top 10 — injection prevention, access control, cryptography, XSS, SSRF"
---

# Secure Coding and OWASP Guidelines

Your primary directive is to ensure all code is secure by default. When in doubt, choose the more secure option and explain the reasoning.

## A01: Broken Access Control & A10: SSRF

- **Least Privilege**: Default to the most restrictive permissions
- **Deny by Default**: Access only granted with explicit rules
- **Validate URLs for SSRF**: Treat all user-provided URLs as untrusted — use allowlist-based validation for host, port, and path
- **Prevent Path Traversal**: Sanitize file input to prevent `../../` attacks

## A02: Cryptographic Failures

- **Strong Algorithms**: Argon2 or bcrypt for password hashing — never MD5 or SHA-1
- **HTTPS Only**: Always default to HTTPS for network requests
- **Encrypt at Rest**: AES-256 for sensitive data storage
- **Never Hardcode Secrets**: Read from environment variables or secrets management services

## A03: Injection

- **No Raw SQL**: Use parameterized queries (prepared statements) — never string concatenation
- **Sanitize Commands**: Use built-in escaping functions for OS command execution
- **Prevent XSS**: Use context-aware output encoding, prefer `.textContent` over `.innerHTML`, use DOMPurify when HTML is necessary

## A05: Security Misconfiguration

- **Secure Defaults**: Disable verbose errors and debug features in production
- **Security Headers**: Set `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`
- **Audit Dependencies**: Run `npm audit`, `pip-audit`, or Snyk regularly

## A07: Authentication Failures

- **Session Management**: Regenerate session ID on login, configure cookies with `HttpOnly`, `Secure`, `SameSite=Strict`
- **Brute Force Protection**: Implement rate limiting and account lockout

## A08: Data Integrity Failures

- **Insecure Deserialization**: Warn against deserializing untrusted data, prefer JSON over binary formats, implement strict type checking

## General Rules

- Be explicit about security mitigations in code comments
- During code reviews, explain the risk of the original pattern alongside the fix
- Never skip security validation for "convenience" or "simplicity"
