# Operations, security & handover

## Security
- **Secrets** are kept only in environment variables or a secrets manager (Docker secrets, Doppler, AWS/GCP Secret Manager). Nothing secret is stored in the database, source code or AI prompts. The access register stores only *where* each credential lives.
- **Users** each have their own token (stored as a SHA-256 hash), and a role. Revoke a user by setting `users.disabled = true`.
- **Separation of duties**: approval, activation, publishing and sending need the `approver` role. Every such action is written to `audit` along with who did it.
- **Public endpoints** have rate limits (30/min per IP), are restricted by CORS to `SITE_ORIGINS`, cap input sizes, and require consent before storing contact details. IP addresses are stored only as salted hashes.
- **Webhooks** are HMAC-verified.
- **Logging** (pino) redacts tokens and passwords.
- Turn on **2FA** for every platform account: affiliate networks, Meta, Google, MailerLite and WordPress.

## Privacy (UK GDPR / EU GDPR / US state laws)
- Consent proof is in `consent_log`: the exact wording, the page, the time and a hashed IP.
- Withdrawals go to `suppression`, and suppressed addresses are never synced or emailed.
- **Data subject requests**: export a person with `GET /api/contacts/{id}` plus their `interactions`. Delete with `DELETE /api/contacts/{id}` (admin) and also delete the subscriber in MailerLite.
- **Retention**: we suggest deleting chat transcripts after 12 months. Their extracted insights are anonymised.

## Backups
- `scripts/backup.sh` runs nightly and keeps 14 days. Copy the dumps off-site.
- Test a restore every quarter (`pg_restore`, see the script).

## Monitoring
- `GET /health` gives you uptime checks.
- **Console → Automation** shows every job's last run, its result and any errors.
- Watch these job results: a `connector … error` means a key has expired or been revoked; `AI reply was not valid JSON` is retried on the next run.

## Error handling
- Outbound calls time out after 30s and retry on 429/5xx with backoff.
- A failing connector never stops the other networks in the same job.
- A job that is still running is never started a second time.

## Handover checklist
- [ ] Production `.env` is in the secrets manager; `BOOTSTRAP_ADMIN_TOKEN` is removed after the first admin is created
- [ ] Admin, approver and editor tokens issued to named people
- [ ] Backups are running and one restore has been tested
- [ ] `npm test` passes on the production build
- [ ] Live scenario (docs/TESTING.md) passes with real accounts
- [ ] Privacy policy and cookie consent updated on the site
