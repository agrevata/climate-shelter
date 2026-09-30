# Verification record — 28 September 2026

User monitoring update and operator dashboard crash fix.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed, no warnings |
| `npm run typecheck` | Passed for frontend and MQTT bridge |
| `npm test` | 13 tests passed |
| `npm run build` | Production build passed |
| `npm run test:http` | 12 checks passed against both development and production demo servers |
| Browser: operator | Login → dashboard rendered; production console had no warnings/errors |
| Browser: User | Eight cards, restricted navigation and working chart filters; production console had no warnings/errors |
| Responsive User layout | 1440 px: 4 columns; 820 px: 2 columns; 390 px: 1 column, no persistent horizontal overflow observed |
| Public monitoring | Shared eight-card view rendered on production preview |

SQL tests run migrations 001/002/003 and fixture seeds with PGlite. They cover RLS across schools, User denial for operational tables, command restrictions, public payload redaction, sensor ingest, device keys, setpoints, ACK checks and unpublishing. Helper tests cover boundary values, missing readings, worst-parameter air quality, room status, PCM phases, telemetry freshness and route permissions.

HTTP tests create isolated User/operator/admin/super-admin demo sessions. They verify anonymous redirects, origin checks, operational route denial, User command denial for fan/HVAC/ventilation, settings and setpoint denial, session isolation, school switching, rendered routes and logout. No physical actuator is controlled.

During editing, development Fast Refresh logged an expected full-reload warning. Fresh production browser checks for User/operator had no console warnings, errors or hydration warnings. The earlier user's development log also contained an injected `bis_skin_checked` attribute mismatch; that separate extension-related warning was not reproduced in the clean test browser.

Live Supabase hosted Realtime, Wokwi, ESP32 and MQTT delivery are **not verified in this run** because this environment uses demo mode without those credentials. Existing Realtime subscriptions are retained, and the public projection trigger is exercised by local SQL tests. Apply migration 003 before using the updated application with an existing Supabase installation.

No dependency audit or bridge bundle rebuild was performed for this UI/access update; bridge TypeScript was checked. Prior verification records should not be interpreted as a current dependency audit.

See [USER-MONITORING.md](USER-MONITORING.md) for behavior, integration steps and changed files. Screenshots: [operator](screenshots/operator-fixed.png), [User desktop](screenshots/user-desktop.png).
