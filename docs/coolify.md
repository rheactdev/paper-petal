# Deploy Paper & Petal with Coolify

The repository's `docker-compose.yml` builds two services:

- **app** builds the existing TanStack Start/Nitro Node server with Node 24. The runtime image contains the complete `.output` directory, including fonts and stickers, and runs as the unprivileged `node` user on port 3000.
- **pocketbase** builds the official, checksum-verified PocketBase 0.40.4 binary for Linux amd64 or arm64, applies the committed migrations on startup, and runs as an unprivileged user on port 8090. Its SQLite database, accounts and encrypted calendar connections persist in the `pocketbase-data` volume at `/pb/pb_data`.

Both services have HTTP health checks and restart policies. The app waits for PocketBase to be healthy on initial startup. Container ports are internal; Coolify's proxy provides public HTTPS access to the app. Documents and uploaded images continue to live in the browser's IndexedDB.

## Coolify setup

1. Create an application from this Git repository. Choose the **Docker Compose** build strategy, base directory `/`, and Compose location `/docker-compose.yml`.
2. Use Coolify's normal Compose deployment mode. Raw mode requires you to provide your own proxy labels and networking.
3. Load the Compose definition. Under Domains, assign a domain to the **app** service, including its internal port, for example `https://paper.example.com:3000`. Visitors use `https://paper.example.com`; the port suffix tells Coolify where to proxy requests.
4. Set `APP_URL` to that public origin, for example `https://paper.example.com`, with no path or `:3000` suffix. It is a required variable.
5. If you want Google Calendar linking, supply the three Google variables below. Configure these as **Runtime only** (not available during build). Keep client secrets and the token key private.
6. Deploy. Verify both services become healthy, open the HTTPS app, and try account sign-up/sign-in. PocketBase's migrations configure the `users` and `google_calendar_links` collections; the app does not need administrator credentials.

This uses the configuration described in Coolify's [Docker Compose guide](https://coolify.io/docs/applications/builds/docker-compose) and [environment variable guide](https://coolify.io/docs/applications/configuration/environment-variables). Compose `environment` references appear in Coolify's variable editor. Save and restart/redeploy after changing runtime values.

## Runtime variables

| Variable                    | Value                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                   | Required public HTTPS origin, matching the app's Coolify domain.                                                                 |
| `GOOGLE_CLIENT_ID`          | Optional Google Web application OAuth client ID.                                                                                 |
| `GOOGLE_CLIENT_SECRET`      | Optional matching client secret; runtime only.                                                                                   |
| `GOOGLE_CALENDAR_TOKEN_KEY` | Optional 64-character hexadecimal key (32 random bytes); runtime only. Required with the OAuth credentials for calendar linking. |

`NODE_ENV`, `HOST`, `PORT` and `POCKETBASE_URL` are fixed in the Compose file. The Node service reaches PocketBase at `http://pocketbase:8090`. Give **only app** a public domain; PocketBase needs neither a public domain nor a published host port for this application.

The local `.env` and `.pocketbase` directory are excluded from Docker build contexts. Existing local account data is not automatically copied into the deployment. Enter your existing OAuth credentials and token key in Coolify's private environment settings. Preserve the token key when migrating or restoring calendar links; changing it makes those encrypted credentials unreadable. If this is a new installation without an existing key, generate one yourself with:

```sh
openssl rand -hex 32
```

Register this exact authorized redirect URI on the Google Web application OAuth client, replacing the example origin with yours:

```text
https://paper.example.com/api/google-calendar/callback
```

Enable the Google Calendar API and configure OAuth consent/test users as described in the main README. Google credentials can stay empty when calendar linking is not needed; the editor and PocketBase accounts still work.

## Data and administration

Keep the `pocketbase-data` volume across deployments and back it up before upgrades. Use PocketBase's backup tooling, or stop the service before copying its data directory, as described in the [PocketBase production guide](https://pocketbase.io/docs/going-to-production/). Back up the stable calendar token key separately. A PocketBase backup covers account/calendar-link data; document backups are the editor's downloadable `.petal` files.

For administration, use Coolify's PocketBase service terminal or a private SSH tunnel to the container's port 8090. Initial administrator creation is a user action. If you need an administrator, PocketBase's `superuser create` command must use `--dir=/pb/pb_data`; keep its credentials separate from application accounts. No superuser credentials are injected into the Node service.

IndexedDB is tied to the browser and origin. Localhost documents will not appear automatically at the production domain: download `.petal` backups locally and import them at the new domain. Accounts do not provide document cloud sync.

## Validate before deploying

Validate the Compose configuration without loading a local `.env` or exposing secrets:

```sh
APP_URL=https://paper.example.com docker compose --env-file /dev/null -f docker-compose.yml config --quiet
```

With Docker running, build the images before deployment:

```sh
APP_URL=https://paper.example.com docker compose --env-file /dev/null -f docker-compose.yml build
```

These commands validate/build; they do not start containers or publish the application. The production app expects HTTPS for secure session cookies and calendar linking. After deployment, test account persistence across a redeploy, the registered OAuth callback, and document backup/import on the public origin. Physical printing remains a user-run check.
