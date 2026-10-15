# Private access contract

The same handler runs in the local Vite gate and Vercel Routing Middleware. All game files require a valid signed session before delivery. The entry form has no client JavaScript and never embeds PLAY_CODE or SESSION_SECRET.

| Request                                        | Expected result                                 |
| ---------------------------------------------- | ----------------------------------------------- |
| GET / without valid session                    | 200 HTML entry form; no-store                   |
| GET /assets/\* without valid session           | 401 entry form; no-store                        |
| POST /unlock, URL-encoded code, same Origin    | Correct code: 303 to / with 7-day signed cookie |
| POST /unlock, wrong code                       | 401 HTML with error                             |
| POST /unlock, foreign/missing Origin           | 403                                             |
| GET /unlock                                    | 405, Allow: POST                                |
| GET /\* with valid cookie                      | Continue to game                                |
| GET /logout                                    | 303 to / and expire cookie                      |
| Any route in production without SESSION_SECRET | 503, fail closed                                |

Cookies use HttpOnly, SameSite=Strict, Path=/, and Secure on HTTPS. Signatures use HMAC-SHA256 with server-only SESSION_SECRET and an expiry timestamp. Responses must not be shared-cacheable. Local preview uses a development-only key; Vercel requires a separately generated secret with at least 32 characters. Set PLAY_CODE to the requested code in Vercel. This shared-code gate is intended for casual private play, not user-account security or protection of sensitive data. A code holder can enter until the code or session secret is rotated. No cloud save, personal information or payment data is stored.

Run `npm test` for negative access, cookie tampering, Origin, logout and game regression checks. `npm run dev` and `npm run preview` use the same access handler for live HTTP tests.
