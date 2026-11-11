# Private World Bank document-type review

Ali and Caroline's shared review tool is deployed at `https://review.alialtiok.com` on Ali's Cloudflare account. It is separate from the GitHub Pages main website. The application contains all 13,271 retained documents: 117 original recorded document-type strings plus one group for the 184 records with no type. Compound type strings are preserved as recorded.

Each title has an opening of up to 100 words from its local original text. Whitespace and byte-order marks are normalized for display; these are excerpts, not AI summaries. Titles are searchable within a type; lists show 25 titles per page. Document data loads only for the selected type. No LLM/API calls are made for browsing or coding.

One shared PD/OI default applies to each type. Individual documents can have explicit PD/OI exceptions; “Use type default” removes the exception. Exceptions survive later changes to the type default, and dashboard document totals include them. Review status is independent: pending, reviewed, or no review needed. Completing a review records the reviewer and time; changing a reviewed classification reopens the review. The name selector attributes edits and comments; it is not identity verification. Normal changes save automatically. Undo/Redo reverses the selected reviewer’s changes, including earlier type actions imported from the existing history. Reversals are recorded, with prior labels and review metadata restored. Undo refuses to overwrite another later active change to the same item. Undo and Redo survive reloads. A new saved action clears that reviewer’s redo branch. Conflicting concurrent saves are rejected rather than silently overwriting another person's decisions. Practice mode keeps type changes, document exceptions and comments in browser memory, with local Undo/Redo. Leaving practice discards tests and reloads the latest saved decisions; tests are never sent as mutations. Opening titles and changing filters do not save review actions. The page polls for shared changes every eight seconds while visible and outside practice; unchanged revisions use a small response. Export backup includes all stored review history and comments, beyond the recent entries displayed in the interface.

## Classification provenance

`src/classification-rules.mjs` applies Caroline's framework to start new type groups: research, leadership, and analytical/advisory work use PD; country/sector strategies, project work, safeguards and evaluations use OI. These are editable project recodings, not World Bank metadata or completed human reviews. Broad types and boundary cases start pending. The 184 records with no type remain unassigned and pending; their earlier individual Script/Practice labels are shown only as context. No majority category is inferred for that mixed group.

The seven existing prototype decisions, attribution, comments and history are preserved by an additive, revision-checked state expansion. Existing saved labels take precedence over new defaults. The original research corpus, earlier genre coding and source workbooks are not edited.

## Access and cost

One shared password protects the HTML, document titles/openings, APIs and exports. Sessions use signed Secure, HttpOnly, SameSite=Strict cookies expiring after 12 hours. Failed logins are rate limited. Cross-origin/null-origin writes are rejected; same-origin form submissions remain usable. Every response has no-store and noindex/nofollow/noarchive directives, and robots.txt disallows crawling. Indexing directives supplement authentication; they are not the access boundary.

The existing Worker and D1 database remain on Workers Free. No paid service, plan upgrade or payment details were added. The full deployment is approximately 2.54 MB compressed, below the free Worker upload limit. No new storage service is required. workers.dev and preview URLs remain disabled; the review link is not added to the main site's navigation or sitemap.

## Build and checks

Requires Python 3 and Node 24+. There are no third-party runtime dependencies. Read the retained source corpus to generate ignored deployment assets:

```sh
python3 scripts/prepare-corpus.py /absolute/path/to/2610_Corpus_2026
npm test
npm run build
```

The preparer checks 13,271 unique document IDs, 118 type groups, and 184 missing-type records. The build validates every title/opening, group counts, duplicate IDs and deployment size. `.deploy/build-report.json` records counts and source SHA-256 hashes. Generated data and local credentials are ignored by Git. The public source branch must contain only application code and instructions, never generated assets, passwords, review records or text excerpts.

The dashboard deployment consists of `.deploy/dashboard/worker.js` and its private server module `asset-map.js`. Keep `worker.js` as the entry point. Do not place these generated modules in public GitHub Pages files. Precompressed document responses use Cloudflare's manual response encoding so they are not compressed twice.

## Cloudflare configuration

Worker and D1 database: `wb-private-type-review`. Database binding: `DB`. Schema: `schema.sql`. Custom domain: `review.alialtiok.com`. User-entered secrets: `REVIEW_PASSWORD` (at least 12 characters) and `SESSION_SECRET` (a random value of at least 32 characters). Never put secret values in source or chat. Credential entry/rotation is performed by the user.

Before changing saved state or dataset structure, export a backup through the protected review UI. Verify that a full-corpus expansion preserves all earlier records exactly. Validate title search, paging, excerpts, reviewer attribution and review completion on the site. Do not test classification changes against real reviewer decisions when a disposable local preview is available.

## Reversible changes and exceptions

The update adds `review_changes`, `document_exceptions` and `review_hidden_comments` with additive CREATE IF NOT EXISTS migrations. Existing type records are not reset. Earlier readable change events are imported into the undo journal without altering the original audit history. Document assignments validate document/type membership against the retained corpus. Every real change, undo and redo uses a revision-checked D1 batch; a concurrent change is kept and the stale action is rejected. Undoing a comment hides it reversibly; full exports retain the journal. Practice mode is session-local and does not alter the database.
