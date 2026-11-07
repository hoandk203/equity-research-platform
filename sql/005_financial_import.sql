-- Definer-rights import package. Only staging APIs accept untrusted strings.
-- Batch creation / processing run in autonomous transactions; staging is caller-owned.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

CREATE OR REPLACE PACKAGE pkg_financial_import AUTHID DEFINER AS
  PROCEDURE register_artifact(p_source_code VARCHAR2,p_source_name VARCHAR2,p_kind VARCHAR2,
    p_hash VARCHAR2,p_path VARCHAR2,p_url VARCHAR2,p_collected_at TIMESTAMP WITH TIME ZONE,
    p_note VARCHAR2,p_artifact_id OUT NUMBER);
  PROCEDURE create_batch(p_key VARCHAR2,p_contract VARCHAR2,p_mapping VARCHAR2,p_batch_id OUT NUMBER);
  PROCEDURE stage_fact(p_batch_id NUMBER,p_row_no NUMBER,p_symbol VARCHAR2,p_year VARCHAR2,
    p_item VARCHAR2,p_value VARCHAR2,p_artifact_id NUMBER,p_payload CLOB);
  PROCEDURE seal_batch(p_batch_id NUMBER);
  PROCEDURE process_batch(p_batch_id NUMBER);
END;
/

