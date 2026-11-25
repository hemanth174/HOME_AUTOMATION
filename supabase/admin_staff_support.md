# Admin roles and support setup

Run the following in the **VikaTech application Supabase project** SQL Editor, with the entire file selected each time:

1. `supabase/admin_staff_support.sql` creates the limited-role staff table, audit table, and ticket tables. It seeds `peacefulguy2005@gmail.com` and `akschayra@gmail.com` as active sub admins.
2. `supabase/support_ticket_lifecycle.sql` adds recoverable ticket deletion and short-lived typing presence. Run this for an existing installation too, even when the first file was run earlier.
3. `supabase/approve_initial_sub_admin.sql` changes the existing denied approval request for `akschayra@gmail.com` to `approved`, records an explicit staff onboarding override, and prints the account status. It does not forge two human approvals. If the final query returns no row, that account has no approval request yet; sign up with that exact email first, then run this file again.
4. Run `supabase/admin_feature_permissions.sql` in the same application project. It adds per-feature permissions and access requests. Run this **before deploying** the new website code.
5. Deploy the website changes. The existing `SUPABASE_SERVICE_ROLE_KEY` server environment variable is required. No new environment variables are needed.
6. Sign out and back in as each sub admin. The account email must be confirmed. Open Admin team to view assigned access and request a feature. Main admins can grant or revoke features there. Refresh the admin page after a change to update the visible tabs.
7. Verify that an ungranted admin API returns 403 for a sub admin, and that granting its feature allows the corresponding tab and route. Test disabling and re-enabling a sub admin. Both main admins retain full access.

| Capability | Main admin | Sub admin by default |
| --- | --- | --- |
| Support tickets: view, reply, claim, change status | Yes | Yes |
| Create an issue in the admin support queue | Yes | No |
| Order summaries: customer, category, stage | Yes | Read only |
| Change orders and account approvals | Yes | No |
| Hardware provisioning and controls | Yes | No |
| MQTT controls and logs | Yes | No |
| Monitoring and voice-plan settings | Yes | No |
| Admin team and feature requests | Full control | Own access and requests |
| Manage staff access | Yes | No; cannot be delegated |

Main admins remain the two emails in `src/lib/adminEmails.js`. Staff access is checked on every request against `admin_staff`. A main admin can grant each listed feature to a sub admin; dependent features (support ticket creation/deletion and order management) also enable their parent feature. Disabling a sub admin removes their admin API access immediately; they can still use their regular customer account if separately approved.

Support tickets use `support_tickets` and `support_ticket_messages`. Only the server's service-role client reads these tables. Customers can open and reply to their own tickets; staff with Support queue access can handle the queue. Main admins, or sub admins granted the corresponding features, can open issues, move tickets to Deleted tickets, and restore them for 30 days. The daily cleanup permanently removes expired tickets. The typing indicator stores only a role and a seven-second expiry, never draft text. The ticket list refreshes every 30 seconds while open.
