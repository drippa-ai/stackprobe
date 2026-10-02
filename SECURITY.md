# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub:
**Security → Report a vulnerability** on this repository.
Do not open a public issue.

We aim to acknowledge reports within three working days and will keep you
updated until the issue is fixed.

## Scope

stackprobe fetches URLs and resolves hostnames supplied by users, so we are
especially interested in:

- requests reaching private, loopback or link-local addresses (SSRF)
- ways to make the scanner submit forms, log in or send credentials
- secrets from scanned sites being stored or shown in full
