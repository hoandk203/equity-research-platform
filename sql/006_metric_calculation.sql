-- Fixed, versioned eight-metric catalog and snapshot calculation coordinator.
-- Catalog setup is caller-owned; calculation APIs own autonomous transactions.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

CREATE OR REPLACE PACKAGE pkg_metric_calculation AUTHID DEFINER AS
  PROCEDURE install_catalog;
  PROCEDURE calculate_snapshot(p_run_key VARCHAR2,p_report_set_id NUMBER,
    p_previous_set_id NUMBER,p_run_id OUT NUMBER);
  PROCEDURE calculate_current(p_run_key VARCHAR2,p_company_id NUMBER,p_year NUMBER,
    p_scope VARCHAR2,p_run_id OUT NUMBER);
END;
/

CREATE OR REPLACE PACKAGE BODY pkg_metric_calculation AS
  c_engine CONSTANT VARCHAR2(40):='metric-engine/1.0.0';
  c_formula CONSTANT VARCHAR2(20):='1.0.0';
  TYPE definitions IS TABLE OF VARCHAR2(200) INDEX BY PLS_INTEGER;
  codes definitions; names definitions; texts definitions;

  PROCEDURE initialize IS
  BEGIN
    codes(1):='REVENUE_GROWTH';names(1):='Tăng trưởng doanh thu';texts(1):='R[t]/R[t-1]-1';
    codes(2):='GROSS_MARGIN';names(2):='Biên lợi nhuận gộp';texts(2):='GP[t]/R[t]';
    codes(3):='NET_MARGIN';names(3):='Biên lợi nhuận ròng';texts(3):='NI[t]/R[t]';
    codes(4):='ROA';names(4):='Sinh lời trên tài sản bình quân';texts(4):='NI[t]/((A[t-1]+A[t])/2)';
    codes(5):='ROE';names(5):='Sinh lời trên tổng vốn chủ sở hữu bình quân';texts(5):='NI[t]/((E[t-1]+E[t])/2)';
    codes(6):='LIABILITIES_ASSETS';names(6):='Nợ phải trả trên tổng tài sản';texts(6):='L[t]/A[t]';
    codes(7):='CURRENT_RATIO';names(7):='Khả năng thanh toán hiện hành';texts(7):='CA[t]/CL[t]';
    codes(8):='CFO_AVG_ASSETS';names(8):='Dòng tiền hoạt động trên tài sản bình quân';texts(8):='CFO[t]/((A[t-1]+A[t])/2)';
  END;

  PROCEDURE dependency(p_metric NUMBER,p_position NUMBER,p_code VARCHAR2,p_offset NUMBER,p_install BOOLEAN) IS
    v_item NUMBER;v_actual NUMBER;v_offset NUMBER;
  BEGIN
    SELECT item_id INTO v_item FROM financial_items WHERE item_code=p_code;
    BEGIN
      SELECT item_id,year_offset INTO v_actual,v_offset FROM metric_dependencies
       WHERE metric_id=p_metric AND input_position=p_position;
      IF v_actual<>v_item OR v_offset<>p_offset THEN
        raise_application_error(-20201,'Catalog dependency conflict: '||p_code);
      END IF;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      IF NOT p_install THEN raise_application_error(-20201,'Missing catalog dependency: '||p_code); END IF;
      INSERT INTO metric_dependencies VALUES(p_metric,p_position,v_item,p_offset);
    END;
  END;

  PROCEDURE catalog(p_install BOOLEAN) IS
    v_id NUMBER;v_name VARCHAR2(200);v_text VARCHAR2(1000);v_unit VARCHAR2(10);v_places NUMBER;v_count NUMBER;
  BEGIN
    initialize;
    -- Prevent catalog writers changing dependencies during a calculation.
    IF p_install THEN
      LOCK TABLE metric_definitions IN EXCLUSIVE MODE NOWAIT;
      LOCK TABLE metric_dependencies IN EXCLUSIVE MODE NOWAIT;
    ELSE
      LOCK TABLE metric_definitions IN SHARE MODE NOWAIT;
      LOCK TABLE metric_dependencies IN SHARE MODE NOWAIT;
    END IF;
    FOR idx IN 1..8 LOOP
      v_unit:=CASE WHEN codes(idx)='CURRENT_RATIO' THEN 'TIMES' ELSE 'PERCENT' END;
      BEGIN
        SELECT metric_id,metric_name,formula_text,display_unit,decimal_places INTO v_id,v_name,v_text,v_unit,v_places
         FROM metric_definitions WHERE metric_code=codes(idx) AND formula_version=c_formula;
        IF v_name<>names(idx) OR v_text<>texts(idx) OR v_places<>12 OR
           v_unit<>CASE WHEN codes(idx)='CURRENT_RATIO' THEN 'TIMES' ELSE 'PERCENT' END THEN
          raise_application_error(-20201,'Catalog definition conflict: '||codes(idx));
        END IF;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        IF NOT p_install THEN raise_application_error(-20201,'Catalog is not installed: '||codes(idx)); END IF;
        INSERT INTO metric_definitions(metric_code,formula_version,metric_name,formula_text,display_unit)
         VALUES(codes(idx),c_formula,names(idx),texts(idx),v_unit) RETURNING metric_id INTO v_id;
      END;
      CASE codes(idx)
        WHEN 'REVENUE_GROWTH' THEN
          dependency(v_id,0,'revenue',0,p_install);dependency(v_id,1,'revenue',-1,p_install);
        WHEN 'GROSS_MARGIN' THEN
          dependency(v_id,0,'gross_profit',0,p_install);dependency(v_id,1,'revenue',0,p_install);
        WHEN 'NET_MARGIN' THEN
          dependency(v_id,0,'net_income',0,p_install);dependency(v_id,1,'revenue',0,p_install);
        WHEN 'ROA' THEN
          dependency(v_id,0,'net_income',0,p_install);dependency(v_id,1,'assets',-1,p_install);dependency(v_id,2,'assets',0,p_install);
        WHEN 'ROE' THEN
          dependency(v_id,0,'net_income',0,p_install);dependency(v_id,1,'equity',-1,p_install);dependency(v_id,2,'equity',0,p_install);
        WHEN 'LIABILITIES_ASSETS' THEN
          dependency(v_id,0,'liabilities',0,p_install);dependency(v_id,1,'assets',0,p_install);
        WHEN 'CURRENT_RATIO' THEN
          dependency(v_id,0,'current_assets',0,p_install);dependency(v_id,1,'current_liabilities',0,p_install);
        WHEN 'CFO_AVG_ASSETS' THEN
          dependency(v_id,0,'cfo',0,p_install);dependency(v_id,1,'assets',-1,p_install);dependency(v_id,2,'assets',0,p_install);
      END CASE;
      SELECT COUNT(*) INTO v_count FROM metric_dependencies WHERE metric_id=v_id;
      IF v_count<>CASE WHEN codes(idx) IN ('ROA','ROE','CFO_AVG_ASSETS') THEN 3 ELSE 2 END THEN
        raise_application_error(-20201,'Unexpected extra dependencies: '||codes(idx));
      END IF;
    END LOOP;
  END;

  PROCEDURE install_catalog IS
  BEGIN
    SAVEPOINT catalog_setup;
    catalog(TRUE);
  EXCEPTION WHEN OTHERS THEN ROLLBACK TO catalog_setup;RAISE;
  END;

  PROCEDURE perform(p_key VARCHAR2,p_current NUMBER,p_previous NUMBER,p_run OUT NUMBER) IS
    v_current report_sets%ROWTYPE;v_previous report_sets%ROWTYPE;v_old calculation_runs%ROWTYPE;
    v_set NUMBER;v_selection NUMBER;v_quality VARCHAR2(12);v_raw_quality VARCHAR2(12);v_correction NUMBER;
    v_corr_status VARCHAR2(16);v_meta VARCHAR2(12);v_currency VARCHAR2(7);v_unit VARCHAR2(20);v_multiplier NUMBER;
    v_start DATE;v_end DATE;v_year NUMBER;v_acceptance VARCHAR2(12);v_amount NUMBER;v_issue NUMBER;
    v_result NUMBER;v_blocked NUMBER;v_verified BOOLEAN;v_missing BOOLEAN;v_status VARCHAR2(28);v_value NUMBER;
    v_reason VARCHAR2(1000);v_error VARCHAR2(1900);v_count NUMBER;v_created BOOLEAN:=FALSE;
    TYPE numbers IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
    amounts numbers;selections numbers;
    PROCEDURE reason(p_text VARCHAR2) IS
    BEGIN
      v_reason:=SUBSTR(CASE WHEN v_reason IS NULL THEN p_text ELSE v_reason||';'||p_text END,1,1000);
    END;
  BEGIN
    p_run:=NULL;
    IF p_key IS NULL OR LENGTH(p_key)>100 THEN raise_application_error(-20202,'Run key is required, maximum 100 characters'); END IF;
    SELECT * INTO v_current FROM report_sets WHERE report_set_id=p_current;
    IF v_current.set_state<>'FROZEN' THEN raise_application_error(-20203,'Current snapshot must be frozen'); END IF;
    -- This lock serializes calculation and import versions for the same company.
    SELECT company_id INTO v_count FROM companies WHERE company_id=v_current.company_id FOR UPDATE NOWAIT;
    IF p_previous IS NOT NULL THEN
      SELECT * INTO v_previous FROM report_sets WHERE report_set_id=p_previous;
      IF v_previous.set_state<>'FROZEN' OR v_previous.company_id<>v_current.company_id OR
         v_previous.scope_code<>v_current.scope_code OR v_previous.fiscal_year<>v_current.fiscal_year-1 THEN
        raise_application_error(-20203,'Previous snapshot must match company/scope and exactly t-1');
      END IF;
    END IF;
    catalog(FALSE);
    BEGIN
      SELECT * INTO v_old FROM calculation_runs WHERE run_key=p_key;
      IF v_old.report_set_id<>p_current OR NVL(v_old.previous_set_id,-1)<>NVL(p_previous,-1) OR v_old.engine_version<>c_engine THEN
        raise_application_error(-20202,'Run key already identifies different snapshots or engine');
      END IF;
      p_run:=v_old.run_id;
      IF v_old.run_status='COMPLETED' THEN RETURN; END IF;
      raise_application_error(-20204,'Existing unfinished or failed run requires investigation and a new run key');
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
    END;
    BEGIN
      INSERT INTO calculation_runs(run_key,report_set_id,previous_set_id,engine_version)
       VALUES(p_key,p_current,p_previous,c_engine) RETURNING run_id INTO p_run;
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
      raise_application_error(-20202,'Run key was claimed by another calculation');
    END;
    v_created:=TRUE;
    UPDATE calculation_runs SET run_status='RUNNING' WHERE run_id=p_run;
    SAVEPOINT metric_work;
    BEGIN
      FOR m IN (SELECT metric_id,metric_code FROM metric_definitions WHERE formula_version=c_formula
                 AND metric_code IN ('REVENUE_GROWTH','GROSS_MARGIN','NET_MARGIN','ROA','ROE','LIABILITIES_ASSETS','CURRENT_RATIO','CFO_AVG_ASSETS') ORDER BY metric_code) LOOP
        amounts.DELETE;selections.DELETE;v_blocked:=0;v_verified:=TRUE;v_missing:=FALSE;v_reason:=NULL;
        FOR d IN (SELECT * FROM metric_dependencies WHERE metric_id=m.metric_id ORDER BY input_position) LOOP
          amounts(d.input_position):=NULL;
          v_set:=CASE WHEN d.year_offset=0 THEN p_current ELSE p_previous END;
          v_year:=v_current.fiscal_year+d.year_offset;
          v_acceptance:=CASE WHEN d.year_offset=0 THEN v_current.acceptance_status ELSE v_previous.acceptance_status END;
          IF v_set IS NULL THEN
            v_missing:=TRUE;v_verified:=FALSE;reason('MISSING_PREVIOUS_SNAPSHOT');CONTINUE;
          END IF;
          IF v_acceptance<>'VERIFIED' THEN v_verified:=FALSE;reason('PENDING_SNAPSHOT_'||d.input_position); END IF;
          BEGIN
            SELECT sf.selection_fact_id,sf.selected_quality,f.quality_status,sf.correction_id,c.review_status,
              CASE WHEN sf.correction_id IS NULL THEN f.value_vnd ELSE c.new_value_vnd END,
              r.metadata_status,r.currency_code,r.original_unit,r.unit_multiplier,r.fiscal_start,r.fiscal_end
             INTO v_selection,v_quality,v_raw_quality,v_correction,v_corr_status,v_amount,v_meta,v_currency,v_unit,v_multiplier,v_start,v_end
             FROM report_set_facts sf JOIN financial_facts f ON f.fact_id=sf.fact_id
             JOIN financial_reports r ON r.report_id=sf.report_id LEFT JOIN fact_corrections c ON c.correction_id=sf.correction_id
             WHERE sf.report_set_id=v_set AND sf.item_id=d.item_id;
            selections(d.input_position):=v_selection;
            SELECT COUNT(*) INTO v_issue FROM quality_issues q JOIN report_set_facts sf ON sf.report_id=q.report_id
             WHERE sf.selection_fact_id=v_selection AND (q.fact_id IS NULL OR q.fact_id=sf.fact_id)
               AND q.issue_status='OPEN' AND q.severity IN ('HIGH','CRITICAL');
            IF v_quality='BLOCKED' OR (v_correction IS NULL AND v_raw_quality='BLOCKED') OR
               v_corr_status='REJECTED' OR v_issue>0 THEN
              v_blocked:=1;reason('BLOCKED_INPUT_'||d.input_position);
            END IF;
            IF v_quality='MISSING' THEN v_amount:=NULL; END IF;
            IF v_amount IS NULL THEN v_missing:=TRUE;reason('MISSING_VALUE_'||d.input_position); END IF;
            IF v_currency<>'VND' OR v_unit<>'VND' OR NVL(v_multiplier,0)<>1 OR v_start IS NULL OR v_end IS NULL OR
               v_start<>TO_DATE(TO_CHAR(v_year)||'-01-01','YYYY-MM-DD') OR v_end<>TO_DATE(TO_CHAR(v_year)||'-12-31','YYYY-MM-DD') THEN
              v_blocked:=1;reason('INCOMPATIBLE_METADATA_'||d.input_position);
            END IF;
            IF v_quality<>'VERIFIED' OR v_meta<>'VERIFIED' OR v_current.scope_code='UNKNOWN' OR
              (v_correction IS NULL AND v_raw_quality<>'VERIFIED') OR (v_correction IS NOT NULL AND v_corr_status<>'APPROVED') THEN
              v_verified:=FALSE;reason('UNVERIFIED_INPUT_'||d.input_position);
            END IF;
            amounts(d.input_position):=v_amount;
          EXCEPTION WHEN NO_DATA_FOUND THEN
            v_missing:=TRUE;v_verified:=FALSE;reason('MISSING_FACT_'||d.input_position);
          END;
        END LOOP;
        IF NOT amounts.EXISTS(2) THEN amounts(2):=NULL; END IF;
        IF m.metric_code IN ('CURRENT_RATIO','LIABILITIES_ASSETS') AND amounts(0)<0 THEN
          v_blocked:=1;reason('NEGATIVE_BALANCE_NUMERATOR');
        END IF;
        pkg_metric_math.calculate(m.metric_code,amounts(0),amounts(1),amounts(2),v_blocked,v_value,v_status);
        IF v_status='CALCULATED_PROVISIONAL' AND v_verified AND NOT v_missing THEN
          v_status:='VALID';v_reason:='RETROSPECTIVE_VERIFIED_INPUTS';
        ELSIF v_reason IS NULL THEN v_reason:=v_status;
        END IF;
        INSERT INTO metric_results(run_id,metric_id,metric_value,result_status,reason_codes)
         VALUES(p_run,m.metric_id,v_value,v_status,v_reason) RETURNING result_id INTO v_result;
        FOR pos IN 0..2 LOOP
          IF selections.EXISTS(pos) THEN INSERT INTO metric_input_facts VALUES(v_result,pos,selections(pos)); END IF;
        END LOOP;
      END LOOP;
      SELECT COUNT(*) INTO v_count FROM metric_results WHERE run_id=p_run;
      IF v_count<>8 THEN raise_application_error(-20205,'Calculation must persist exactly eight results'); END IF;
      UPDATE calculation_runs SET run_status='COMPLETED' WHERE run_id=p_run;
      INSERT INTO business_change_log(entity_name,entity_key,action_code,new_data,actor_name)
       VALUES('CALCULATION_RUNS',TO_CHAR(p_run),'INSERT','COMPLETED;engine='||c_engine||';mode=RETROSPECTIVE',SYS_CONTEXT('USERENV','SESSION_USER'));
    EXCEPTION WHEN OTHERS THEN
      v_error:=SUBSTR(SQLERRM,1,1800);ROLLBACK TO metric_work;
      UPDATE calculation_runs SET run_status='FAILED' WHERE run_id=p_run;
      INSERT INTO business_change_log(entity_name,entity_key,action_code,new_data,actor_name)
       VALUES('CALCULATION_RUNS',TO_CHAR(p_run),'INSERT','FAILED;'||v_error,SYS_CONTEXT('USERENV','SESSION_USER'));
      COMMIT;RAISE;
    END;
  END;

  PROCEDURE calculate_snapshot(p_run_key VARCHAR2,p_report_set_id NUMBER,p_previous_set_id NUMBER,p_run_id OUT NUMBER) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
  BEGIN
    perform(p_run_key,p_report_set_id,p_previous_set_id,p_run_id);COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
  END;

  PROCEDURE calculate_current(p_run_key VARCHAR2,p_company_id NUMBER,p_year NUMBER,p_scope VARCHAR2,p_run_id OUT NUMBER) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    v_company NUMBER;v_current NUMBER;v_previous NUMBER;
  BEGIN
    SELECT company_id INTO v_company FROM companies WHERE company_id=p_company_id FOR UPDATE NOWAIT;
    BEGIN
      SELECT report_set_id INTO v_previous FROM report_heads
       WHERE company_id=p_company_id AND fiscal_year=p_year-1 AND scope_code=p_scope FOR UPDATE NOWAIT;
    EXCEPTION WHEN NO_DATA_FOUND THEN v_previous:=NULL;
    END;
    SELECT report_set_id INTO v_current FROM report_heads
     WHERE company_id=p_company_id AND fiscal_year=p_year AND scope_code=p_scope FOR UPDATE NOWAIT;
    perform(p_run_key,v_current,v_previous,p_run_id);COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
  END;
END;
/
