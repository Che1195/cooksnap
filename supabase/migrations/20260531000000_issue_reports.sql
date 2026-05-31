-- Shared issue reports for CookSnap user feedback.
-- Any signed-in user can submit and view reports so Che and his girlfriend
-- share one lightweight triage inbox inside the app.

create table if not exists issue_reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references profiles(id) on delete set null,
  reporter_email text,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 120),
  description text not null check (char_length(trim(description)) > 0 and char_length(description) <= 2000),
  steps text check (steps is null or char_length(steps) <= 2000),
  expected text check (expected is null or char_length(expected) <= 1000),
  actual text check (actual is null or char_length(actual) <= 1000),
  page_url text,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_issue_reports_created_at on issue_reports(created_at desc);
create index if not exists idx_issue_reports_status on issue_reports(status);

alter table issue_reports enable row level security;

create policy "Authenticated users can view shared issue reports"
  on issue_reports for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can create issue reports"
  on issue_reports for insert
  with check (auth.uid() = reporter_id);

create policy "Authenticated users can update issue report status"
  on issue_reports for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create trigger set_updated_at_issue_reports
  before update on issue_reports
  for each row execute function public.update_updated_at();
