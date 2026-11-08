-- Install in the application schema after 018 (CURRENT_SCHEMA = owner).
-- Read-only metric catalog for the application: name, formula and unit of every
-- formula version, so the UI can explain a metric and build the screening form
-- without access to metric_definitions/metric_dependencies.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
CREATE OR REPLACE VIEW v_metric_catalog AS
SELECT m.metric_id, m.metric_code, m.formula_version, m.metric_name, m.formula_text,
  m.display_unit, m.decimal_places,
  (SELECT COUNT(*) FROM metric_dependencies d WHERE d.metric_id = m.metric_id) input_count,
  CASE WHEN EXISTS (SELECT 1 FROM metric_dependencies d WHERE d.metric_id = m.metric_id AND d.year_offset = -1)
       THEN 1 ELSE 0 END requires_previous
FROM metric_definitions m
WITH READ ONLY;
