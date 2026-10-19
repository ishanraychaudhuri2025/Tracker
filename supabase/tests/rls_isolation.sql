-- Production-safe Phase 3 isolation test for Supabase SQL Editor.
-- Run as the database owner. It uses the first existing workspace only as a
-- test fixture and ROLLBACKs at the end. No production workspace is changed.
begin;

select set_config(
  'cadence.audit.owner_id',
  (select user_id::text from public.tracker_workspaces order by created_at limit 1),
  true
);
select set_config('cadence.audit.foreign_id', '00000000-0000-4000-8000-000000000001', true);

do $fixture$
begin
  if current_setting('cadence.audit.owner_id', true) is null then
    raise exception 'RLS audit requires at least one tracker workspace fixture.';
  end if;
  if current_setting('cadence.audit.owner_id') = current_setting('cadence.audit.foreign_id') then
    raise exception 'Choose a different synthetic foreign UUID for the audit fixture.';
  end if;
  if exists (
    select 1 from public.tracker_workspaces
    where user_id = current_setting('cadence.audit.foreign_id')::uuid
  ) then
    raise exception 'Synthetic foreign UUID unexpectedly belongs to an existing workspace.';
  end if;
end
$fixture$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('cadence.audit.owner_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('cadence.audit.owner_id'), 'role', 'authenticated')::text,
  true
);

do $rls_tests$
declare
  owner_id uuid := current_setting('cadence.audit.owner_id')::uuid;
  foreign_id uuid := current_setting('cadence.audit.foreign_id')::uuid;
  visible_rows bigint;
  changed_rows bigint;
begin
  select count(*) into visible_rows
  from public.tracker_workspaces
  where user_id = owner_id;
  if visible_rows <> 1 then
    raise exception 'FAIL: workspace owner cannot read exactly their own workspace.';
  end if;

  perform set_config('request.jwt.claim.sub', foreign_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', foreign_id, 'role', 'authenticated')::text,
    true
  );
  select count(*) into visible_rows from public.tracker_workspaces;
  if visible_rows <> 0 then
    raise exception 'FAIL: foreign account can read another account workspace.';
  end if;

  update public.tracker_workspaces
    set focus_sessions = focus_sessions + 1
    where user_id = owner_id;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then
    raise exception 'FAIL: foreign account changed another account workspace.';
  end if;

  begin
    insert into public.tracker_workspaces (user_id)
    values (owner_id);
    raise exception 'FAIL: cross-account insert unexpectedly succeeded.';
  exception
    when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text,
    true
  );
  begin
    update public.tracker_workspaces
      set user_id = foreign_id
      where user_id = owner_id;
    raise exception 'FAIL: owner reassigned workspace ownership.';
  exception
    when insufficient_privilege then null;
  end;

  select count(*) into visible_rows
  from public.tracker_workspaces
  where user_id = owner_id;
  if visible_rows <> 1 then
    raise exception 'FAIL: the owner workspace changed during negative tests.';
  end if;
end
$rls_tests$;

reset role;
rollback;
select 'PASS: account isolation read/write/insert/ownership-transfer checks completed; transaction rolled back.' as result;