CREATE OR REPLACE PACKAGE BODY pkg_financial_import AS
  FUNCTION required(o JSON_OBJECT_T,k VARCHAR2) RETURN VARCHAR2 IS
    e JSON_ELEMENT_T; v VARCHAR2(4000);
  BEGIN
    IF NOT o.has(k) THEN raise_application_error(-20101,'Missing JSON field: '||k); END IF;
    e:=o.get(k);
    IF e IS NULL OR NOT e.is_string THEN raise_application_error(-20101,'Expected JSON string: '||k); END IF;
    v:=o.get_string(k);
    IF v IS NULL THEN raise_application_error(-20101,'Empty JSON field: '||k); END IF;
    RETURN v;
  END;

  FUNCTION amount(v VARCHAR2) RETURN NUMBER IS
  BEGIN
    IF v IS NULL OR NOT REGEXP_LIKE(v,'^-?[0-9]{1,28}$','c') THEN
      raise_application_error(-20102,'Money must be exact integer VND, at most 28 digits');
    END IF;
    RETURN TO_NUMBER(v);
  END;

  PROCEDURE register_artifact(p_source_code VARCHAR2,p_source_name VARCHAR2,p_kind VARCHAR2,
    p_hash VARCHAR2,p_path VARCHAR2,p_url VARCHAR2,p_collected_at TIMESTAMP WITH TIME ZONE,
    p_note VARCHAR2,p_artifact_id OUT NUMBER) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    v_source NUMBER; v_kind VARCHAR2(12);
  BEGIN
    BEGIN
      INSERT INTO data_sources(source_code,source_name) VALUES(p_source_code,p_source_name)
       RETURNING source_id INTO v_source;
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN SELECT source_id INTO v_source FROM data_sources WHERE source_code=p_source_code;
    END;
    BEGIN
      INSERT INTO source_artifacts(source_id,artifact_kind,sha256,storage_path,source_url,collected_at,hosting_note)
       VALUES(v_source,p_kind,p_hash,p_path,p_url,p_collected_at,p_note) RETURNING artifact_id INTO p_artifact_id;
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
      SELECT artifact_id,artifact_kind INTO p_artifact_id,v_kind FROM source_artifacts
       WHERE source_id=v_source AND sha256=p_hash;
      IF v_kind<>p_kind THEN raise_application_error(-20103,'Artifact hash already registered with another kind'); END IF;
    END;
    COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
  END;

  PROCEDURE create_batch(p_key VARCHAR2,p_contract VARCHAR2,p_mapping VARCHAR2,p_batch_id OUT NUMBER) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    v_contract VARCHAR2(40);v_mapping VARCHAR2(40);
  BEGIN
    IF p_contract<>'erp-financials/1.0.0' OR p_mapping<>'pilot-import/1.0.0' THEN
      raise_application_error(-20104,'Unsupported contract or mapping');
    END IF;
    BEGIN
      INSERT INTO etl_batches(batch_key,contract_version,mapping_version)
       VALUES(p_key,p_contract,p_mapping) RETURNING batch_id INTO p_batch_id;
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
      SELECT batch_id,contract_version,mapping_version INTO p_batch_id,v_contract,v_mapping
       FROM etl_batches WHERE batch_key=p_key;
      IF v_contract<>p_contract OR v_mapping<>p_mapping THEN raise_application_error(-20104,'Batch key contract conflict'); END IF;
    END;
    COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
  END;

  PROCEDURE stage_fact(p_batch_id NUMBER,p_row_no NUMBER,p_symbol VARCHAR2,p_year VARCHAR2,
    p_item VARCHAR2,p_value VARCHAR2,p_artifact_id NUMBER,p_payload CLOB) IS
    v_status VARCHAR2(16);v_old staging_facts%ROWTYPE;
  BEGIN
    SELECT batch_status INTO v_status FROM etl_batches WHERE batch_id=p_batch_id FOR UPDATE NOWAIT;
    BEGIN
      SELECT * INTO v_old FROM staging_facts WHERE batch_id=p_batch_id AND row_no=p_row_no;
      IF NVL(v_old.source_symbol,CHR(1))<>NVL(p_symbol,CHR(1)) OR NVL(v_old.fiscal_year_raw,CHR(1))<>NVL(p_year,CHR(1))
        OR NVL(v_old.item_code_raw,CHR(1))<>NVL(p_item,CHR(1)) OR NVL(v_old.value_text,CHR(1))<>NVL(p_value,CHR(1))
        OR NVL(v_old.artifact_id,-1)<>NVL(p_artifact_id,-1) OR v_old.payload IS NULL OR p_payload IS NULL
        OR DBMS_LOB.COMPARE(v_old.payload,p_payload)<>0 THEN
        raise_application_error(-20105,'Same batch/row has different data; use a new batch key');
      END IF;
      RETURN;
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
    END;
    IF v_status<>'CREATED' THEN raise_application_error(-20106,'Batch is sealed; no new staging rows allowed'); END IF;
    IF p_row_no IS NULL OR p_row_no<=0 OR p_row_no<>TRUNC(p_row_no) THEN raise_application_error(-20107,'Invalid row number'); END IF;
    INSERT INTO staging_facts(batch_id,row_no,source_symbol,fiscal_year_raw,item_code_raw,value_text,artifact_id,payload)
     VALUES(p_batch_id,p_row_no,p_symbol,p_year,p_item,p_value,p_artifact_id,p_payload);
  END;

  PROCEDURE seal_batch(p_batch_id NUMBER) IS
    v_status VARCHAR2(16);v_count NUMBER;
  BEGIN
    SELECT batch_status INTO v_status FROM etl_batches WHERE batch_id=p_batch_id FOR UPDATE NOWAIT;
    IF v_status IN ('STAGED','COMPLETED','PARTIAL','FAILED') THEN RETURN; END IF;
    IF v_status<>'CREATED' THEN raise_application_error(-20108,'Cannot seal a processing batch'); END IF;
    SELECT COUNT(*) INTO v_count FROM staging_facts WHERE batch_id=p_batch_id;
    IF v_count=0 THEN raise_application_error(-20109,'Empty batch'); END IF;
    UPDATE etl_batches SET received_count=v_count,batch_status='STAGED' WHERE batch_id=p_batch_id;
  END;

  -- Validate one row without persisting any financial business data.
  PROCEDURE validate_row(s staging_facts%ROWTYPE,p_company OUT NUMBER,p_year OUT NUMBER,p_dataset OUT VARCHAR2) IS
    o JSON_OBJECT_T;v_item financial_items%ROWTYPE;v_kind VARCHAR2(12);v_num NUMBER;v_new NUMBER;v_hash VARCHAR2(64);
    v_count NUMBER;v_page NUMBER;v_stamp TIMESTAMP WITH TIME ZONE;v_artifact NUMBER;v_review_hash VARCHAR2(64);
  BEGIN
    IF s.source_symbol IS NULL OR s.fiscal_year_raw IS NULL OR s.item_code_raw IS NULL OR s.value_text IS NULL THEN
      raise_application_error(-20110,'Required staging columns cannot be NULL');
    END IF;
    o:=JSON_OBJECT_T.parse(s.payload);
    IF required(o,'symbol')<>s.source_symbol OR required(o,'year')<>s.fiscal_year_raw OR
       required(o,'item_code')<>s.item_code_raw OR required(o,'issuer_value')<>s.value_text THEN
      raise_application_error(-20110,'Staging columns differ from payload');
    END IF;
    IF NOT REGEXP_LIKE(s.fiscal_year_raw,'^[0-9]{4}$','c') THEN raise_application_error(-20111,'Invalid fiscal year'); END IF;
    p_year:=TO_NUMBER(s.fiscal_year_raw);
    IF p_year NOT BETWEEN 2022 AND 2025 THEN raise_application_error(-20111,'Year outside pilot contract'); END IF;
    SELECT company_id INTO p_company FROM securities WHERE symbol=s.source_symbol AND exchange_code='HOSE';
    SELECT * INTO v_item FROM financial_items WHERE item_code=s.item_code_raw;
    IF required(o,'statement_kind')<>v_item.statement_kind THEN raise_application_error(-20112,'Wrong statement for item'); END IF;
    IF required(o,'currency')<>'VND' OR required(o,'original_unit')<>'VND' OR required(o,'unit_multiplier')<>'1'
      OR required(o,'scope')<>'CONSOLIDATED' OR required(o,'accounting_basis')<>'VAS'
      OR required(o,'review_status')<>'VERIFIED_AUTOMATED' THEN
      raise_application_error(-20113,'Unverified or unsupported unit/scope/basis/review');
    END IF;
    IF required(o,'fiscal_start')<>s.fiscal_year_raw||'-01-01' OR required(o,'fiscal_end')<>s.fiscal_year_raw||'-12-31'
      OR required(o,'publication_status')<>'UNKNOWN' THEN raise_application_error(-20114,'Invalid fiscal dates/publication policy'); END IF;
    v_num:=amount(required(o,'provider_value'));v_new:=amount(required(o,'issuer_value'));
    IF s.item_code_raw IN ('assets','equity','current_liabilities') AND v_new<=0 THEN raise_application_error(-20115,'Invalid financial denominator'); END IF;
    IF s.item_code_raw IN ('current_assets','liabilities','funding_total') AND v_new<0 THEN raise_application_error(-20115,'Invalid balance value'); END IF;
    IF s.item_code_raw='revenue' AND v_new<=0 THEN raise_application_error(-20115,'Revenue must be positive for this pilot'); END IF;
    SELECT artifact_kind,sha256 INTO v_kind,v_hash FROM source_artifacts WHERE artifact_id=s.artifact_id;
    IF v_kind<>'JSON' OR v_hash<>required(o,'provider_sha256') THEN raise_application_error(-20116,'Provider artifact/hash mismatch'); END IF;
    v_artifact:=amount(required(o,'issuer_artifact_id'));
    SELECT artifact_kind,sha256 INTO v_kind,v_hash FROM source_artifacts WHERE artifact_id=v_artifact;
    IF v_kind<>'PDF' OR v_hash<>required(o,'issuer_sha256') THEN raise_application_error(-20117,'Issuer evidence/hash mismatch'); END IF;
    v_artifact:=amount(required(o,'review_artifact_id'));v_review_hash:=required(o,'review_sha256');
    SELECT COUNT(*) INTO v_count FROM source_artifacts WHERE artifact_id=v_artifact AND artifact_kind='CSV'
      AND sha256=v_review_hash;
    IF v_count<>1 THEN raise_application_error(-20118,'Missing accepted review checklist artifact'); END IF;
    v_page:=amount(required(o,'evidence_page'));
    IF v_page<=0 THEN raise_application_error(-20119,'Evidence page must be positive'); END IF;
    p_dataset:=required(o,'dataset_version');
    IF LENGTH(p_dataset)>60 THEN raise_application_error(-20120,'Dataset version too long'); END IF;
    IF v_num<>v_new THEN
      IF required(o,'correction_status')<>'APPROVED' OR required(o,'correction_new')<>required(o,'issuer_value')
        OR required(o,'correction_old')<>required(o,'provider_value') THEN raise_application_error(-20121,'Correction does not match source/effective value'); END IF;
      v_stamp:=TO_TIMESTAMP_TZ(required(o,'reviewed_at'),'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM');
      IF required(o,'reviewed_by') IS NULL OR required(o,'correction_key') IS NULL THEN raise_application_error(-20121,'Correction review missing'); END IF;
    ELSIF o.has('correction_key') THEN raise_application_error(-20121,'Unnecessary correction for equal values');
    END IF;
  EXCEPTION WHEN NO_DATA_FOUND THEN raise_application_error(-20122,'Unknown company/item/artifact');
  END;

  PROCEDURE process_batch(p_batch_id NUMBER) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    v_batch etl_batches%ROWTYPE;v_company NUMBER;v_year NUMBER;v_dataset VARCHAR2(60);
    v_company2 NUMBER;v_year2 NUMBER;v_dataset2 VARCHAR2(60);v_count NUMBER;v_set NUMBER;
    v_report NUMBER;v_version NUMBER;v_item NUMBER;v_fact NUMBER;v_correction NUMBER;v_existing NUMBER;
    v_num NUMBER;v_new NUMBER;v_value NUMBER;v_scope VARCHAR2(16);v_status VARCHAR2(8);o JSON_OBJECT_T;
    v_assets NUMBER;v_liabilities NUMBER;v_equity NUMBER;v_funding NUMBER;
    v_error VARCHAR2(2000);v_code VARCHAR2(60);v_current_staging NUMBER;v_previous_payload CLOB;
    f_record financial_facts%ROWTYPE;c_record fact_corrections%ROWTYPE;
    v_imported NUMBER:=0;v_rejected NUMBER:=0;v_skipped NUMBER:=0;v_group_size NUMBER;
    TYPE ids IS TABLE OF NUMBER INDEX BY VARCHAR2(2);report_ids ids;
  BEGIN
    SELECT * INTO v_batch FROM etl_batches WHERE batch_id=p_batch_id FOR UPDATE NOWAIT;
    IF v_batch.batch_status IN ('COMPLETED','PARTIAL','FAILED') THEN COMMIT;RETURN; END IF;
    IF v_batch.batch_status<>'STAGED' THEN raise_application_error(-20123,'Commit staged/sealed batch before processing'); END IF;
    -- Validate every group first; VALIDATED means validation pass finished, not that every row passed.
    FOR g IN (SELECT source_symbol,fiscal_year_raw FROM staging_facts WHERE batch_id=p_batch_id GROUP BY source_symbol,fiscal_year_raw) LOOP
      v_current_staging:=NULL;
      BEGIN
        SELECT COUNT(*),COUNT(DISTINCT item_code_raw) INTO v_group_size,v_count FROM staging_facts
         WHERE batch_id=p_batch_id AND DECODE(source_symbol,g.source_symbol,1,0)=1 AND DECODE(fiscal_year_raw,g.fiscal_year_raw,1,0)=1;
        IF v_group_size<>11 OR v_count<>11 THEN raise_application_error(-20124,'Report set requires exactly 11 distinct pilot items'); END IF;
        v_dataset:=NULL;v_assets:=NULL;v_liabilities:=NULL;v_equity:=NULL;v_funding:=NULL;
        FOR s IN (SELECT * FROM staging_facts WHERE batch_id=p_batch_id AND DECODE(source_symbol,g.source_symbol,1,0)=1
                  AND DECODE(fiscal_year_raw,g.fiscal_year_raw,1,0)=1 ORDER BY row_no) LOOP
          v_current_staging:=s.staging_id;validate_row(s,v_company2,v_year2,v_dataset2);
          IF v_dataset IS NULL THEN v_company:=v_company2;v_year:=v_year2;v_dataset:=v_dataset2;
          ELSIF v_dataset<>v_dataset2 OR v_company<>v_company2 OR v_year<>v_year2 THEN raise_application_error(-20125,'Mixed dataset in report set'); END IF;
          o:=JSON_OBJECT_T.parse(s.payload);v_value:=amount(required(o,'issuer_value'));
          CASE s.item_code_raw WHEN 'assets' THEN v_assets:=v_value; WHEN 'liabilities' THEN v_liabilities:=v_value;
           WHEN 'equity' THEN v_equity:=v_value; WHEN 'funding_total' THEN v_funding:=v_value; ELSE NULL; END CASE;
        END LOOP;
        IF v_assets IS NULL OR v_liabilities IS NULL OR v_equity IS NULL OR v_funding IS NULL
          OR v_assets<>v_liabilities+v_equity OR v_assets<>v_funding THEN raise_application_error(-20126,'Balance reconciliation failed'); END IF;
        UPDATE staging_facts SET row_status='VALID' WHERE batch_id=p_batch_id AND source_symbol=g.source_symbol AND fiscal_year_raw=g.fiscal_year_raw;
      EXCEPTION WHEN OTHERS THEN
        v_error:=SUBSTR(SQLERRM,1,1900);v_code:='VALIDATION_'||TO_CHAR(ABS(SQLCODE));
        UPDATE staging_facts SET row_status='REJECTED' WHERE batch_id=p_batch_id AND DECODE(source_symbol,g.source_symbol,1,0)=1 AND DECODE(fiscal_year_raw,g.fiscal_year_raw,1,0)=1;
        INSERT INTO etl_errors(batch_id,staging_id,error_code,error_message) VALUES(p_batch_id,v_current_staging,v_code,v_error);
      END;
    END LOOP;
    UPDATE etl_batches SET batch_status='VALIDATED' WHERE batch_id=p_batch_id;
    -- The row lock ends at COMMIT; IMPORTING is the durable ownership claim.
    -- Another worker must not resume that state implicitly.
    UPDATE etl_batches SET batch_status='IMPORTING' WHERE batch_id=p_batch_id;COMMIT;
    FOR g IN (SELECT source_symbol,fiscal_year_raw,COUNT(*) cnt FROM staging_facts
              WHERE batch_id=p_batch_id AND row_status='VALID' GROUP BY source_symbol,fiscal_year_raw ORDER BY source_symbol,fiscal_year_raw) LOOP
      SAVEPOINT one_report_set;v_current_staging:=NULL;report_ids.DELETE;
      BEGIN
        SELECT company_id INTO v_company FROM securities WHERE symbol=g.source_symbol AND exchange_code='HOSE';
        -- Serialize different batches importing versions of the same company.
        SELECT company_id INTO v_company FROM companies WHERE company_id=v_company FOR UPDATE;
        v_year:=TO_NUMBER(g.fiscal_year_raw);
        FOR s IN (SELECT * FROM staging_facts WHERE batch_id=p_batch_id AND source_symbol=g.source_symbol AND fiscal_year_raw=g.fiscal_year_raw ORDER BY row_no) LOOP
          validate_row(s,v_company2,v_year2,v_dataset);EXIT;
        END LOOP;
        SELECT MAX(report_set_id) INTO v_existing FROM report_sets WHERE company_id=v_company AND fiscal_year=v_year
          AND scope_code='CONSOLIDATED' AND dataset_version=v_dataset AND set_state='FROZEN';
        IF v_existing IS NOT NULL THEN
          SELECT COUNT(*) INTO v_count FROM report_set_facts WHERE report_set_id=v_existing;
          IF v_count<>11 THEN raise_application_error(-20127,'Existing snapshot is incomplete'); END IF;
          FOR s IN (SELECT * FROM staging_facts WHERE batch_id=p_batch_id AND source_symbol=g.source_symbol AND fiscal_year_raw=g.fiscal_year_raw) LOOP
            o:=JSON_OBJECT_T.parse(s.payload);
            SELECT COALESCE(c.new_value_vnd,f.value_vnd) INTO v_value FROM report_set_facts sf
             JOIN financial_facts f ON f.fact_id=sf.fact_id JOIN financial_items i ON i.item_id=sf.item_id
             LEFT JOIN fact_corrections c ON c.correction_id=sf.correction_id
             WHERE sf.report_set_id=v_existing AND i.item_code=s.item_code_raw;
            IF v_value<>amount(required(o,'issuer_value')) THEN raise_application_error(-20128,'Same dataset identity has conflicting values'); END IF;
            SELECT old_s.payload INTO v_previous_payload FROM report_set_facts sf
              JOIN financial_items i ON i.item_id=sf.item_id
              JOIN financial_reports r ON r.report_id=sf.report_id
              JOIN staging_facts old_s ON old_s.batch_id=r.batch_id AND old_s.source_symbol=g.source_symbol
                AND old_s.fiscal_year_raw=g.fiscal_year_raw AND old_s.item_code_raw=i.item_code
              WHERE sf.report_set_id=v_existing AND i.item_code=s.item_code_raw;
            IF DBMS_LOB.COMPARE(v_previous_payload,s.payload)<>0 THEN
              raise_application_error(-20128,'Same dataset identity has conflicting provenance or metadata');
            END IF;
          END LOOP;
          UPDATE staging_facts SET row_status='SKIPPED' WHERE batch_id=p_batch_id AND source_symbol=g.source_symbol AND fiscal_year_raw=g.fiscal_year_raw;
        ELSE
          SELECT NVL(MAX(selection_version),0)+1 INTO v_version FROM report_sets WHERE company_id=v_company AND fiscal_year=v_year AND scope_code='CONSOLIDATED';
          INSERT INTO report_sets(company_id,fiscal_year,scope_code,selection_version,dataset_version)
           VALUES(v_company,v_year,'CONSOLIDATED',v_version,v_dataset) RETURNING report_set_id INTO v_set;
          FOR s IN (SELECT * FROM staging_facts WHERE batch_id=p_batch_id AND source_symbol=g.source_symbol AND fiscal_year_raw=g.fiscal_year_raw ORDER BY row_no) LOOP
            v_current_staging:=s.staging_id;o:=JSON_OBJECT_T.parse(s.payload);v_scope:=required(o,'statement_kind');
            IF NOT report_ids.EXISTS(v_scope) THEN
              SELECT NVL(MAX(report_version),0)+1 INTO v_version FROM financial_reports WHERE company_id=v_company
               AND fiscal_year=v_year AND statement_kind=v_scope AND artifact_id=s.artifact_id AND mapping_version=v_batch.mapping_version;
              INSERT INTO financial_reports(company_id,fiscal_year,statement_kind,scope_code,source_report_type,artifact_id,
                mapping_version,report_version,fiscal_start,fiscal_end,currency_code,original_unit,unit_multiplier,metadata_status,batch_id)
               VALUES(v_company,v_year,v_scope,'CONSOLIDATED','HK',s.artifact_id,v_batch.mapping_version,v_version,
                TO_DATE(g.fiscal_year_raw||'-01-01','FXYYYY-MM-DD'),TO_DATE(g.fiscal_year_raw||'-12-31','FXYYYY-MM-DD'),
                'VND','VND',1,'VERIFIED',p_batch_id) RETURNING report_id INTO v_report;
              report_ids(v_scope):=v_report;
              INSERT INTO report_set_members VALUES(v_set,v_scope,v_report);
            ELSE
              v_report:=report_ids(v_scope);
              SELECT artifact_id INTO v_count FROM financial_reports WHERE report_id=v_report;
              IF v_count<>s.artifact_id THEN raise_application_error(-20129,'Mixed provider artifacts in one statement'); END IF;
            END IF;
            SELECT item_id INTO v_item FROM financial_items WHERE item_code=s.item_code_raw;
            v_num:=amount(required(o,'provider_value'));v_new:=amount(required(o,'issuer_value'));v_correction:=NULL;
            f_record.value_text:=required(o,'provider_value');f_record.raw_locator:=required(o,'raw_locator');
            f_record.raw_code:=required(o,'raw_code');f_record.raw_name:=required(o,'raw_name');
            INSERT INTO financial_facts(report_id,item_id,statement_kind,value_text,value_original,value_vnd,quality_status,raw_locator,raw_code,raw_name)
             VALUES(v_report,v_item,v_scope,f_record.value_text,v_num,v_num,
               CASE WHEN v_num=v_new THEN 'VERIFIED' ELSE 'BLOCKED' END,f_record.raw_locator,f_record.raw_code,f_record.raw_name)
             RETURNING fact_id INTO v_fact;
            IF v_num<>v_new THEN
              c_record.correction_key:=required(o,'correction_key')||':S'||TO_CHAR(v_set);
              c_record.evidence_artifact_id:=amount(required(o,'issuer_artifact_id'));
              c_record.evidence_page:=amount(required(o,'evidence_page'));c_record.reason:=required(o,'correction_reason');
              c_record.reviewed_by:=required(o,'reviewed_by');
              c_record.reviewed_at:=TO_TIMESTAMP_TZ(required(o,'reviewed_at'),'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM');
              INSERT INTO fact_corrections(fact_id,correction_key,new_value_original,new_value_vnd,evidence_artifact_id,evidence_page,
                reason,review_status,reviewed_by,reviewed_at)
               VALUES(v_fact,c_record.correction_key,v_new,v_new,c_record.evidence_artifact_id,
                c_record.evidence_page,c_record.reason,'APPROVED',c_record.reviewed_by,
                c_record.reviewed_at) RETURNING correction_id INTO v_correction;
            END IF;
            INSERT INTO report_set_facts(report_set_id,report_id,item_id,fact_id,correction_id,selected_quality)
             VALUES(v_set,v_report,v_item,v_fact,v_correction,'VERIFIED');
          END LOOP;
          UPDATE report_sets SET set_state='FROZEN',acceptance_status='VERIFIED' WHERE report_set_id=v_set;
          MERGE INTO report_heads h USING(SELECT v_company cid,v_year fy FROM dual) x
           ON(h.company_id=x.cid AND h.fiscal_year=x.fy AND h.scope_code='CONSOLIDATED')
           WHEN MATCHED THEN UPDATE SET h.report_set_id=v_set,h.lock_version=h.lock_version+1
           WHEN NOT MATCHED THEN INSERT(company_id,fiscal_year,scope_code,report_set_id,lock_version)
             VALUES(v_company,v_year,'CONSOLIDATED',v_set,1);
          UPDATE staging_facts SET row_status='IMPORTED' WHERE batch_id=p_batch_id AND source_symbol=g.source_symbol AND fiscal_year_raw=g.fiscal_year_raw;
        END IF;
        COMMIT;
      EXCEPTION WHEN OTHERS THEN
        v_error:=SUBSTR(SQLERRM,1,1900);v_code:='PROMOTION_'||TO_CHAR(ABS(SQLCODE));ROLLBACK TO one_report_set;
        UPDATE staging_facts SET row_status='REJECTED' WHERE batch_id=p_batch_id AND source_symbol=g.source_symbol AND fiscal_year_raw=g.fiscal_year_raw;
        INSERT INTO etl_errors(batch_id,staging_id,error_code,error_message) VALUES(p_batch_id,v_current_staging,v_code,v_error);
        COMMIT;
      END;
    END LOOP;
    SELECT COUNT(CASE WHEN row_status='IMPORTED' THEN 1 END),COUNT(CASE WHEN row_status='REJECTED' THEN 1 END),
           COUNT(CASE WHEN row_status='SKIPPED' THEN 1 END) INTO v_imported,v_rejected,v_skipped FROM staging_facts WHERE batch_id=p_batch_id;
    IF v_imported+v_rejected+v_skipped<>v_batch.received_count THEN raise_application_error(-20130,'Batch row counters do not reconcile'); END IF;
    UPDATE etl_batches SET imported_count=v_imported,rejected_count=v_rejected,skipped_count=v_skipped,
      batch_status=CASE WHEN v_rejected=0 THEN 'COMPLETED' WHEN v_imported+v_skipped=0 THEN 'FAILED' ELSE 'PARTIAL' END,
      finished_at=SYSTIMESTAMP WHERE batch_id=p_batch_id;
    COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK;RAISE;
  END;
END;
/
