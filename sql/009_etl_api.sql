-- Grant EXECUTE on this facade only. Administrative catalog setup remains private.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
CREATE OR REPLACE PACKAGE pkg_etl_api AUTHID DEFINER AS
  PROCEDURE register_artifact(p_source_code VARCHAR2,p_source_name VARCHAR2,p_kind VARCHAR2,p_hash VARCHAR2,
    p_path VARCHAR2,p_url VARCHAR2,p_collected_at TIMESTAMP WITH TIME ZONE,p_note VARCHAR2,p_artifact_id OUT NUMBER);
  PROCEDURE create_batch(p_key VARCHAR2,p_contract VARCHAR2,p_mapping VARCHAR2,p_batch_id OUT NUMBER);
  PROCEDURE stage_fact(p_batch_id NUMBER,p_row_no NUMBER,p_symbol VARCHAR2,p_year VARCHAR2,
    p_item VARCHAR2,p_value VARCHAR2,p_artifact_id NUMBER,p_payload CLOB);
  PROCEDURE seal_batch(p_batch_id NUMBER);
  PROCEDURE process_batch(p_batch_id NUMBER);
  PROCEDURE calculate_current(p_run_key VARCHAR2,p_symbol VARCHAR2,p_year NUMBER,p_scope VARCHAR2,p_run_id OUT NUMBER);
END;
/
CREATE OR REPLACE PACKAGE BODY pkg_etl_api AS
  PROCEDURE register_artifact(p_source_code VARCHAR2,p_source_name VARCHAR2,p_kind VARCHAR2,p_hash VARCHAR2,
    p_path VARCHAR2,p_url VARCHAR2,p_collected_at TIMESTAMP WITH TIME ZONE,p_note VARCHAR2,p_artifact_id OUT NUMBER) IS
  BEGIN
    IF p_source_code IS NULL OR p_kind IS NULL OR
      NOT ((p_source_code='CAFEF' AND p_kind='JSON') OR
           (p_source_code IN ('FPT_IR','HPG_IR','VNM_IR') AND p_kind='PDF') OR
           (p_source_code='PILOT_REVIEW' AND p_kind='CSV')) THEN
      raise_application_error(-20301,'Source/kind is outside the accepted pilot registry');
    END IF;
    pkg_financial_import.register_artifact(p_source_code,p_source_name,p_kind,p_hash,p_path,p_url,p_collected_at,p_note,p_artifact_id);
  END;
  PROCEDURE create_batch(p_key VARCHAR2,p_contract VARCHAR2,p_mapping VARCHAR2,p_batch_id OUT NUMBER) IS
  BEGIN pkg_financial_import.create_batch(p_key,p_contract,p_mapping,p_batch_id);END;
  PROCEDURE stage_fact(p_batch_id NUMBER,p_row_no NUMBER,p_symbol VARCHAR2,p_year VARCHAR2,
    p_item VARCHAR2,p_value VARCHAR2,p_artifact_id NUMBER,p_payload CLOB) IS
  BEGIN pkg_financial_import.stage_fact(p_batch_id,p_row_no,p_symbol,p_year,p_item,p_value,p_artifact_id,p_payload);END;
  PROCEDURE seal_batch(p_batch_id NUMBER) IS
  BEGIN pkg_financial_import.seal_batch(p_batch_id);END;
  PROCEDURE process_batch(p_batch_id NUMBER) IS
  BEGIN pkg_financial_import.process_batch(p_batch_id);END;
  PROCEDURE calculate_current(p_run_key VARCHAR2,p_symbol VARCHAR2,p_year NUMBER,p_scope VARCHAR2,p_run_id OUT NUMBER) IS
    v_company NUMBER;
  BEGIN
    IF p_symbol IS NULL OR p_symbol NOT IN ('FPT','HPG','VNM') OR p_year IS NULL OR p_year NOT BETWEEN 2023 AND 2025
      OR p_year<>TRUNC(p_year) OR p_scope IS NULL OR p_scope<>'CONSOLIDATED' THEN
      raise_application_error(-20302,'Calculation arguments are outside the accepted pilot');
    END IF;
    SELECT company_id INTO v_company FROM securities WHERE symbol=p_symbol AND exchange_code='HOSE';
    pkg_metric_calculation.calculate_current(p_run_key,v_company,p_year,p_scope,p_run_id);
  END;
END;
/
