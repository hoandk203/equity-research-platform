-- Execute as ERP_MONITOR:
--   python3 Quan_Tri_CSDL/scripts/check_oracle_audit.py --monitor Quan_Tri_CSDL/sql/016_monitoring_queries.sql
-- Each query is self-contained; output columns are '|' separated for logs.

-- M1. Sessions of ERP accounts and anyone currently blocked or blocking.
SELECT 'SESSION='||s.sid||'|'||s.serial#||'|'||s.username||'|'||s.status||'|'||NVL(s.module,'-')||'|'||
       NVL(s.client_identifier,'-')||'|'||NVL(s.sql_id,'-')||'|'||s.event||'|'||NVL(TO_CHAR(s.blocking_session),'-')||'|'||
       s.seconds_in_wait
FROM v$session s
WHERE s.type = 'USER' AND (s.username LIKE 'ERP%' OR s.blocking_session IS NOT NULL
      OR s.sid IN (SELECT blocking_session FROM v$session WHERE blocking_session IS NOT NULL));

-- M2. Blocking chains with the locked ERP object.
SELECT 'BLOCK='||w.sid||'|'||NVL(w.username,'-')||'|'||w.event||'|'||w.seconds_in_wait||'|'||
       h.sid||'|'||NVL(h.username,'-')||'|'||NVL(h.module,'-')||'|'||
       NVL((SELECT o.owner||'.'||o.object_name FROM v$locked_object lo JOIN dba_objects o ON o.object_id = lo.object_id
            WHERE lo.session_id = h.sid AND o.owner LIKE 'ERP%' FETCH FIRST 1 ROW ONLY),'-')
FROM v$session w JOIN v$session h ON h.sid = w.blocking_session
WHERE w.blocking_session IS NOT NULL;

-- M3. Most expensive cached SQL parsed by ERP accounts (per execution).
SELECT 'TOPSQL='||sql_id||'|'||parsing_schema_name||'|'||executions||'|'||
       ROUND(elapsed_time/GREATEST(executions,1)/1000,3)||'|'||ROUND(buffer_gets/GREATEST(executions,1))||'|'||
       SUBSTR(REPLACE(sql_text,CHR(10),' '),1,120)
FROM v$sql
WHERE parsing_schema_name LIKE 'ERP%'
ORDER BY buffer_gets/GREATEST(executions,1) DESC
FETCH FIRST 10 ROWS ONLY;

-- M4. ERP tablespace usage against its ceiling. Computed from segments/datafiles so it is
--     exact immediately (DBA_TABLESPACE_USAGE_METRICS is refreshed in the background and
--     drops a tablespace for a while after it was taken offline and back online).
SELECT 'SPACE='||f.tablespace_name||'|'||ROUND(NVL(s.used,0)/1048576,1)||'|'||ROUND(f.alloc/1048576)||'|'||
       ROUND(f.ceiling/1048576)||'|'||ROUND(100*NVL(s.used,0)/f.ceiling,2)
FROM (SELECT tablespace_name, SUM(bytes) alloc, SUM(GREATEST(maxbytes,bytes)) ceiling
      FROM dba_data_files WHERE tablespace_name LIKE 'ERP%' GROUP BY tablespace_name) f
LEFT JOIN (SELECT tablespace_name, SUM(bytes) used FROM dba_segments
           WHERE tablespace_name LIKE 'ERP%' GROUP BY tablespace_name) s ON s.tablespace_name = f.tablespace_name;

-- M5. Audit summary for the last 24 hours, ERP policies only.
SELECT 'AUDIT='||dbusername||'|'||action_name||'|'||NVL(object_schema,'-')||'|'||return_code||'|'||COUNT(*)
FROM unified_audit_trail
WHERE event_timestamp > SYSTIMESTAMP - INTERVAL '1' DAY
  AND (unified_audit_policies LIKE '%ERP\_%' ESCAPE '\')
GROUP BY dbusername, action_name, object_schema, return_code
ORDER BY COUNT(*) DESC;
