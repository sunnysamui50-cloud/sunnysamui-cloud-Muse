# Muse Browser Mission Architecture

Muse now has a deliberately separate browser execution boundary.

## Control flow

ChatGPT / Meta Muse -> Muse MCP -> BrowserClient -> private browser worker -> Chromium

The browser worker is not an MCP server. It is a narrow HTTP execution service called only by Muse.

## Why this boundary exists

- Chromium is materially heavier than the MCP control plane.
- Browser credentials and browser process state must not share the Muse control-plane container.
- The worker has no application API, Firestore, deployment, or GitHub credentials.
- Browser missions are bounded and validated before execution.
- Screenshots are returned as MCP image content; they are not written to Firestore.
- The worker is designed for ephemeral, one-mission browser contexts.

Playwright documents structured browser automation and a pinned Docker image for browser dependencies. citeturn0search0turn1search1

## Mission contract

A mission contains at most 12 steps and supports only:

- navigate — HTTPS URL
- snapshot — bounded visible page text
- screenshot — JPEG evidence, maximum three per mission
- click — role/name or exact text
- type — label or placeholder
- wait — bounded duration or visible text

There is deliberately no arbitrary JavaScript, shell, file-system access, upload, download, cookie export, or unrestricted browser code.

## Network safety

The worker blocks:

- non-HTTPS navigation
- localhost
- .internal hosts
- Google metadata hostname
- private IPv4/IPv6 ranges
- hosts whose DNS currently resolves to a private address

Service workers are disabled so the request interception boundary is meaningful.

This is defense-in-depth, not a claim that an arbitrary browser can be made risk-free. Production deployment should additionally use a dedicated service account with no application secrets and restrictive egress/network policy.

## Cost model

The browser worker should run with min instances zero and a small maximum instance count. The control plane remains lightweight. Browser evidence should eventually move to short-lived Cloud Storage objects if screenshots become numerous; Firestore should contain metadata only.

## First mission

Example mission:

1. navigate to https://www.google.com/search?q=weather+Koh+Samui
2. screenshot
3. snapshot
4. click a link by accessible name
5. screenshot
6. snapshot

The same boundary can later drive MyVoice/Chordstream visual regression, smoke journeys, adversarial PCM browser flows, and evidence collection.
