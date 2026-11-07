-- Upgrade only calculation guards on an existing application schema.
-- Fresh schemas receive the same definitions through 002_integrity_guards.sql.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

CREATE OR REPLACE TRIGGER trg_calculation_guard
BEFORE INSERT OR UPDATE OR DELETE ON calculation_runs
FOR EACH ROW
DECLARE
  c_company NUMBER; c_year NUMBER; c_scope VARCHAR2(16); c_state VARCHAR2(8);
  p_company NUMBER; p_year NUMBER; p_scope VARCHAR2(16); p_state VARCHAR2(8);
  v_count NUMBER; v_expected NUMBER;
BEGIN
  IF DELETING THEN
    IF :old.run_status IN ('COMPLETED','FAILED') THEN raise_application_error(-20020,'Finished calculation is immutable'); END IF;
    RETURN;
  END IF;
  IF INSERTING AND :new.run_status<>'CREATED' THEN raise_application_error(-20039,'New run must start CREATED'); END IF;
  IF UPDATING AND :old.run_status IN ('COMPLETED','FAILED') THEN raise_application_error(-20020,'Finished calculation is immutable'); END IF;
  IF UPDATING AND (:new.run_key<>:old.run_key OR :new.report_set_id<>:old.report_set_id OR NVL(:new.previous_set_id,-1)<>NVL(:old.previous_set_id,-1) OR :new.engine_version<>:old.engine_version) THEN
    raise_application_error(-20021,'Calculation snapshot/engine references are immutable');
  END IF;
  SELECT company_id,fiscal_year,scope_code,set_state INTO c_company,c_year,c_scope,c_state FROM report_sets WHERE report_set_id=:new.report_set_id;
  IF c_state<>'FROZEN' THEN raise_application_error(-20022,'Calculation requires frozen current snapshot'); END IF;
  IF :new.previous_set_id IS NOT NULL THEN
    SELECT company_id,fiscal_year,scope_code,set_state INTO p_company,p_year,p_scope,p_state FROM report_sets WHERE report_set_id=:new.previous_set_id;
    IF p_state<>'FROZEN' OR p_company<>c_company OR p_year<>c_year-1 OR p_scope<>c_scope THEN
      raise_application_error(-20023,'Previous snapshot must be same company/scope, exactly t-1, FROZEN');
    END IF;
  END IF;
  IF UPDATING AND :new.run_status='COMPLETED' THEN
    IF :new.engine_version='metric-engine/1.0.0' THEN
      SELECT COUNT(*) INTO v_count FROM metric_results WHERE run_id=:new.run_id;
      SELECT COUNT(*) INTO v_expected FROM metric_results r JOIN metric_definitions m ON m.metric_id=r.metric_id
       WHERE r.run_id=:new.run_id AND m.formula_version='1.0.0' AND m.metric_code IN
         ('REVENUE_GROWTH','GROSS_MARGIN','NET_MARGIN','ROA','ROE','LIABILITIES_ASSETS','CURRENT_RATIO','CFO_AVG_ASSETS');
      IF v_count<>8 OR v_expected<>8 THEN raise_application_error(-20044,'Metric engine requires exactly eight supported results'); END IF;
    END IF;
    SELECT COUNT(*) INTO v_count FROM metric_results WHERE run_id=:new.run_id;
    IF v_count=0 THEN raise_application_error(-20040,'Cannot complete empty calculation'); END IF;
    FOR r IN (SELECT result_id,metric_id FROM metric_results WHERE run_id=:new.run_id
              AND result_status IN ('VALID','CALCULATED_PROVISIONAL')) LOOP
      SELECT COUNT(*) INTO v_expected FROM metric_dependencies WHERE metric_id=r.metric_id;
      SELECT COUNT(*) INTO v_count FROM metric_input_facts WHERE result_id=r.result_id;
      IF v_expected=0 OR v_count<>v_expected THEN raise_application_error(-20041,'Calculated result must have complete input lineage'); END IF;
    END LOOP;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_metric_result_guard
BEFORE INSERT OR UPDATE OR DELETE ON metric_results
FOR EACH ROW
DECLARE v_run_status VARCHAR2(12); v_acceptance VARCHAR2(12); v_run_id NUMBER; v_count NUMBER; v_prev_acceptance VARCHAR2(12);
BEGIN
  v_run_id:=CASE WHEN DELETING THEN :old.run_id ELSE :new.run_id END;
  SELECT c.run_status,s.acceptance_status INTO v_run_status,v_acceptance FROM calculation_runs c
   JOIN report_sets s ON s.report_set_id=c.report_set_id
   WHERE c.run_id=v_run_id FOR UPDATE OF c.run_status;
  IF v_run_status IN ('COMPLETED','FAILED') THEN raise_application_error(-20032,'Finished results are immutable'); END IF;
  IF UPDATING AND (:new.run_id<>:old.run_id OR :new.metric_id<>:old.metric_id) THEN raise_application_error(-20033,'Result identity is immutable'); END IF;
  IF NOT DELETING AND :new.result_status='VALID' AND v_acceptance<>'VERIFIED' THEN
    raise_application_error(-20034,'VALID result requires VERIFIED snapshot');
  END IF;
  IF NOT DELETING AND :new.result_status='VALID' THEN
    SELECT COUNT(*) INTO v_count FROM metric_dependencies WHERE metric_id=:new.metric_id AND year_offset=-1;
    IF v_count>0 THEN
      SELECT p.acceptance_status INTO v_prev_acceptance FROM calculation_runs c
       JOIN report_sets p ON p.report_set_id=c.previous_set_id WHERE c.run_id=v_run_id;
      IF v_prev_acceptance<>'VERIFIED' THEN raise_application_error(-20042,'VALID result requires verified previous snapshot'); END IF;
    END IF;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_metric_input_guard
BEFORE INSERT OR UPDATE OR DELETE ON metric_input_facts
FOR EACH ROW
DECLARE
  v_metric NUMBER; v_current NUMBER; v_previous NUMBER; v_status VARCHAR2(12);
  v_item NUMBER; v_offset NUMBER; v_selected_set NUMBER; v_selected_item NUMBER; v_result_id NUMBER;
BEGIN
  IF UPDATING THEN raise_application_error(-20024,'Replace draft metric input with DELETE then INSERT'); END IF;
  v_result_id:=CASE WHEN DELETING THEN :old.result_id ELSE :new.result_id END;
  SELECT r.metric_id,c.report_set_id,c.previous_set_id,c.run_status INTO v_metric,v_current,v_previous,v_status
   FROM metric_results r JOIN calculation_runs c ON c.run_id=r.run_id
   WHERE r.result_id=v_result_id FOR UPDATE OF c.run_status;
  IF v_status IN ('COMPLETED','FAILED') THEN raise_application_error(-20025,'Finished metric inputs are immutable'); END IF;
  IF INSERTING THEN
    SELECT item_id,year_offset INTO v_item,v_offset FROM metric_dependencies WHERE metric_id=v_metric AND input_position=:new.input_position;
    SELECT report_set_id,item_id INTO v_selected_set,v_selected_item FROM report_set_facts WHERE selection_fact_id=:new.selection_fact_id;
    IF v_item<>v_selected_item OR (v_offset=0 AND v_selected_set<>v_current) OR
      (v_offset=-1 AND (v_previous IS NULL OR v_selected_set<>v_previous)) THEN
      raise_application_error(-20026,'Metric input does not match item/year snapshot dependency');
    END IF;
  END IF;
END;
/
