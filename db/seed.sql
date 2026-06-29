-- Seed the demo shop's services. Idempotent: only inserts when the table is
-- empty, so re-running is safe. Durations are intentionally varied (30 / 45 / 60
-- / 120 min) to exercise the mixed-duration handling the exclusion constraint
-- gives us for free.
INSERT INTO services (name, duration_minutes, sort_order)
SELECT * FROM (VALUES
  ('Oil Change & Multi-Point Inspection', 45, 1),
  ('Check-Engine Diagnostic',             60, 2),
  ('Brake Service (per axle)',           120, 3),
  ('State Safety Inspection',             30, 4)
) AS v(name, duration_minutes, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM services);
