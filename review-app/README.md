# Private document-type review prototype

Prepared for Ali and Caroline on their own Cloudflare account and domain. This is a separate Worker application; it does not replace or reconfigure the GitHub Pages website. The proposed address is `review.alialtiok.com` and has not been created.

The application uses one category per document type, a pending/reviewed/not-required workflow, comments, and an append-only server audit log. The seven-type sample contains 45 document openings. Browser choices use optimistic revision checks: a conflicting save returns 409 instead of overwriting another reviewer's work. The latest decisions are refreshed every eight seconds while the page is visible. Full audit history and comments remain in the database even though the interface shows recent entries; Export backup downloads all entries.

One shared password protects the page, sample data, API and exports. The name selector records attribution; it is not identity verification. Sessions use signed, Secure, HttpOnly, SameSite=Strict cookies and expire after twelve hours. Failed logins are limited per IP. Every response carries `noindex, nofollow, noarchive` and no-store; robots.txt disallows crawling. These indexing directives are additional controls, not the access boundary. The Worker runs before every asset request so private assets cannot bypass authentication.

## Local checks (no Cloudflare changes)

Requires Node 24 or newer. No third-party dependencies are needed for these checks.

```sh
npm test
node scripts/build.mjs /absolute/path/to/genre-type-review-preview.html
```

Generated assets, the sample JSON, local credentials and local deployment configuration are ignored by Git. The public repository may contain the application code; it must not contain document samples, passwords, session secrets or review records. Do not copy the generated assets into the public GitHub Pages root.

## Cloudflare setup

Ali authorized setup of the private sample. The Cloudflare application shell `wb-private-type-review` has been created; storage, credentials, code, and custom-domain checks must still be completed before declaring the review workspace live.

1. Review the chosen subdomain and configure the project using the official Cloudflare Wrangler CLI.
2. Create the `wb-private-type-review` D1 database in Ali's account. Copy `wrangler.jsonc.example` to the ignored `wrangler.jsonc` and enter its actual database ID. Do not use a Sites database or change the main website's DNS records.
3. Apply `schema.sql` to the new database, using `wrangler d1 execute wb-private-type-review --remote --file schema.sql`.
4. The user sets Worker secrets `REVIEW_PASSWORD` (at least 12 characters) and `SESSION_SECRET` (a new random value of at least 32 characters). Use `wrangler secret put`; never put the values in source or in chat. Setting credentials through a browser requires user entry.
5. Build the approved prototype, then deploy the Worker with the custom domain. Keep `run_worker_first: true`, `workers_dev: false`, and `preview_urls: false`.
6. Verify logged-out requests to `/`, `/api/sample`, `/api/state`, `/api/export`, and `/sample.json` do not disclose data. Verify the password works, two browser sessions share edits, stale saves are rejected, comments/history retain attribution, and logging out blocks access again.
7. Share the review link and password privately with Caroline. Do not add the link to the public site's navigation or sitemap.

Cloudflare must be connected and these checks completed before this is described as live. GitHub source preparation is separate from Cloudflare deployment and does not authorize external changes by itself.
