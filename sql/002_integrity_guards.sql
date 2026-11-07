-- Cross-table integrity and immutable snapshots. Ingestion packages will be
-- the only future ETL write path. Triggers retain safeguards in the schema.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

CREATE OR REPLACE TRIGGER trg_reports_immutable
BEFORE UPDATE OR DELETE ON financial_reports
BEGIN
  raise_application_error(-20001,'Report versions are immutable; append report_version');
END;
/
CREATE OR REPLACE TRIGGER trg_facts_immutable
BEFORE UPDATE OR DELETE ON financial_facts
BEGIN
  raise_application_error(-20002,'Facts are immutable; append a report version or correction');
END;
/
CREATE OR REPLACE TRIGGER trg_corrections_immutable
BEFORE UPDATE OR DELETE ON fact_corrections
BEGIN
  raise_application_error(-20003,'Correction records are immutable; append a reviewed successor');
END;
/

CREATE OR REPLACE TRIGGER trg_members_guard
BEFORE INSERT OR UPDATE OR DELETE ON report_set_members
FOR EACH ROW
DECLARE
  v_state report_sets.set_state%TYPE;
  v_company NUMBER; v_year NUMBER; v_scope VARCHAR2(16);
  r_company NUMBER; r_year NUMBER; r_scope VARCHAR2(16);
  v_set_id NUMBER;
BEGIN
  IF UPDATING THEN
    raise_application_error(-20004,'Replace draft member with DELETE then INSERT');
  END IF;
  v_set_id:=CASE WHEN DELETING THEN :old.report_set_id ELSE :new.report_set_id END;
  SELECT set_state,company_id,fiscal_year,scope_code INTO v_state,v_company,v_year,v_scope
    FROM report_sets WHERE report_set_id=v_set_id FOR UPDATE;
  IF v_state <> 'DRAFT' THEN raise_application_error(-20005,'Frozen snapshot members cannot change'); END IF;
  IF INSERTING THEN
    SELECT company_id,fiscal_year,scope_code INTO r_company,r_year,r_scope
      FROM financial_reports WHERE report_id=:new.report_id;
    IF v_company<>r_company OR v_year<>r_year OR v_scope<>r_scope THEN
      raise_application_error(-20006,'Member company/year/scope differs from snapshot');
    END IF;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_selection_fact_guard
BEFORE INSERT OR UPDATE OR DELETE ON report_set_facts
FOR EACH ROW
DECLARE
  v_state VARCHAR2(8); v_quality VARCHAR2(12); v_meta VARCHAR2(12);
  v_value NUMBER; v_corr_status VARCHAR2(16); v_set_id NUMBER;
BEGIN
  IF UPDATING THEN raise_application_error(-20007,'Replace draft selected fact with DELETE then INSERT'); END IF;
  v_set_id:=CASE WHEN DELETING THEN :old.report_set_id ELSE :new.report_set_id END;
  SELECT set_state INTO v_state FROM report_sets
   WHERE report_set_id=v_set_id FOR UPDATE;
  IF v_state <> 'DRAFT' THEN raise_application_error(-20008,'Frozen selected facts cannot change'); END IF;
  IF INSERTING AND :new.selected_quality='VERIFIED' THEN
    SELECT f.quality_status,r.metadata_status,f.value_vnd INTO v_quality,v_meta,v_value
      FROM financial_facts f JOIN financial_reports r ON r.report_id=f.report_id WHERE f.fact_id=:new.fact_id;
    IF :new.correction_id IS NOT NULL THEN
      SELECT review_status,new_value_vnd INTO v_corr_status,v_value FROM fact_corrections
       WHERE correction_id=:new.correction_id AND fact_id=:new.fact_id;
      IF v_corr_status <> 'APPROVED' THEN raise_application_error(-20009,'Only APPROVED correction may be selected VERIFIED'); END IF;
    ELSIF v_quality <> 'VERIFIED' THEN
      raise_application_error(-20010,'Unverified source fact cannot be selected VERIFIED');
    END IF;
    IF v_meta<>'VERIFIED' OR v_value IS NULL THEN raise_application_error(-20011,'Verified selection requires verified metadata and VND'); END IF;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_set_freeze_guard
BEFORE INSERT OR UPDATE OR DELETE ON report_sets
FOR EACH ROW
DECLARE v_count NUMBER;
BEGIN
  IF INSERTING THEN
    IF :new.set_state<>'DRAFT' OR :new.acceptance_status<>'PENDING' THEN raise_application_error(-20031,'New snapshot must start DRAFT/PENDING'); END IF;
    RETURN;
  END IF;
  IF :old.set_state='FROZEN' THEN raise_application_error(-20012,'Frozen report set is immutable'); END IF;
  IF UPDATING AND (:new.company_id<>:old.company_id OR :new.fiscal_year<>:old.fiscal_year OR :new.scope_code<>:old.scope_code) THEN
    raise_application_error(-20013,'Snapshot identity cannot change');
  END IF;
  IF UPDATING AND :new.set_state='FROZEN' THEN
    SELECT COUNT(*) INTO v_count FROM report_set_members WHERE report_set_id=:old.report_set_id;
    IF v_count<>3 THEN raise_application_error(-20014,'Freeze requires BS, IS and CF'); END IF;
    SELECT COUNT(*) INTO v_count FROM report_set_facts WHERE report_set_id=:old.report_set_id;
    IF v_count=0 THEN raise_application_error(-20015,'Freeze requires selected facts'); END IF;
    IF :new.acceptance_status='VERIFIED' THEN
      SELECT COUNT(*) INTO v_count FROM report_set_members m JOIN financial_reports r ON r.report_id=m.report_id
       WHERE m.report_set_id=:old.report_set_id AND r.metadata_status<>'VERIFIED';
      IF v_count>0 THEN raise_application_error(-20038,'All three reports require verified metadata'); END IF;
      SELECT COUNT(*) INTO v_count FROM report_set_facts WHERE report_set_id=:old.report_set_id AND selected_quality<>'VERIFIED';
      IF v_count>0 OR :new.scope_code='UNKNOWN' THEN raise_application_error(-20016,'VERIFIED snapshot has unverified facts or scope'); END IF;
    END IF;
  ELSIF UPDATING AND :new.acceptance_status='VERIFIED' THEN
    raise_application_error(-20017,'Acceptance can be VERIFIED only while freezing');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_head_guard
