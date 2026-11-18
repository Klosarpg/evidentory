-- Evidentory: Njegošev dan (13. i 14. novembar, državni praznik od 2023.)
-- Pokreni jednom u Supabase dashboardu: SQL Editor → New query → zalijepi → Run.
-- Ako drugi dan padne u nedjelju, neradan je i prvi naredni dan.
insert into public.praznici (datum, naziv) values
  ('2026-11-13', 'Njegošev dan'),
  ('2026-11-14', 'Njegošev dan'),
  ('2027-11-13', 'Njegošev dan'),
  ('2027-11-14', 'Njegošev dan'),
  ('2027-11-15', 'Njegošev dan (neradni dan)'),
  ('2028-11-13', 'Njegošev dan'),
  ('2028-11-14', 'Njegošev dan'),
  ('2029-11-13', 'Njegošev dan'),
  ('2029-11-14', 'Njegošev dan'),
  ('2030-11-13', 'Njegošev dan'),
  ('2030-11-14', 'Njegošev dan')
on conflict (datum) do nothing;
