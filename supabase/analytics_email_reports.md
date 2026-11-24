# Analytics email reports

1. In the **main VikaTech website Supabase project**, run the complete contents of `supabase/analytics_email_reports.sql` in SQL Editor. This is the project that contains `user_settings`, `daily_analytics`, and `activity_logs`; it is not the separate MQTT URL database.
2. Deploy the website changes. The new daily Vercel cron calls `/api/cron/analytics-reports` at 05:00 UTC. It checks each user's saved time zone and sends the previous completed week or calendar month when due. A database delivery record prevents the same period from being sent twice in normal operation.
3. Verify the deployment has `CRON_SECRET`, `SMTP_USER`, and `SMTP_PASS`. The existing optional SMTP settings `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and `SMTP_FROM` are reused. `NEXT_PUBLIC_SITE_URL` should point at the public website so links in the emails open the right site. Do not put SMTP credentials in `NEXT_PUBLIC_*` variables.
4. A signed-in user can open **Settings → Email reports** and choose Off, Weekly, or Monthly. Off is the default. Reports go to the user's authenticated account email.
5. Browser alarm popups require the user to allow notifications for the site. With the app open, a fired alarm triggers a popup from the live alarm event. With the app closed, the existing notification cron and Web Push setup must be running for background delivery.

Reports and energy alerts show estimates from recorded relay activity. The website does not claim to have measured power without a power meter. High-energy and idle-device notifications are now limited to devices whose board has checked in within the last two minutes.
