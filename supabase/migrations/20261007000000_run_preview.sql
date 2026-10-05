-- Agent Mission Control: landing-page preview digest, built lazily from the event log.
alter table public.runs add column if not exists preview jsonb;
