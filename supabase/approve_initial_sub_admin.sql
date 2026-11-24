-- Run only after admin_staff_support.sql in the VikaTech application project.
-- This explicitly marks the previously denied staff account approved without
-- inventing two human approvals. Staff access is checked through admin_staff.
begin;

update public.account_approval_requests
set account_status = 'approved',
    rejection_reason = null,
    updated_at = now()
where lower(trim(email)) = 'akschayra@gmail.com'
  and exists (select 1 from public.admin_staff s
              where s.email = 'akschayra@gmail.com' and s.active = true);

insert into public.approval_audit_log (user_id, actor_email, action, metadata)
select user_id, 'system@vikatech.local', 'staff_onboarding_override',
       jsonb_build_object('role', 'sub_admin', 'reason', 'Initial staff onboarding')
from public.account_approval_requests
where lower(trim(email)) = 'akschayra@gmail.com'
  and account_status = 'approved'
  and not exists (
    select 1 from public.approval_audit_log a
    where a.user_id = account_approval_requests.user_id
      and a.action = 'staff_onboarding_override'
  );

update public.order_trackings
set approval_status = 'approved', rejection_reason = null
where user_id in (
  select user_id from public.account_approval_requests
  where lower(trim(email)) = 'akschayra@gmail.com' and account_status = 'approved'
);

commit;

select email, account_status, rejection_reason
from public.account_approval_requests
where lower(trim(email)) = 'akschayra@gmail.com';