BEFORE INSERT OR UPDATE ON report_heads
FOR EACH ROW
DECLARE v_state VARCHAR2(8);
BEGIN
  SELECT set_state INTO v_state FROM report_sets WHERE report_set_id=:new.report_set_id;
  IF v_state<>'FROZEN' THEN raise_application_error(-20018,'Current head must reference FROZEN snapshot'); END IF;
  IF UPDATING AND :new.lock_version<>:old.lock_version+1 THEN
    raise_application_error(-20019,'Head update must increment lock_version by one');
  END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_head_history
AFTER INSERT OR UPDATE OR DELETE ON report_heads
FOR EACH ROW
DECLARE v_action VARCHAR2(10);
BEGIN
  v_action := CASE WHEN INSERTING THEN 'INSERT' WHEN UPDATING THEN 'UPDATE' ELSE 'DELETE' END;
  INSERT INTO business_change_log(entity_name,entity_key,action_code,old_data,new_data,actor_name)
  VALUES('REPORT_HEADS',TO_CHAR(COALESCE(:new.company_id,:old.company_id))||':'||
    TO_CHAR(COALESCE(:new.fiscal_year,:old.fiscal_year))||':'||COALESCE(:new.scope_code,:old.scope_code),
    v_action,TO_CHAR(:old.report_set_id),TO_CHAR(:new.report_set_id),SYS_CONTEXT('USERENV','SESSION_USER'));
END;
/

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

CREATE OR REPLACE TRIGGER trg_artifact_immutable
BEFORE UPDATE OR DELETE ON source_artifacts
BEGIN raise_application_error(-20035,'Source artifacts are immutable'); END;
/
CREATE OR REPLACE TRIGGER trg_formula_immutable
BEFORE UPDATE OR DELETE ON metric_definitions
BEGIN raise_application_error(-20036,'Append a formula version instead of changing it'); END;
/
CREATE OR REPLACE TRIGGER trg_dependency_immutable
BEFORE INSERT OR UPDATE OR DELETE ON metric_dependencies
FOR EACH ROW
DECLARE v_count NUMBER;
BEGIN
  IF UPDATING OR DELETING THEN raise_application_error(-20037,'Append a formula version instead of changing dependencies'); END IF;
  SELECT COUNT(*) INTO v_count FROM metric_results WHERE metric_id=:new.metric_id;
  IF v_count>0 THEN raise_application_error(-20043,'Cannot add dependencies after a formula has results'); END IF;
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

CREATE OR REPLACE PACKAGE pkg_metric_math AUTHID DEFINER AS
  PROCEDURE calculate(p_code VARCHAR2,p_numerator NUMBER,p_den1 NUMBER,p_den2 NUMBER,
                      p_blocked NUMBER,p_value OUT NUMBER,p_status OUT VARCHAR2);
END;
/
CREATE OR REPLACE PACKAGE BODY pkg_metric_math AS
  PROCEDURE calculate(p_code VARCHAR2,p_numerator NUMBER,p_den1 NUMBER,p_den2 NUMBER,
                      p_blocked NUMBER,p_value OUT NUMBER,p_status OUT VARCHAR2) IS
    v_den NUMBER;
  BEGIN
    p_value:=NULL;
    IF p_code NOT IN ('REVENUE_GROWTH','GROSS_MARGIN','NET_MARGIN','ROA','ROE','LIABILITIES_ASSETS','CURRENT_RATIO','CFO_AVG_ASSETS') OR p_code IS NULL THEN
      raise_application_error(-20030,'Unknown metric code');
    END IF;
    IF p_blocked=1 THEN p_status:='BLOCKED_INPUT_QUALITY'; RETURN; END IF;
    IF p_numerator IS NULL OR p_den1 IS NULL OR (p_code IN ('ROA','ROE','CFO_AVG_ASSETS') AND p_den2 IS NULL) THEN
      p_status:='MISSING_INPUT'; RETURN;
    END IF;
    IF p_den1<=0 OR (p_code IN ('ROA','ROE','CFO_AVG_ASSETS') AND p_den2<=0) THEN
      p_status:='INVALID_DENOMINATOR'; RETURN;
    END IF;
    IF p_code IN ('CURRENT_RATIO','LIABILITIES_ASSETS') AND p_numerator<0 THEN p_status:='BLOCKED_INPUT_QUALITY'; RETURN; END IF;
    v_den:=CASE WHEN p_code IN ('ROA','ROE','CFO_AVG_ASSETS') THEN (p_den1+p_den2)/2 ELSE p_den1 END;
    p_value:=ROUND(p_numerator/v_den-CASE WHEN p_code='REVENUE_GROWTH' THEN 1 ELSE 0 END,12);
    p_status:='CALCULATED_PROVISIONAL';
  END;
END;
/
