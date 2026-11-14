-- Market-data import (contract erp-market/1.0.0, docs/18 section 1). Install after 020.
-- Same lifecycle as pkg_financial_import: create_batch / process_batch are autonomous,
-- stage_row runs in the caller's transaction, seal_batch marks the batch STAGED.
-- A group (one symbol for PRICES/SHARES, one company-year for CAPITAL) is validated and
-- promoted atomically; a rejected group leaves an etl_errors row that survives rollback.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

CREATE OR REPLACE PACKAGE pkg_market_import AUTHID DEFINER AS
  c_contract CONSTANT VARCHAR2(40) := 'erp-market/1.0.0';
  c_prices   CONSTANT VARCHAR2(40) := 'vndirect-prices/1.0.0';
  c_shares   CONSTANT VARCHAR2(40) := 'vndirect-shares/1.0.0';
  c_capital  CONSTANT VARCHAR2(40) := 'capital-review/1.0.0';
  c_from     CONSTANT DATE := DATE '2022-01-01';
  c_to       CONSTANT DATE := DATE '2025-12-31';
  c_max_gap  CONSTANT NUMBER := 10;   -- calendar days between consecutive sessions (Tet <= 9)
  PROCEDURE create_batch(p_key VARCHAR2, p_mapping VARCHAR2, p_batch_id OUT NUMBER);
  PROCEDURE stage_row(p_batch_id NUMBER, p_row_no NUMBER, p_kind VARCHAR2, p_symbol VARCHAR2,
    p_key VARCHAR2, p_artifact_id NUMBER, p_payload CLOB);
  PROCEDURE seal_batch(p_batch_id NUMBER);
  PROCEDURE process_batch(p_batch_id NUMBER);
  PROCEDURE refresh_market_views;
END;
/

