# genius-to-twitter

A small, persistent Docker bot that chooses coherent lyric snippets from configured Genius artists and publishes them through the X API v2.

The bot is safe by default: scheduled runs are dry runs until `PUBLISH_ENABLED=true` is explicitly configured.

## What it does

1. Refreshes a local catalog from the Genius API once a day.
2. Chooses a song and obtains its lyrics.
3. Splits lyrics at section headings and blank-line stanza boundaries.
4. Builds two-to-four-line candidates without crossing those boundaries.
5. Scores complete stanzas and sentence endings above mid-thought fragments.
6. Rejects sections explicitly attributed to guests or shared with guests; unlabeled sections remain eligible.
7. Rejects over-length, excluded-term, and recently posted candidates.
8. Publishes the lyric through X API v2.

The history and song catalog live in `/data`, which must be backed by a persistent Docker volume. Punctuation and intentional casing such as names, `I`, acronyms, and mixed-case words are preserved; ordinary sentence openings are lowercased.

Lyric pages that return HTTP 403 or a Cloudflare challenge are retried once with
[`curl_cffi`](https://curl-cffi.readthedocs.io/en/latest/quick_start.html), using its
Chrome-compatible HTTP client. The Docker image includes this fallback. Both
requests have timeouts; a remaining challenge or a page without lyrics fails the
run instead of being used as post text. HTTP 429 is not retried by the fallback.

When running outside Docker, install the fallback with
`python3 -m pip install -r requirements-lyrics.txt`. Set `LYRICS_PYTHON` to the
Python executable if it is not available as `python3`.

## Cost

These figures were checked on July 18, 2026. X can change its rates, so confirm them in the [X Developer Console](https://console.x.com/) before enabling publishing.

X uses prepaid, pay-per-use credits with no monthly subscription. Its current [official pricing](https://docs.x.com/x-api/getting-started/pricing) lists:

- **Post: Create:** $0.015 per request.
- **Post: Create with URL:** $0.200 per request.

The bot makes one plain-text Post Create request per lyric and does not add a URL. At the default three lyrics per day, the 30-day X API cost is approximately **$1.35/month**.

| Frequency | Posts per 30 days | Approximate X cost |
| --- | ---: | ---: |
| Once daily | 30 | $0.45 |
| Default: 3/day | 90 | $1.35 |
| 6/day | 180 | $2.70 |
| Hourly | 720 | $10.80 |

Failed requests, retries, taxes, and future pricing changes can affect the total. Set a spending limit in the X Developer Console. Adding a URL to every post would use X's separate URL-post rate.

On an existing persistent Docker host, the marginal hosting cost should be close to zero: the process sleeps between runs and stores only small JSON files. If a new VPS is purchased solely for the bot, that provider's monthly server price will likely dominate the API bill. Genius does not provide lyric text through its documented API; `genius-lyrics` retrieves the lyric page, so network use is small but this integration is more fragile than the catalog API.

Snippet selection runs locally and does not call an AI model, so there is no LLM/API inference charge.

### Rights and platform rules

API access does not grant permission to republish lyrics. Lyrics are copyrighted material, and any licensing or permission cost is separate from the X API and hosting costs. Confirm that the intended excerpts and account have the necessary rights before deployment. This project cannot calculate that cost.

X permits entertainment-oriented automated posts subject to its [automation rules](https://help.x.com/en/rules-and-policies/x-automation), including restrictions on duplicate/spammy content. The persisted history exists partly for that reason.

## Requirements

- A persistent Docker host with Docker Compose.
- A Genius API client access token.
- An X developer app with Read and Write permission.
- OAuth 1.0a user-context API key, API secret, access token, and access-token secret.

The implementation publishes with `client.v2.tweet()`, which calls X's current [`POST /2/tweets`](https://docs.x.com/x-api/posts/create-post) endpoint.

> Security note: credentials existed in this repository's old Git history. Treat every historical credential as compromised and verify it has been revoked. Never reuse it.

## Configure

```sh
cp .env.example .env
```

Edit `.env`:

```dotenv
ARTIST_IDS=3158,96862,1840820
GENIUS_ACCESS_TOKEN=...
ARTIST_ALIASES=Rory,Rory Ferreira

X_API_KEY=...
X_API_KEY_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...

PUBLISH_ENABLED=false
POST_SCHEDULE="0 10,14,18 * * *"
TIMEZONE=UTC
```

`ARTIST_IDS` contains comma-separated numeric Genius artist IDs. When lyric headers use a stage name that differs from the Genius artist name, list those header names in `ARTIST_ALIASES`:

```dotenv
ARTIST_ALIASES=Rory,Rory Ferreira,milo
```

`POST_SCHEDULE` is a five-field cron expression. The default runs at 10:00, 14:00, and 18:00 in `TIMEZONE`. Keep `POST_ON_START=false` unless every container restart should trigger a posting attempt.

## Test before publishing

Install and run the automated tests with Node 24:

```sh
npm ci
npm test
```

Build the image and manually generate a preview:

```sh
docker compose build
docker compose run --rm lyric-bot node src/cli.js post
```

The preview is printed but neither published nor added to duplicate history. Repeat it several times and tune these settings if needed:

- `MIN_LINES` / `MAX_LINES`: candidate line-count range; defaults to 2–4.
- `MIN_CHARACTERS`: ignores snippets too short to convey a thought.
- `MAX_POST_LENGTH`: maximum lyric Post length; cannot exceed 280.
- `EXCLUDED_TERMS`: optional comma-separated, case-insensitive content filter.
- `MAX_SONG_ATTEMPTS`: songs tried when pages are missing or no suitable snippet exists.

To exercise the selector against three popular primary-artist songs per configured profile and print every complete generated post locally:

```sh
ARTIST_IDS=3158,96862,1840820 ARTIST_ALIASES="Rory,Rory Ferreira" npm run test:live
```

Set `LIVE_TEST_SONGS` to test a different number of songs per artist. This diagnostic command uses Genius's public web data, never publishes to X, and does not modify posting history. `--redact` limits each diagnostic excerpt to ten words when output will be shared publicly.

To exercise one real lyric without starting the scheduler:

```sh
docker compose run --rm lyric-bot node src/cli.js post --publish
```

This explicit command publishes even if `PUBLISH_ENABLED=false`; use it deliberately.

## Run continuously

Once previews look right, set:

```dotenv
PUBLISH_ENABLED=true
```

Then start the persistent service:

```sh
docker compose up -d
docker compose logs -f lyric-bot
```

The named `lyric-bot-data` volume preserves catalog and posting history across image updates and container restarts. Back it up if long-term deduplication matters.

Useful maintenance commands:

```sh
# Force a Genius catalog refresh
docker compose exec lyric-bot node src/cli.js sync

# Stop the service without deleting its data volume
docker compose down
```

Do not run `docker compose down --volumes` unless deleting the duplicate history is intentional.

## Development commands

```sh
npm run post       # dry-run one candidate
npm run publish    # publish one candidate
npm run sync       # refresh the Genius catalog
npm start          # long-running scheduler
npm test           # unit and integration tests with mocked APIs
```

## Design limitations

- “Makes sense” is heuristic. The selector favors stanza boundaries, terminal punctuation, balanced delimiters, and complete two-to-four-line groups; it cannot understand every lyric semantically.
- Actual lyric text is obtained from Genius HTML because the official Genius API supplies metadata but not lyrics. Page changes can break retrieval.
- Deduplication is local to the mounted history file. Running multiple replicas against different volumes can still duplicate posts; run exactly one scheduler replica.
- Performer filtering depends on Genius artist metadata and section labels. Unlabeled sections are allowed by design, while incorrect or missing Genius credits cannot be detected.
- If X accepts a post but the network fails before its response arrives, the local history cannot know it succeeded. Check the account before manually retrying an ambiguous failure.

## License

The software is available under the [MIT License](LICENSE). Lyrics and third-party service content are not covered by the software license.
