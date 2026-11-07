-- SYNTHETIC structural fixtures only, entirely rolled back at the end.
DECLARE
  n NUMBER; passed NUMBER:=0; v NUMBER; s VARCHAR2(40);
  PROCEDURE expect_error(p_sql VARCHAR2,p_code NUMBER,p_label VARCHAR2) IS
  BEGIN
    BEGIN
      EXECUTE IMMEDIATE p_sql;
    EXCEPTION WHEN OTHERS THEN
      IF SQLCODE=p_code THEN
        passed:=passed+1; DBMS_OUTPUT.PUT_LINE('PASS '||p_label); RETURN;
      ELSE RAISE; END IF;
    END;
    raise_application_error(-20980,'Expected error missing: '||p_label);
  END;
BEGIN
  SAVEPOINT structural_fixture;
  INSERT INTO companies(company_id,company_key,company_name) VALUES(-91001,'__SYNTHETIC_A__','Synthetic test A');
  INSERT INTO companies(company_id,company_key,company_name) VALUES(-91002,'__SYNTHETIC_B__','Synthetic test B');
  INSERT INTO data_sources(source_id,source_code,source_name) VALUES(-91001,'__SYNTHETIC__','Synthetic fixture only');
  INSERT INTO source_artifacts(artifact_id,source_id,artifact_kind,sha256,storage_path,collected_at)
   VALUES(-91001,-91001,'JSON',RPAD('a',64,'a'),'synthetic://no-financial-data',SYSTIMESTAMP);
  INSERT INTO etl_batches(batch_id,batch_key,contract_version,mapping_version) VALUES(-91001,'__SYNTHETIC__','1.0.0','test');
  INSERT INTO financial_items(item_id,item_code,item_name,statement_kind) VALUES(-91001,'__TEST_REVENUE__','Synthetic revenue','IS');
  FOR y IN 2023..2024 LOOP
    FOR k IN 1..3 LOOP
      INSERT INTO financial_reports(report_id,company_id,fiscal_year,statement_kind,scope_code,source_report_type,
       artifact_id,mapping_version,batch_id)
       VALUES(-91000-y*10-k,-91001,y,CASE k WHEN 1 THEN 'BS' WHEN 2 THEN 'IS' ELSE 'CF' END,'UNKNOWN','TEST',-91001,'test',-91001);
    END LOOP;
    INSERT INTO financial_facts(fact_id,report_id,item_id,statement_kind,value_text,value_original,quality_status,raw_locator,raw_code)
     VALUES(-92000-y,-91000-y*10-2,-91001,'IS','100',100,'PROVISIONAL','synthetic','TEST');
    INSERT INTO report_sets(report_set_id,company_id,fiscal_year,scope_code,selection_version,dataset_version)
     VALUES(-93000-y,-91001,y,'UNKNOWN',1,'synthetic');
    FOR k IN 1..3 LOOP
      INSERT INTO report_set_members VALUES(-93000-y,CASE k WHEN 1 THEN 'BS' WHEN 2 THEN 'IS' ELSE 'CF' END,-91000-y*10-k);
    END LOOP;
    INSERT INTO report_set_facts(selection_fact_id,report_set_id,report_id,item_id,fact_id,selected_quality)
     VALUES(-94000-y,-93000-y,-91000-y*10-2,-91001,-92000-y,'PROVISIONAL');
    UPDATE report_sets SET set_state='FROZEN' WHERE report_set_id=-93000-y;
  END LOOP;
  INSERT INTO report_sets(report_set_id,company_id,fiscal_year,scope_code,selection_version,dataset_version)
   VALUES(-95001,-91002,2024,'UNKNOWN',1,'synthetic');
  INSERT INTO report_heads(company_id,fiscal_year,scope_code,report_set_id) VALUES(-91001,2024,'UNKNOWN',-95024);
  SELECT COUNT(*) INTO n FROM business_change_log WHERE entity_name='REPORT_HEADS' AND entity_key='-91001:2024:UNKNOWN';
  IF n<>1 THEN raise_application_error(-20981,'Head audit log missing'); END IF;
  passed:=passed+1; DBMS_OUTPUT.PUT_LINE('PASS business_history');
  expect_error(q'[INSERT INTO companies(company_key,company_name) VALUES('__SYNTHETIC_A__','duplicate')]',-1,'duplicate_business_key');
  expect_error(q'[INSERT INTO companies(company_key,company_name) VALUES('__NULL__',NULL)]',-1400,'required_name');
  expect_error(q'[INSERT INTO securities(company_id,symbol,exchange_code) VALUES(-999999,'TEST','TEST')]',-2291,'orphan_security');
  expect_error(q'[INSERT INTO financial_facts(report_id,item_id,statement_kind,value_original,quality_status,raw_locator,raw_code) VALUES(-111241,-91001,'BS',1,'PROVISIONAL','test','test')]',-2291,'wrong_statement_item');
  expect_error(q'[INSERT INTO report_sets(company_id,fiscal_year,scope_code,selection_version,dataset_version,set_state) VALUES(-91002,2025,'UNKNOWN',1,'test','FROZEN')]',-20031,'cannot_insert_frozen');
  expect_error(q'[UPDATE report_sets SET set_state='FROZEN' WHERE report_set_id=-95001]',-20014,'cannot_freeze_incomplete');
  expect_error(q'[INSERT INTO report_set_members VALUES(-95001,'IS',-111242)]',-20006,'cross_company_member');
  expect_error(q'[DELETE FROM report_set_facts WHERE report_set_id=-95024]',-20008,'frozen_fact_selection');
  expect_error(q'[UPDATE report_heads SET lock_version=1 WHERE company_id=-91001]',-20019,'head_version_required');
  expect_error(q'[UPDATE financial_facts SET value_original=999 WHERE fact_id=-94024]',-20002,'source_fact_immutable');
  INSERT INTO calculation_runs(run_id,run_key,report_set_id,previous_set_id,engine_version)
   VALUES(-91001,'__SYNTHETIC_RUN__',-95024,-95023,'math/1.0.0');
  expect_error(q'[UPDATE calculation_runs SET run_status='COMPLETED' WHERE run_id=-91001]',-20040,'cannot_complete_empty_run');
  expect_error(q'[INSERT INTO calculation_runs(run_key,report_set_id,previous_set_id,engine_version) VALUES('__BAD_PREV__',-95023,-95024,'test')]',-20023,'previous_year_not_future');
  INSERT INTO metric_definitions(metric_id,metric_code,formula_version,metric_name,formula_text,display_unit)
   VALUES(-91001,'REVENUE_GROWTH','test/1.0.0','Synthetic growth','R[t]/R[t-1]-1','PERCENT');
  INSERT INTO metric_dependencies VALUES(-91001,0,-91001,0);
  INSERT INTO metric_dependencies VALUES(-91001,1,-91001,-1);
  expect_error(q'[INSERT INTO metric_results(run_id,metric_id,metric_value,result_status) VALUES(-91001,-91001,0.1,'VALID')]',-20034,'pending_snapshot_not_valid');
  INSERT INTO metric_results(result_id,run_id,metric_id,metric_value,result_status)
   VALUES(-91001,-91001,-91001,0,'CALCULATED_PROVISIONAL');
  expect_error(q'[UPDATE calculation_runs SET run_status='COMPLETED' WHERE run_id=-91001]',-20041,'cannot_complete_without_lineage');
  expect_error(q'[INSERT INTO metric_input_facts VALUES(-91001,0,-96023)]',-20026,'wrong_input_snapshot');
  INSERT INTO metric_input_facts VALUES(-91001,0,-96024);
  INSERT INTO metric_input_facts VALUES(-91001,1,-96023);
  UPDATE calculation_runs SET run_status='COMPLETED' WHERE run_id=-91001;
  expect_error(q'[UPDATE metric_results SET metric_value=10 WHERE result_id=-91001]',-20032,'finished_result_immutable');
  expect_error(q'[DELETE FROM metric_input_facts WHERE result_id=-91001]',-20025,'finished_input_immutable');
  pkg_metric_math.calculate('ROE',10,-10,100,0,v,s);
  IF v IS NOT NULL OR s<>'INVALID_DENOMINATOR' THEN raise_application_error(-20982,'ROE guard failed'); END IF;
  passed:=passed+1;DBMS_OUTPUT.PUT_LINE('PASS roe_negative_opening_equity');
  pkg_metric_math.calculate('NET_MARGIN',NULL,100,NULL,0,v,s);
  IF v IS NOT NULL OR s<>'MISSING_INPUT' THEN raise_application_error(-20983,'NULL guard failed'); END IF;
  passed:=passed+1;DBMS_OUTPUT.PUT_LINE('PASS missing_not_zero');
  pkg_metric_math.calculate('NET_MARGIN',1,2000000000000,NULL,0,v,s);
  IF v<>0.000000000001 THEN raise_application_error(-20984,'Rounding failed'); END IF;
  passed:=passed+1;DBMS_OUTPUT.PUT_LINE('PASS half_up_rounding');
  ROLLBACK TO structural_fixture;
  SELECT COUNT(*) INTO n FROM companies WHERE company_key LIKE '__SYNTHETIC%';
  IF n<>0 THEN raise_application_error(-20985,'Synthetic fixture rollback failed'); END IF;
  DBMS_OUTPUT.PUT_LINE('STRUCTURAL_CHECKS='||passed||'; FIXTURE_ROLLBACK=PASS');
END;
/