CREATE OR REPLACE PACKAGE BODY pkg_market_import AS
  TYPE t_price IS RECORD (
    staging_id NUMBER, row_no NUMBER, artifact_id NUMBER, symbol VARCHAR2(40), d_text VARCHAR2(40),
    o VARCHAR2(40), h VARCHAR2(40), l VARCHAR2(40), c VARCHAR2(40),
    ao VARCHAR2(40), ah VARCHAR2(40), al VARCHAR2(40), ac VARCHAR2(40), vol VARCHAR2(40),
    sha VARCHAR2(100), corr VARCHAR2(4000));
  TYPE t_prices IS TABLE OF t_price;
  TYPE t_share IS RECORD (
    staging_id NUMBER, row_no NUMBER, artifact_id NUMBER, symbol VARCHAR2(40), d_text VARCHAR2(40),
    shares VARCHAR2(40), sha VARCHAR2(100), bs_check VARCHAR2(40));
  TYPE t_shares IS TABLE OF t_share;
  TYPE t_cap IS RECORD (
    staging_id NUMBER, row_no NUMBER, artifact_id NUMBER, symbol VARCHAR2(40), y_text VARCHAR2(40),
    item VARCHAR2(60), provider VARCHAR2(60), issuer VARCHAR2(60), provider_sha VARCHAR2(100), issuer_sha VARCHAR2(100),
    page VARCHAR2(20), locator VARCHAR2(400), reason VARCHAR2(1000), reviewed_by VARCHAR2(200), reviewed_at VARCHAR2(60));
  TYPE t_caps IS TABLE OF t_cap;
  TYPE t_num IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
  TYPE t_dates IS TABLE OF DATE INDEX BY PLS_INTEGER;

  g_staging NUMBER;  -- staging row currently validated, for error attribution

  FUNCTION dec(v VARCHAR2, what VARCHAR2) RETURN NUMBER IS
  BEGIN
    IF v IS NULL OR NOT REGEXP_LIKE(v, '^[0-9]{1,12}(\.[0-9]{1,6})?$', 'c') THEN
      raise_application_error(-20512, 'Invalid decimal for ' || what || ': ' || SUBSTR(v, 1, 40));
    END IF;
    RETURN TO_NUMBER(v, '999999999990D999999', 'NLS_NUMERIC_CHARACTERS=''.,''');
  END;

  FUNCTION int(v VARCHAR2, what VARCHAR2) RETURN NUMBER IS
  BEGIN
    IF v IS NULL OR NOT REGEXP_LIKE(v, '^[0-9]{1,28}$', 'c') THEN
      raise_application_error(-20512, 'Invalid integer for ' || what || ': ' || SUBSTR(v, 1, 40));
    END IF;
    RETURN TO_NUMBER(v);
  END;

  FUNCTION iso_date(v VARCHAR2, what VARCHAR2) RETURN DATE IS
    d DATE;
  BEGIN
    IF v IS NULL OR NOT REGEXP_LIKE(v, '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', 'c') THEN
      raise_application_error(-20510, 'Invalid date for ' || what || ': ' || SUBSTR(v, 1, 40));
    END IF;
    d := TO_DATE(v DEFAULT NULL ON CONVERSION ERROR, 'FXYYYY-MM-DD');
    IF d IS NULL THEN raise_application_error(-20510, 'Invalid date for ' || what || ': ' || v); END IF;
    RETURN d;
  END;

  PROCEDURE check_ohlc(o NUMBER, h NUMBER, l NUMBER, c NUMBER, what VARCHAR2) IS
  BEGIN
    IF NOT (l > 0 AND l <= h AND o BETWEEN l AND h AND c BETWEEN l AND h) THEN
      raise_application_error(-20513, 'Inconsistent OHLC (' || what || ')');
    END IF;
  END;

  -- Artifact must exist with the expected kind, source and hash.
  FUNCTION artifact(p_id NUMBER, p_source VARCHAR2, p_kind VARCHAR2, p_sha VARCHAR2) RETURN NUMBER IS
    v_n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM source_artifacts a JOIN data_sources s ON s.source_id = a.source_id
     WHERE a.artifact_id = p_id AND s.source_code = p_source AND a.artifact_kind = p_kind AND a.sha256 = p_sha;
    IF v_n <> 1 THEN
      raise_application_error(-20509, 'Artifact ' || p_id || ' is not a ' || p_source || '/' || p_kind || ' file with hash ' || SUBSTR(p_sha, 1, 12));
    END IF;
    RETURN p_id;
  END;

  FUNCTION artifact_by_hash(p_source VARCHAR2, p_kind VARCHAR2, p_sha VARCHAR2) RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT a.artifact_id INTO v_id FROM source_artifacts a JOIN data_sources s ON s.source_id = a.source_id
     WHERE s.source_code = p_source AND a.artifact_kind = p_kind AND a.sha256 = p_sha;
    RETURN v_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    raise_application_error(-20509, 'No registered ' || p_source || '/' || p_kind || ' artifact with hash ' || SUBSTR(p_sha, 1, 12));
  END;

  FUNCTION security_of(p_symbol VARCHAR2) RETURN NUMBER IS
    v_id NUMBER;
  BEGIN
    SELECT security_id INTO v_id FROM securities WHERE symbol = p_symbol AND exchange_code = 'HOSE' AND security_kind = 'COMMON_STOCK';
    RETURN v_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN raise_application_error(-20508, 'Unknown HOSE security ' || SUBSTR(p_symbol, 1, 20));
  END;

  PROCEDURE move_head(p_security NUMBER, p_kind VARCHAR2, p_batch NUMBER) IS
  BEGIN
    MERGE INTO market_heads h USING (SELECT p_security sid, p_kind kind FROM dual) x
       ON (h.security_id = x.sid AND h.data_kind = x.kind)
     WHEN MATCHED THEN UPDATE SET h.batch_id = p_batch, h.lock_version = h.lock_version + 1, h.updated_at = SYSTIMESTAMP
     WHEN NOT MATCHED THEN INSERT (security_id, data_kind, batch_id, lock_version) VALUES (p_security, p_kind, p_batch, 1);
  END;

  FUNCTION reactivate(p_security NUMBER, p_kind VARCHAR2, p_batch NUMBER) RETURN BOOLEAN IS
    v_head NUMBER;
  BEGIN
    SELECT MAX(batch_id) INTO v_head FROM market_heads WHERE security_id = p_security AND data_kind = p_kind;
    IF v_head = p_batch THEN RETURN FALSE; END IF;
    move_head(p_security, p_kind, p_batch);
    RETURN TRUE;
  END;

  PROCEDURE create_batch(p_key VARCHAR2, p_mapping VARCHAR2, p_batch_id OUT NUMBER) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    v_contract VARCHAR2(40); v_mapping VARCHAR2(40);
  BEGIN
    IF p_key IS NULL OR p_mapping IS NULL OR p_mapping NOT IN (c_prices, c_shares, c_capital) THEN
      raise_application_error(-20501, 'Unsupported market mapping');
    END IF;
    BEGIN
      INSERT INTO etl_batches(batch_key, contract_version, mapping_version) VALUES (p_key, c_contract, p_mapping)
        RETURNING batch_id INTO p_batch_id;
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
      SELECT batch_id, contract_version, mapping_version INTO p_batch_id, v_contract, v_mapping FROM etl_batches WHERE batch_key = p_key;
      IF v_contract <> c_contract OR v_mapping <> p_mapping THEN raise_application_error(-20501, 'Batch key contract conflict'); END IF;
    END;
    COMMIT;
  EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
  END;

  FUNCTION market_batch(p_batch_id NUMBER, p_lock BOOLEAN) RETURN etl_batches%ROWTYPE IS
    b etl_batches%ROWTYPE;
  BEGIN
    IF p_lock THEN SELECT * INTO b FROM etl_batches WHERE batch_id = p_batch_id FOR UPDATE NOWAIT;
    ELSE SELECT * INTO b FROM etl_batches WHERE batch_id = p_batch_id; END IF;
    IF b.contract_version <> c_contract THEN raise_application_error(-20502, 'Not an erp-market batch'); END IF;
    RETURN b;
  EXCEPTION WHEN NO_DATA_FOUND THEN raise_application_error(-20502, 'Unknown batch');
  END;

  PROCEDURE stage_row(p_batch_id NUMBER, p_row_no NUMBER, p_kind VARCHAR2, p_symbol VARCHAR2,
    p_key VARCHAR2, p_artifact_id NUMBER, p_payload CLOB) IS
    b etl_batches%ROWTYPE; v_old staging_market_rows%ROWTYPE;
  BEGIN
    b := market_batch(p_batch_id, TRUE);
    BEGIN
      SELECT * INTO v_old FROM staging_market_rows WHERE batch_id = p_batch_id AND row_no = p_row_no;
      IF v_old.record_kind <> NVL(p_kind, '?') OR NVL(v_old.source_symbol, CHR(1)) <> NVL(p_symbol, CHR(1))
        OR NVL(v_old.record_key, CHR(1)) <> NVL(p_key, CHR(1)) OR NVL(v_old.artifact_id, -1) <> NVL(p_artifact_id, -1)
        OR p_payload IS NULL OR DBMS_LOB.COMPARE(v_old.payload, p_payload) <> 0 THEN
        raise_application_error(-20503, 'Same batch/row has different data; use a new batch key');
      END IF;
      RETURN;  -- idempotent replay of the same row
    EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
    END;
    IF b.batch_status <> 'CREATED' THEN raise_application_error(-20502, 'Batch is sealed; no new staging rows allowed'); END IF;
    IF p_row_no IS NULL OR p_row_no <= 0 OR p_row_no <> TRUNC(p_row_no) THEN raise_application_error(-20504, 'Invalid row number'); END IF;
    IF p_kind IS NULL OR p_kind NOT IN ('PRICE', 'SHARES', 'CAPITAL') THEN raise_application_error(-20504, 'Invalid record kind'); END IF;
    IF p_symbol IS NULL OR p_payload IS NULL THEN raise_application_error(-20504, 'Symbol and payload are required'); END IF;
    INSERT INTO staging_market_rows(batch_id, row_no, record_kind, artifact_id, source_symbol, record_key, payload)
      VALUES (p_batch_id, p_row_no, p_kind, p_artifact_id, p_symbol, p_key, p_payload);
  END;

  PROCEDURE seal_batch(p_batch_id NUMBER) IS
    b etl_batches%ROWTYPE; v_count NUMBER;
  BEGIN
    b := market_batch(p_batch_id, TRUE);
    IF b.batch_status IN ('STAGED', 'COMPLETED', 'PARTIAL', 'FAILED') THEN RETURN; END IF;
    IF b.batch_status <> 'CREATED' THEN raise_application_error(-20506, 'Cannot seal a processing batch'); END IF;
    SELECT COUNT(*) INTO v_count FROM staging_market_rows WHERE batch_id = p_batch_id;
    IF v_count = 0 THEN raise_application_error(-20505, 'Empty batch'); END IF;
    UPDATE etl_batches SET received_count = v_count, batch_status = 'STAGED' WHERE batch_id = p_batch_id;
  END;

  -- ---------------------------------------------------------------- PRICES
  FUNCTION price_group(p_batch NUMBER, p_symbol VARCHAR2) RETURN VARCHAR2 IS
    r t_prices; v_security NUMBER; v_artifact NUMBER; v_prev DATE; v_existing NUMBER; v_same NUMBER;
    o t_num; h t_num; l t_num; c t_num; ao t_num; ah t_num; al t_num; ac t_num; vol t_num; d t_dates;
    fu t_num; fa t_num;  -- is_corrected flags for the unadjusted / adjusted row
    v_field VARCHAR2(20); v_prov NUMBER; v_acc NUMBER; v_reason VARCHAR2(1000); v_evidence VARCHAR2(1000);
    v_price_id NUMBER; v_basis VARCHAR2(12); v_col VARCHAR2(8);
  BEGIN
    SELECT s.staging_id, s.row_no, s.artifact_id, j.symbol, j.d_text, j.o, j.h, j.l, j.c, j.ao, j.ah, j.al, j.ac, j.vol, j.sha, j.corr
      BULK COLLECT INTO r
      FROM staging_market_rows s,
           JSON_TABLE(s.payload, '$' COLUMNS (
             symbol VARCHAR2(40) PATH '$.symbol', d_text VARCHAR2(40) PATH '$.trading_date',
             o VARCHAR2(40) PATH '$.open', h VARCHAR2(40) PATH '$.high', l VARCHAR2(40) PATH '$.low', c VARCHAR2(40) PATH '$.close',
             ao VARCHAR2(40) PATH '$.adj_open', ah VARCHAR2(40) PATH '$.adj_high', al VARCHAR2(40) PATH '$.adj_low',
             ac VARCHAR2(40) PATH '$.adj_close', vol VARCHAR2(40) PATH '$.volume', sha VARCHAR2(100) PATH '$.artifact_sha256',
             corr VARCHAR2(4000) FORMAT JSON PATH '$.corrections')) j
     WHERE s.batch_id = p_batch AND s.source_symbol = p_symbol ORDER BY j.d_text, s.row_no;
    v_security := security_of(p_symbol);
    FOR i IN 1 .. r.COUNT LOOP
      g_staging := r(i).staging_id;
      IF r(i).symbol IS NULL OR r(i).symbol <> p_symbol THEN raise_application_error(-20504, 'Payload symbol differs from staging symbol'); END IF;
      IF i = 1 THEN v_artifact := artifact(r(i).artifact_id, 'VNDIRECT', 'JSON', r(i).sha);
      ELSIF NVL(r(i).artifact_id, -1) <> v_artifact OR r(i).sha <> r(1).sha THEN
        raise_application_error(-20522, 'All sessions of one symbol must come from one artifact');
      END IF;
      d(i) := iso_date(r(i).d_text, 'trading_date');
      IF d(i) NOT BETWEEN c_from AND c_to THEN raise_application_error(-20510, 'Session outside contract window: ' || r(i).d_text); END IF;
      IF TO_CHAR(d(i), 'DY', 'NLS_DATE_LANGUAGE=ENGLISH') IN ('SAT', 'SUN') THEN raise_application_error(-20510, 'Weekend session: ' || r(i).d_text); END IF;
      IF v_prev IS NOT NULL AND d(i) = v_prev THEN raise_application_error(-20511, 'Duplicate session ' || r(i).d_text); END IF;
      IF v_prev IS NOT NULL AND d(i) - v_prev > c_max_gap THEN
        raise_application_error(-20514, 'Calendar gap of ' || (d(i) - v_prev) || ' days before ' || r(i).d_text);
      END IF;
      v_prev := d(i);
      o(i) := dec(r(i).o, 'open'); h(i) := dec(r(i).h, 'high'); l(i) := dec(r(i).l, 'low'); c(i) := dec(r(i).c, 'close');
      ao(i) := dec(r(i).ao, 'adj_open'); ah(i) := dec(r(i).ah, 'adj_high'); al(i) := dec(r(i).al, 'adj_low'); ac(i) := dec(r(i).ac, 'adj_close');
      vol(i) := int(r(i).vol, 'volume');
      check_ohlc(o(i), h(i), l(i), c(i), 'unadjusted ' || r(i).d_text);
      check_ohlc(ao(i), ah(i), al(i), ac(i), 'adjusted ' || r(i).d_text);
      fu(i) := 0; fa(i) := 0;
      IF r(i).corr IS NOT NULL AND r(i).corr <> '[]' THEN
        FOR k IN (SELECT jc.field, jc.provider_value, jc.accepted_value, jc.reason, jc.evidence
                    FROM JSON_TABLE(r(i).corr, '$[*]' COLUMNS (field VARCHAR2(20) PATH '$.field',
                      provider_value VARCHAR2(40) PATH '$.provider_value', accepted_value VARCHAR2(40) PATH '$.accepted_value',
                      reason VARCHAR2(1000) PATH '$.reason', evidence VARCHAR2(1000) PATH '$.evidence')) jc) LOOP
          v_acc := CASE k.field WHEN 'open' THEN o(i) WHEN 'high' THEN h(i) WHEN 'low' THEN l(i) WHEN 'close' THEN c(i)
                     WHEN 'adj_open' THEN ao(i) WHEN 'adj_high' THEN ah(i) WHEN 'adj_low' THEN al(i) WHEN 'adj_close' THEN ac(i)
                     WHEN 'volume' THEN vol(i) END;
          IF v_acc IS NULL OR k.reason IS NULL OR k.evidence IS NULL
            OR dec(k.accepted_value, 'correction') <> v_acc OR dec(k.provider_value, 'correction') = v_acc THEN
            raise_application_error(-20515, 'Invalid price correction on ' || r(i).d_text || ' ' || NVL(k.field, '(null)'));
          END IF;
          IF k.field IN ('open', 'high', 'low', 'close', 'volume') THEN fu(i) := 1; END IF;
          IF k.field LIKE 'adj\_%' ESCAPE '\' OR k.field = 'volume' THEN fa(i) := 1; END IF;
        END LOOP;
      END IF;
    END LOOP;
    g_staging := NULL;
    IF r.COUNT = 0 THEN RETURN 'EMPTY'; END IF;

    -- Same artifact already imported: identical content is skipped, anything else is a conflict.
    SELECT MAX(batch_id) INTO v_existing FROM daily_prices WHERE security_id = v_security AND artifact_id = v_artifact;
    IF v_existing IS NOT NULL THEN
      SELECT COUNT(*) INTO v_same FROM daily_prices WHERE security_id = v_security AND batch_id = v_existing;
      IF v_same <> 2 * r.COUNT THEN raise_application_error(-20520, 'Artifact already imported with a different session count'); END IF;
      FOR i IN 1 .. r.COUNT LOOP
        SELECT COUNT(*) INTO v_same FROM daily_prices p
         WHERE p.security_id = v_security AND p.batch_id = v_existing AND p.trading_date = d(i)
           AND ((p.price_basis = 'UNADJUSTED' AND p.open_price = o(i) AND p.high_price = h(i) AND p.low_price = l(i) AND p.close_price = c(i))
             OR (p.price_basis = 'ADJUSTED' AND p.open_price = ao(i) AND p.high_price = ah(i) AND p.low_price = al(i) AND p.close_price = ac(i)))
           AND p.volume = vol(i);
        IF v_same <> 2 THEN
          g_staging := r(i).staging_id;
          raise_application_error(-20520, 'Artifact already imported with different values on ' || r(i).d_text);
        END IF;
      END LOOP;
      -- Re-importing an earlier series makes it current again (heads only ever point at imported batches).
      IF reactivate(v_security, 'PRICES', v_existing) THEN RETURN 'REACTIVATED'; END IF;
      RETURN 'SKIPPED';
    END IF;

    FORALL i IN 1 .. r.COUNT
      INSERT INTO daily_prices(security_id, trading_date, batch_id, artifact_id, price_basis, currency_code, price_multiplier,
        open_price, high_price, low_price, close_price, volume, is_corrected)
      VALUES (v_security, d(i), p_batch, v_artifact, 'UNADJUSTED', 'VND', 1000, o(i), h(i), l(i), c(i), vol(i), fu(i));
    FORALL i IN 1 .. r.COUNT
      INSERT INTO daily_prices(security_id, trading_date, batch_id, artifact_id, price_basis, currency_code, price_multiplier,
        open_price, high_price, low_price, close_price, volume, is_corrected)
      VALUES (v_security, d(i), p_batch, v_artifact, 'ADJUSTED', 'VND', 1000, ao(i), ah(i), al(i), ac(i), vol(i), fa(i));
    -- Field-level correction lineage (rare: a handful of rows).
    FOR i IN 1 .. r.COUNT LOOP
      IF fu(i) = 1 OR fa(i) = 1 THEN
        g_staging := r(i).staging_id;
        FOR k IN (SELECT jc.field, jc.provider_value, jc.reason, jc.evidence
                    FROM JSON_TABLE(r(i).corr, '$[*]' COLUMNS (field VARCHAR2(20) PATH '$.field',
                      provider_value VARCHAR2(40) PATH '$.provider_value', reason VARCHAR2(1000) PATH '$.reason',
                      evidence VARCHAR2(1000) PATH '$.evidence')) jc) LOOP
          FOR b IN (SELECT column_value basis FROM TABLE(sys.odcivarchar2list('UNADJUSTED', 'ADJUSTED'))) LOOP
            v_basis := b.basis;
            v_col := UPPER(REPLACE(k.field, 'adj_'));
            IF (v_basis = 'ADJUSTED' AND (k.field LIKE 'adj\_%' ESCAPE '\' OR k.field = 'volume'))
               OR (v_basis = 'UNADJUSTED' AND k.field NOT LIKE 'adj\_%' ESCAPE '\') THEN
              SELECT price_id INTO v_price_id FROM daily_prices
               WHERE security_id = v_security AND price_basis = v_basis AND batch_id = p_batch AND trading_date = d(i);
              v_prov := dec(k.provider_value, 'correction');
              v_acc := CASE v_col WHEN 'OPEN' THEN CASE v_basis WHEN 'ADJUSTED' THEN ao(i) ELSE o(i) END
                                  WHEN 'HIGH' THEN CASE v_basis WHEN 'ADJUSTED' THEN ah(i) ELSE h(i) END
                                  WHEN 'LOW' THEN CASE v_basis WHEN 'ADJUSTED' THEN al(i) ELSE l(i) END
                                  WHEN 'CLOSE' THEN CASE v_basis WHEN 'ADJUSTED' THEN ac(i) ELSE c(i) END
                                  ELSE vol(i) END;
              INSERT INTO price_corrections(price_id, field_name, provider_value, accepted_value, reason, evidence)
                VALUES (v_price_id, v_col, v_prov, v_acc, k.reason, k.evidence);
            END IF;
          END LOOP;
        END LOOP;
      END IF;
    END LOOP;
    g_staging := NULL;
    move_head(v_security, 'PRICES', p_batch);
    RETURN 'IMPORTED';
  END;

  -- ---------------------------------------------------------------- SHARES
  FUNCTION share_group(p_batch NUMBER, p_symbol VARCHAR2) RETURN VARCHAR2 IS
    r t_shares; v_security NUMBER; v_company NUMBER; v_artifact NUMBER; v_prev DATE; v_existing NUMBER; v_same NUMBER;
    d t_dates; n t_num; st DBMS_SQL.VARCHAR2_TABLE; v_cap NUMBER; v_treasury NUMBER;
  BEGIN
    SELECT s.staging_id, s.row_no, s.artifact_id, j.symbol, j.d_text, j.shares, j.sha, j.bs_check
      BULK COLLECT INTO r
      FROM staging_market_rows s,
           JSON_TABLE(s.payload, '$' COLUMNS (symbol VARCHAR2(40) PATH '$.symbol', d_text VARCHAR2(40) PATH '$.effective_date',
             shares VARCHAR2(40) PATH '$.shares_outstanding', sha VARCHAR2(100) PATH '$.artifact_sha256',
             bs_check VARCHAR2(40) PATH '$.bs_check')) j
     WHERE s.batch_id = p_batch AND s.source_symbol = p_symbol ORDER BY j.d_text, s.row_no;
    v_security := security_of(p_symbol);
    SELECT company_id INTO v_company FROM securities WHERE security_id = v_security;
    FOR i IN 1 .. r.COUNT LOOP
      g_staging := r(i).staging_id;
      IF r(i).symbol IS NULL OR r(i).symbol <> p_symbol THEN raise_application_error(-20504, 'Payload symbol differs from staging symbol'); END IF;
      IF i = 1 THEN v_artifact := artifact(r(i).artifact_id, 'VNDIRECT', 'JSON', r(i).sha);
      ELSIF NVL(r(i).artifact_id, -1) <> v_artifact OR r(i).sha <> r(1).sha THEN
        raise_application_error(-20522, 'All share counts of one symbol must come from one artifact');
      END IF;
      d(i) := iso_date(r(i).d_text, 'effective_date');
      IF d(i) NOT BETWEEN c_from AND c_to THEN raise_application_error(-20510, 'Effective date outside contract window: ' || r(i).d_text); END IF;
      IF v_prev IS NOT NULL AND d(i) = v_prev THEN raise_application_error(-20511, 'Duplicate effective date ' || r(i).d_text); END IF;
      v_prev := d(i);
      n(i) := int(r(i).shares, 'shares_outstanding');
      IF n(i) <= 0 THEN raise_application_error(-20512, 'Shares outstanding must be positive'); END IF;
      -- Year-end counts are reconciled here against the reviewed balance sheet (capital_facts).
      st(i) := 'NOT_YEAR_END';
      IF TO_CHAR(d(i), 'MM-DD') = '12-31' THEN
        SELECT MAX(CASE WHEN item_code = 'share_capital' THEN value_vnd END), MAX(CASE WHEN item_code = 'treasury_shares' THEN value_vnd END)
          INTO v_cap, v_treasury FROM capital_facts WHERE company_id = v_company AND fiscal_year = EXTRACT(YEAR FROM d(i));
        IF v_cap IS NULL OR v_treasury IS NULL OR v_treasury <> 0 OR MOD(v_cap, 10000) <> 0 THEN
          st(i) := 'UNCHECKED';
        ELSIF v_cap / 10000 = n(i) THEN
          st(i) := 'MATCHED_BS';
        ELSE
          raise_application_error(-20516, 'Year-end shares ' || n(i) || ' differ from share capital / par ' || (v_cap / 10000) || ' on ' || r(i).d_text);
        END IF;
      END IF;
      IF r(i).bs_check IS NOT NULL AND r(i).bs_check <> st(i) THEN
        raise_application_error(-20516, 'Source reconciliation ' || r(i).bs_check || ' differs from database check ' || st(i) || ' on ' || r(i).d_text);
      END IF;
    END LOOP;
    g_staging := NULL;
    IF r.COUNT = 0 THEN RETURN 'EMPTY'; END IF;
    SELECT MAX(batch_id) INTO v_existing FROM share_counts WHERE security_id = v_security AND artifact_id = v_artifact;
    IF v_existing IS NOT NULL THEN
      SELECT COUNT(*) INTO v_same FROM share_counts WHERE security_id = v_security AND batch_id = v_existing;
      IF v_same <> r.COUNT THEN raise_application_error(-20520, 'Artifact already imported with a different row count'); END IF;
      FOR i IN 1 .. r.COUNT LOOP
        SELECT COUNT(*) INTO v_same FROM share_counts
         WHERE security_id = v_security AND batch_id = v_existing AND effective_date = d(i) AND shares_outstanding = n(i);
        IF v_same <> 1 THEN g_staging := r(i).staging_id; raise_application_error(-20520, 'Artifact already imported with different values on ' || r(i).d_text); END IF;
      END LOOP;
      IF reactivate(v_security, 'SHARES', v_existing) THEN RETURN 'REACTIVATED'; END IF;
      RETURN 'SKIPPED';
    END IF;
    FORALL i IN 1 .. r.COUNT
      INSERT INTO share_counts(security_id, effective_date, shares_outstanding, batch_id, artifact_id, reconciliation_status)
      VALUES (v_security, d(i), n(i), p_batch, v_artifact, st(i));
    move_head(v_security, 'SHARES', p_batch);
    RETURN 'IMPORTED';
  END;

  -- ---------------------------------------------------------------- CAPITAL
  FUNCTION capital_group(p_batch NUMBER, p_symbol VARCHAR2, p_year VARCHAR2) RETURN VARCHAR2 IS
    r t_caps; v_security NUMBER; v_company NUMBER; v_year NUMBER; v_items NUMBER; v_existing NUMBER; v_same NUMBER;
    prov t_num; val t_num; pa t_num; ea t_num; pg t_num; v_stamp TIMESTAMP WITH TIME ZONE; v_equity NUMBER; v_nci NUMBER;
  BEGIN
    SELECT s.staging_id, s.row_no, s.artifact_id, j.symbol, j.y_text, j.item, j.provider, j.issuer, j.provider_sha, j.issuer_sha,
           j.page, j.locator, j.reason, j.reviewed_by, j.reviewed_at
      BULK COLLECT INTO r
      FROM staging_market_rows s,
           JSON_TABLE(s.payload, '$' COLUMNS (symbol VARCHAR2(40) PATH '$.symbol', y_text VARCHAR2(40) PATH '$.year',
             item VARCHAR2(60) PATH '$.item_code', provider VARCHAR2(60) PATH '$.provider_value', issuer VARCHAR2(60) PATH '$.issuer_value',
             provider_sha VARCHAR2(100) PATH '$.provider_sha256', issuer_sha VARCHAR2(100) PATH '$.issuer_sha256',
             page VARCHAR2(20) PATH '$.evidence_page', locator VARCHAR2(400) PATH '$.raw_locator',
             reason VARCHAR2(1000) PATH '$.correction_reason', reviewed_by VARCHAR2(200) PATH '$.reviewed_by',
             reviewed_at VARCHAR2(60) PATH '$.reviewed_at')) j
     WHERE s.batch_id = p_batch AND s.source_symbol = p_symbol AND SUBSTR(s.record_key, 1, 4) = p_year
     ORDER BY j.item, s.row_no;
    v_security := security_of(p_symbol);
    SELECT company_id INTO v_company FROM securities WHERE security_id = v_security;
    v_items := 0;
    FOR i IN 1 .. r.COUNT LOOP
      v_items := v_items + CASE r(i).item WHEN 'share_capital' THEN 1 WHEN 'treasury_shares' THEN 10 WHEN 'non_controlling_interest' THEN 100 ELSE 1000 END;
    END LOOP;
    IF r.COUNT <> 3 OR v_items <> 111 THEN
      g_staging := r(1).staging_id;
      raise_application_error(-20517, 'A company-year needs exactly share_capital, treasury_shares and non_controlling_interest');
    END IF;
    FOR i IN 1 .. r.COUNT LOOP
      g_staging := r(i).staging_id;
      IF r(i).symbol IS NULL OR r(i).symbol <> p_symbol OR r(i).y_text IS NULL OR r(i).y_text <> p_year THEN
        raise_application_error(-20504, 'Payload symbol/year differs from staging row');
      END IF;
      IF r(i).item NOT IN ('share_capital', 'treasury_shares', 'non_controlling_interest') THEN
        raise_application_error(-20517, 'Unknown capital item ' || SUBSTR(r(i).item, 1, 40));
      END IF;
      v_year := int(r(i).y_text, 'year');
      IF v_year NOT BETWEEN 2022 AND 2025 THEN raise_application_error(-20510, 'Fiscal year outside contract'); END IF;
      prov(i) := int(r(i).provider, 'provider_value'); val(i) := int(r(i).issuer, 'issuer_value');
      pa(i) := artifact(r(i).artifact_id, 'CAFEF', 'JSON', r(i).provider_sha);
      ea(i) := artifact_by_hash(p_symbol || '_IR', 'PDF', r(i).issuer_sha);
      pg(i) := int(r(i).page, 'evidence_page');
      IF pg(i) <= 0 THEN raise_application_error(-20512, 'Evidence page must be positive'); END IF;
      IF r(i).locator IS NULL OR r(i).reviewed_by IS NULL THEN raise_application_error(-20504, 'raw_locator and reviewed_by are required'); END IF;
      v_stamp := TO_TIMESTAMP_TZ(r(i).reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM');
      IF (prov(i) = val(i)) <> (r(i).reason IS NULL) THEN
        raise_application_error(-20518, 'Correction reason is required exactly when issuer and provider values differ (' || r(i).item || ')');
      END IF;
      IF r(i).item = 'non_controlling_interest' THEN v_nci := val(i); END IF;
    END LOOP;
    -- Equity attributable to the parent must stay positive against the current report set.
    SELECT MAX(effective_value_vnd) INTO v_equity FROM v_report_lines
     WHERE company_id = v_company AND fiscal_year = v_year AND scope_code = 'CONSOLIDATED' AND item_code = 'equity';
    IF v_equity IS NOT NULL AND v_equity - v_nci <= 0 THEN
      raise_application_error(-20519, 'Non-controlling interest is not below current total equity');
    END IF;
    g_staging := NULL;
    SELECT COUNT(*) INTO v_existing FROM capital_facts WHERE company_id = v_company AND fiscal_year = v_year;
    IF v_existing > 0 THEN
      FOR i IN 1 .. r.COUNT LOOP
        SELECT COUNT(*) INTO v_same FROM capital_facts
         WHERE company_id = v_company AND fiscal_year = v_year AND item_code = r(i).item AND value_vnd = val(i)
           AND provider_value_vnd = prov(i) AND evidence_artifact_id = ea(i) AND evidence_page = pg(i);
        IF v_same <> 1 THEN g_staging := r(i).staging_id; raise_application_error(-20520, 'Capital item already imported with different values: ' || r(i).item); END IF;
      END LOOP;
      RETURN 'SKIPPED';
    END IF;
    FOR i IN 1 .. r.COUNT LOOP
      INSERT INTO capital_facts(company_id, fiscal_year, item_code, provider_value_vnd, value_vnd, provider_artifact_id,
        evidence_artifact_id, evidence_page, raw_locator, correction_reason, reviewed_by, reviewed_at, batch_id)
      VALUES (v_company, v_year, r(i).item, prov(i), val(i), pa(i), ea(i), pg(i), r(i).locator, r(i).reason, r(i).reviewed_by,
        TO_TIMESTAMP_TZ(r(i).reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS.FFTZH:TZM'), p_batch);
    END LOOP;
    RETURN 'IMPORTED';
  END;

  PROCEDURE refresh_market_views IS
    v_owner VARCHAR2(128) := SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA');
  BEGIN
    DBMS_MVIEW.REFRESH(v_owner || '.MV_MARKET_DAILY,' || v_owner || '.MV_PRICE_MONTHLY', 'CC', atomic_refresh => TRUE);
  END;

  PROCEDURE process_batch(p_batch_id NUMBER) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
    b etl_batches%ROWTYPE; v_kind VARCHAR2(8); v_result VARCHAR2(12);
    v_imported NUMBER; v_rejected NUMBER; v_skipped NUMBER; v_prices_changed BOOLEAN := FALSE;
    v_error VARCHAR2(2000); v_code VARCHAR2(60);
  BEGIN
    b := market_batch(p_batch_id, TRUE);
    IF b.batch_status IN ('COMPLETED', 'PARTIAL', 'FAILED') THEN COMMIT; RETURN; END IF;
    IF b.batch_status <> 'STAGED' THEN raise_application_error(-20506, 'Seal and commit the batch before processing'); END IF;
    v_kind := CASE b.mapping_version WHEN c_prices THEN 'PRICE' WHEN c_shares THEN 'SHARES' ELSE 'CAPITAL' END;
    -- IMPORTING is the durable ownership claim (same convention as pkg_financial_import).
    UPDATE etl_batches SET batch_status = 'IMPORTING' WHERE batch_id = p_batch_id;
    COMMIT;
    FOR g IN (SELECT source_symbol, CASE WHEN v_kind = 'CAPITAL' THEN SUBSTR(record_key, 1, 4) END grp_year,
                     MIN(staging_id) first_id, SUM(CASE WHEN record_kind <> v_kind THEN 1 ELSE 0 END) wrong_kind
                FROM staging_market_rows WHERE batch_id = p_batch_id
               GROUP BY source_symbol, CASE WHEN v_kind = 'CAPITAL' THEN SUBSTR(record_key, 1, 4) END
               ORDER BY 1, 2) LOOP
      SAVEPOINT one_group;
      g_staging := g.first_id;
      BEGIN
        IF g.wrong_kind > 0 THEN raise_application_error(-20507, 'Record kind does not match mapping ' || b.mapping_version); END IF;
        -- Serialise concurrent batches touching the same security.
        FOR x IN (SELECT security_id FROM securities WHERE symbol = g.source_symbol AND exchange_code = 'HOSE' FOR UPDATE) LOOP NULL; END LOOP;
        v_result := CASE v_kind WHEN 'PRICE' THEN price_group(p_batch_id, g.source_symbol)
                                WHEN 'SHARES' THEN share_group(p_batch_id, g.source_symbol)
                                ELSE capital_group(p_batch_id, g.source_symbol, g.grp_year) END;
        UPDATE staging_market_rows SET row_status = CASE v_result WHEN 'REACTIVATED' THEN 'SKIPPED' ELSE v_result END
         WHERE batch_id = p_batch_id AND source_symbol = g.source_symbol
           AND (g.grp_year IS NULL OR SUBSTR(record_key, 1, 4) = g.grp_year);
        IF v_kind = 'PRICE' AND v_result IN ('IMPORTED', 'REACTIVATED') THEN v_prices_changed := TRUE; END IF;
        COMMIT;
      EXCEPTION WHEN OTHERS THEN
        v_error := SUBSTR(SQLERRM, 1, 1900); v_code := 'MARKET_' || TO_CHAR(ABS(SQLCODE));
        ROLLBACK TO one_group;
        UPDATE staging_market_rows SET row_status = 'REJECTED'
         WHERE batch_id = p_batch_id AND DECODE(source_symbol, g.source_symbol, 1, 0) = 1
           AND (g.grp_year IS NULL OR SUBSTR(record_key, 1, 4) = g.grp_year);
        INSERT INTO etl_errors(batch_id, staging_id, market_staging_id, error_code, error_message)
          VALUES (p_batch_id, NULL, NVL(g_staging, g.first_id), v_code, v_error);
        COMMIT;
      END;
    END LOOP;
    SELECT COUNT(CASE WHEN row_status = 'IMPORTED' THEN 1 END), COUNT(CASE WHEN row_status = 'REJECTED' THEN 1 END),
           COUNT(CASE WHEN row_status = 'SKIPPED' THEN 1 END)
      INTO v_imported, v_rejected, v_skipped FROM staging_market_rows WHERE batch_id = p_batch_id;
    IF v_imported + v_rejected + v_skipped <> b.received_count THEN raise_application_error(-20521, 'Batch row counters do not reconcile'); END IF;
    UPDATE etl_batches SET imported_count = v_imported, rejected_count = v_rejected, skipped_count = v_skipped,
      batch_status = CASE WHEN v_rejected = 0 THEN 'COMPLETED' WHEN v_imported + v_skipped = 0 THEN 'FAILED' ELSE 'PARTIAL' END,
      finished_at = SYSTIMESTAMP WHERE batch_id = p_batch_id;
    COMMIT;
    IF v_prices_changed THEN refresh_market_views; END IF;
  EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
  END;
END;
/

-- ETL facade: the six financial procedures are unchanged; market procedures are added with
-- the pilot scope (FPT/HPG/VNM) enforced here, like the financial ones.
CREATE OR REPLACE PACKAGE pkg_etl_api AUTHID DEFINER AS
  PROCEDURE register_artifact(p_source_code VARCHAR2,p_source_name VARCHAR2,p_kind VARCHAR2,p_hash VARCHAR2,
    p_path VARCHAR2,p_url VARCHAR2,p_collected_at TIMESTAMP WITH TIME ZONE,p_note VARCHAR2,p_artifact_id OUT NUMBER);
  PROCEDURE create_batch(p_key VARCHAR2,p_contract VARCHAR2,p_mapping VARCHAR2,p_batch_id OUT NUMBER);
  PROCEDURE stage_fact(p_batch_id NUMBER,p_row_no NUMBER,p_symbol VARCHAR2,p_year VARCHAR2,
    p_item VARCHAR2,p_value VARCHAR2,p_artifact_id NUMBER,p_payload CLOB);
  PROCEDURE seal_batch(p_batch_id NUMBER);
  PROCEDURE process_batch(p_batch_id NUMBER);
  PROCEDURE calculate_current(p_run_key VARCHAR2,p_symbol VARCHAR2,p_year NUMBER,p_scope VARCHAR2,p_run_id OUT NUMBER);
  -- erp-market/1.0.0
  PROCEDURE create_market_batch(p_key VARCHAR2, p_mapping VARCHAR2, p_batch_id OUT NUMBER);
  PROCEDURE stage_market_row(p_batch_id NUMBER, p_row_no NUMBER, p_kind VARCHAR2, p_symbol VARCHAR2,
    p_key VARCHAR2, p_artifact_id NUMBER, p_payload CLOB);
  PROCEDURE seal_market_batch(p_batch_id NUMBER);
  PROCEDURE process_market_batch(p_batch_id NUMBER);
END;
/
CREATE OR REPLACE PACKAGE BODY pkg_etl_api AS
  PROCEDURE register_artifact(p_source_code VARCHAR2,p_source_name VARCHAR2,p_kind VARCHAR2,p_hash VARCHAR2,
    p_path VARCHAR2,p_url VARCHAR2,p_collected_at TIMESTAMP WITH TIME ZONE,p_note VARCHAR2,p_artifact_id OUT NUMBER) IS
  BEGIN
    IF p_source_code IS NULL OR p_kind IS NULL OR
      NOT ((p_source_code='CAFEF' AND p_kind='JSON') OR
           (p_source_code IN ('FPT_IR','HPG_IR','VNM_IR') AND p_kind='PDF') OR
           (p_source_code='PILOT_REVIEW' AND p_kind='CSV') OR
           (p_source_code='VNDIRECT' AND p_kind='JSON')) THEN
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
  PROCEDURE create_market_batch(p_key VARCHAR2, p_mapping VARCHAR2, p_batch_id OUT NUMBER) IS
  BEGIN pkg_market_import.create_batch(p_key, p_mapping, p_batch_id); END;
  PROCEDURE stage_market_row(p_batch_id NUMBER, p_row_no NUMBER, p_kind VARCHAR2, p_symbol VARCHAR2,
    p_key VARCHAR2, p_artifact_id NUMBER, p_payload CLOB) IS
  BEGIN
    IF p_symbol IS NULL OR p_symbol NOT IN ('FPT','HPG','VNM') THEN
      raise_application_error(-20303, 'Symbol is outside the accepted pilot');
    END IF;
    pkg_market_import.stage_row(p_batch_id, p_row_no, p_kind, p_symbol, p_key, p_artifact_id, p_payload);
  END;
  PROCEDURE seal_market_batch(p_batch_id NUMBER) IS
  BEGIN pkg_market_import.seal_batch(p_batch_id); END;
  PROCEDURE process_market_batch(p_batch_id NUMBER) IS
  BEGIN pkg_market_import.process_batch(p_batch_id); END;
END;
/
