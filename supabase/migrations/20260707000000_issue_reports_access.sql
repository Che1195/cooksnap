-- Restrict the shared issue-reports inbox to an explicit household allowlist.
-- Signup is open to the public, so "any authenticated user" is not a household
-- boundary: without this, any stranger who registers could read every report
-- (including reporter emails and page URLs) and edit any report's contents.

create table if not exists issue_report_members (
  user_id uuid primary key references profiles(id) on delete cascade,
  added_at timestamptz default now() not null
);

alter table issue_report_members enable row level security;

-- Users may check their own membership row; this is required for the policy
-- subqueries below to see it under RLS. Membership itself is managed via the
-- Supabase dashboard / service role only — there is no insert/update policy.
create policy "Users can view own inbox membership"
  on issue_report_members for select
  using (auth.uid() = user_id);

-- Seed the household. To add another member, run the same insert with their
-- email (or insert their profile id directly from the dashboard).
insert into issue_report_members (user_id)
select id from auth.users where email = 'abeche88@gmail.com'
on conflict (user_id) do nothing;

drop policy "Authenticated users can view shared issue reports" on issue_reports;
drop policy "Authenticated users can update issue report status" on issue_reports;
drop policy "Authenticated users can create issue reports" on issue_reports;

-- Inbox members see everything; reporters can still see their own submissions.
create policy "Members and reporters can view issue reports"
  on issue_reports for select
  using (
    auth.uid() = reporter_id
    or exists (select 1 from issue_report_members m where m.user_id = auth.uid())
  );

-- Only inbox members can update reports (status triage).
create policy "Members can update issue reports"
  on issue_reports for update
  using (exists (select 1 from issue_report_members m where m.user_id = auth.uid()))
  with check (exists (select 1 from issue_report_members m where m.user_id = auth.uid()));

-- Reporter identity must be the authenticated user, and the stored email must
-- match the JWT email — a tampered client cannot attribute reports to others.
create policy "Users can create own issue reports"
  on issue_reports for insert
  with check (
    auth.uid() = reporter_id
    and (reporter_email is null or reporter_email = (auth.jwt() ->> 'email'))
  );

-- page_url was the only free-text column with no length bound.
alter table issue_reports
  add constraint issue_reports_page_url_length
  check (page_url is null or char_length(page_url) <= 2000);
