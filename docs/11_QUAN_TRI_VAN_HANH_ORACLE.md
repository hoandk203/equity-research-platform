# Quản trị vận hành Oracle: lưu trữ, audit, tối ưu, sao lưu và phục hồi

Thực hiện ngày 08/11/2026 (giờ Việt Nam; dấu thời gian trong bằng chứng là UTC 07/11). PDB `FREEPDB1`, schema chính `ERP_DESIGN_V1`. THACSI không bị sửa; tablespace USERS của THACSI luôn online trong mọi thao tác.

## 1. Tóm tắt

| Yêu cầu | Đã làm | Kết quả kiểm chứng | Bằng chứng |
|---|---|---|---|
| NFR-04 tablespace/quota | Tablespace `ERP_DATA` riêng, chuyển toàn bộ 91 segment, quota 256 MB, quota USERS = 0 | 23 bảng giữ nguyên nội dung; owner bị chặn cấp phát ở USERS (`ORA-01536`) | [oracle_storage](../evidence/oracle_storage/validation.json) |
| NFR-05 audit/giám sát | 4 policy unified audit, tài khoản `ERP_MONITOR`, 5 truy vấn giám sát | 10/10 kiểm tra; bắt được chuỗi khóa thật giữa hai session | [oracle_audit](../evidence/oracle_audit/validation.json) |
| NFR-06 tối ưu | Đo 7 truy vấn API trên 200× khối lượng pilot; sửa 1 view, thêm 1 index | Q1/Q4 giảm ~25 lần thời gian và ~50 lần buffer gets; kết quả trả về giống hệt | [oracle_performance](../evidence/oracle_performance/comparison.json) |
| NFR-08 khôi phục | Data Pump vào schema tách biệt; RMAN backup + mất datafile + restore/recover | 23/23 bảng khớp; giao dịch sau backup còn nguyên; gián đoạn 6,4 giây | [oracle_backup_restore](../evidence/oracle_backup_restore/physical_recovery.json) |

Sau toàn bộ đợt: 23 bảng/175 cột/35 FK/14 trigger ENABLED/4 package/9 view, 0 object INVALID, 0 lỗi biên dịch. `ERP_APP` vẫn đọc khớp 72 chỉ số và 171 lineage. 38 ca phân quyền chạy lại sau tối ưu đều đạt ([kết quả](../evidence/oracle_access_tests_after_tuning/validation.json)); 13 Python tests đạt.

Trước mọi thay đổi đã export schema chính bằng Data Pump (`erp_design_v1_pre_admin.dmp`) làm bản an toàn.

## 2. Lưu trữ và quota

[sql/013_storage_tablespace.sql](../sql/013_storage_tablespace.sql), chạy bằng [apply_storage.py](../scripts/apply_storage.py).

| Tablespace | Datafile | Khởi tạo / trần | Chứa |
|---|---|---|---|
| `ERP_DATA` | `FREEPDB1/erp_data01.dbf` | 32 MB / 512 MB | Schema chính `ERP_DESIGN_V1` |
| `ERP_PERF_DATA` | `FREEPDB1/erp_perf_data01.dbf` | 32 MB / 400 MB | Schema không phục vụ ứng dụng: `ERP_PERF_TEST` (benchmark), `ERP_RESTORE_CHECK` (bản phục hồi logic) |

- Mọi bảng (kể cả LOB `payload`, `old_data`, `new_data`) được chuyển bằng `ALTER TABLE … MOVE ONLINE`, index được `REBUILD ONLINE`. Không có thời gian dừng đọc.
- Quota của owner: 256 MB trên `ERP_DATA`, 0 trên USERS. Tài khoản dịch vụ có quota 0.
- Tách tablespace có hai mục đích: dữ liệu ERP không lẫn với THACSI trong USERS, và backup/phục hồi chỉ cần nhắm vào ERP (mục 6).
- `ERP_IMPORT_TEST` vẫn nằm trong USERS (quota 64 MB) vì chỉ chứa fixture kiểm thử.
- Phát hiện khi kiểm kê: trigger `TRG_ARTIFACT_IMMUTABLE` bị INVALID từ lúc chạy migration 004 (`ALTER TABLE`). Trigger vẫn hoạt động vì Oracle tự biên dịch lại khi trigger chạy. Đã compile lại.

## 3. Bốn vai trò tài khoản

| Tài khoản | Role | Được làm | Không được làm |
|---|---|---|---|
| `ERP_DESIGN_V1` | — | Sở hữu đối tượng | Đăng nhập (`NO AUTHENTICATION`) |
| `ERP_APP` | `ERP_APP_READ` | Đọc 6 view nghiệp vụ | Đọc bảng, gọi package, đọc view vận hành |
| `ERP_ETL` | `ERP_ETL_RUN` | Đọc 9 view, gọi `pkg_etl_api` | Đọc/ghi bảng trực tiếp |
| `ERP_MONITOR` | `ERP_MONITOR_ROLE` | Đọc audit trail (`AUDIT_VIEWER`), session, khóa, SQL, dung lượng | Đọc dữ liệu ERP, tắt hay sửa audit |

`ERP_MONITOR` là tài khoản thứ tư, mới trong đợt này. Quyền cấp ở [sql/015](../sql/015_monitoring_role.sql); mật khẩu ngẫu nhiên lưu cùng file local như docs/10.

## 4. Audit và giám sát

### Policy

[sql/014_audit_policies.sql](../sql/014_audit_policies.sql):

| Policy | Ghi lại | Áp cho |
|---|---|---|
| `ERP_DATA_CHANGE_POL` | INSERT, UPDATE, DELETE, LOCK, ALTER trên 23 bảng của cả `ERP_DESIGN_V1` và `ERP_IMPORT_TEST` (230 hành động) | Mọi user, kể cả SYS |
| `ERP_ETL_API_POL` | EXECUTE trên `pkg_etl_api` | Mọi user |
| `ERP_SESSION_POL` | LOGON, LOGOFF | 5 tài khoản dịch vụ |
| `ERP_SERVICE_DENIED_POL` | Mọi hành động bị từ chối | 5 tài khoản dịch vụ |

Policy có sẵn `ORA_LOGIN_LOGOUT` của Oracle chỉ ghi đăng nhập *thất bại*, nên cần `ERP_SESSION_POL` để có cả đăng nhập thành công. DDL của SYS đã được ghi bởi policy có sẵn.

Lệnh SELECT của ứng dụng không bị audit, để tránh phình audit trail theo lượng truy cập; việc theo dõi truy vấn dùng `v$sql` (truy vấn M3).

**Audit khác lịch sử nghiệp vụ.** `unified_audit_trail` ghi *ai làm gì ở mức database*, kể cả SYS và các lần bị từ chối. `business_change_log` ghi *chuyển trạng thái nghiệp vụ* do package viết. Hai nguồn không thay thế nhau.

### Kết quả kiểm chứng

[check_oracle_audit.py](../scripts/check_oracle_audit.py) tạo sự kiện thật rồi đọc lại bằng `ERP_MONITOR`. 10/10 kiểm tra đạt:

- Đủ 4 policy được bật, 230 hành động trên bảng.
- Đăng nhập của `ERP_TEST_APP`, `ERP_TEST_ETL`, `ERP_APP`, `ERP_MONITOR` được ghi.
- Lệnh đọc bảng gốc bị từ chối được ghi trên cả hai schema. Oracle ghi mã **2004** (security violation) thay vì 942, để không lộ việc bảng có tồn tại hay không.
- Lệnh gọi ETL facade được ghi kèm `client_identifier` mà phiên ETL đặt. Backend sau này nên đặt `DBMS_SESSION.SET_IDENTIFIER` theo request để truy được từng thao tác.
- INSERT do package definer-rights thực hiện được ghi `dbusername = ERP_TEST_ETL`, `current_user = ERP_IMPORT_TEST`. Audit cho biết đúng người gọi chứ không chỉ chủ package.
- SYS cố UPDATE bảng fact bất biến bị trigger từ chối (mã 20002) và vẫn được ghi.
- Hai lệnh `LOCK TABLE` của hai session được ghi.
- `ERP_MONITOR` không đọc được view nghiệp vụ và không tắt được policy (`NOAUDIT` bị từ chối, mã 1031).
- Dữ liệu schema chính không đổi.

Mỗi lần chạy script tạo một batch `audit-<tag>` trạng thái CREATED trong schema kiểm thử.

### Giám sát

[sql/016_monitoring_queries.sql](../sql/016_monitoring_queries.sql), chạy bằng `python3 Quan_Tri_CSDL/scripts/check_oracle_audit.py --monitor Quan_Tri_CSDL/sql/016_monitoring_queries.sql`:

| Truy vấn | Nội dung |
|---|---|
| M1 | Session của tài khoản ERP và mọi session đang chặn/bị chặn |
| M2 | Chuỗi chặn kèm đối tượng ERP bị khóa |
| M3 | 10 câu SQL tốn nhất (buffer gets/lần) do tài khoản ERP chạy |
| M4 | Dung lượng tablespace ERP so với trần |
| M5 | Tổng hợp audit 24 giờ theo user/hành động/mã trả về |

Tình huống khóa đã tái hiện: session A giữ `LOCK TABLE … EXCLUSIVE` 20 giây, session B chờ. `ERP_MONITOR` thấy B ở sự kiện `enq: TM - contention`, bị A chặn, trên đối tượng `ERP_IMPORT_TEST.COMPANIES`. B lấy được khóa sau khi A rollback. [Snapshot](../evidence/oracle_audit/monitoring_snapshot.txt).

M4 tính từ `dba_segments`/`dba_data_files`. `DBA_TABLESPACE_USAGE_METRICS` được làm mới ngầm và đã tạm mất dòng `ERP_DATA` sau lần offline/online ở mục 6.

## 5. Tối ưu

### Dữ liệu và cách đo

Dữ liệu pilot thật quá nhỏ để đo (72 kết quả). [build_perf_dataset.py](../scripts/build_perf_dataset.py) dựng `ERP_PERF_TEST` từ chính các file SQL của production (001/002/005/006/007/008), rồi nhân bản dữ liệu pilot 200 lần với ID dịch chuyển và mã có hậu tố (`VNM_57`):

| Bảng | Số dòng |
|---|---:|
| companies | 600 |
| report_sets | 2.400 |
| financial_facts | 26.400 |
| staging_facts | 52.800 |
| calculation_runs | 1.800 |
| metric_results | 14.400 |
| metric_input_facts | 34.200 |

Tổng 202 MB. Quan hệ và phân bố trạng thái giống pilot; đây **không** phải dữ liệu tài chính mới và không dùng làm nguồn ứng dụng.

[benchmark_oracle.py](../scripts/benchmark_oracle.py): mỗi truy vấn chạy 3 lần khởi động + 20 lần đo trong một khối PL/SQL, lấy hết mọi dòng. Ghi median, p90, buffer gets/lần từ `v$sql`, plan thực tế (`ALLSTATS LAST`) và hash tập kết quả. Trước và sau dùng cùng dữ liệu, cùng câu lệnh, cùng instance; buffer cache ấm, không flush vì instance dùng chung.

### Kết quả

| Truy vấn | Mục đích | Dòng | Median trước → sau (ms) | Buffer gets trước → sau |
|---|---|---:|---:|---:|
| Q1 | Chi tiết: 8 chỉ số của một mã/năm | 8 | 60,9 → **2,5** | 5.970 → **101** |
| Q2 | Sàng lọc ROE ≥ 15% và Nợ/TS ≤ 60% | 400 | 26,4 → 26,4 | 3.062 → 3.027 |
| Q3 | Lineage lọc theo mã/năm/chỉ số | 3 | 98,8 → 100,7 | 19.974 → 19.928 |
| Q4 | So sánh 3 mã cùng năm | 24 | 60,8 → **2,3** | 5.922 → **124** |
| Q5 | Lịch sử run của một mã | 24 | 3,0 → 2,3 | 74 → 73 |
| Q6 | Run tính của một mã | 3 | 2,1 → 2,2 | 80 → 80 |
| Q7 | Lineage theo `result_id` | 3 | 2,3 → 2,1 | 301 → **125** |

Mọi truy vấn trả **cùng số dòng và cùng hash** trước và sau.

### Hai thay đổi

**1. View `v_current_metrics`** ([sql/008](../sql/008_read_views.sql)). Plan trước cho thấy điều kiện `symbol` không được đẩy xuống dưới `ROW_NUMBER() OVER (PARTITION BY company_id …)`. View tính đủ 4.800 kết quả năm 2025 của 600 doanh nghiệp rồi mới lọc lấy 8 dòng. Phép kiểm tra quality issue chạy 4.800 lần, chiếm 4.800/5.942 buffer gets.

Sửa: thêm `symbol, company_key` vào `PARTITION BY`. Hai cột này phụ thuộc hàm vào `company_id` (`v_company_directory` chọn một mã niêm yết cho mỗi doanh nghiệp), nên không đổi kết quả. Nhờ đó Oracle được phép đẩy điều kiện `symbol` xuống trước hàm cửa sổ. Q1 và Q4 hưởng lợi trực tiếp.

**2. Index `staging_facts_ix3`** ([sql/017](../sql/017_performance_tuning.sql)) trên `(batch_id, artifact_id, source_symbol, fiscal_year_raw, item_code_raw)`. `v_metric_lineage` tìm dòng staging chứa ID/trang PDF bằng 5 cột này; trước đó chỉ có index trên `artifact_id`, vốn dùng chung cho nhiều dòng.

Để đo đúng tác dụng riêng của index, Q7 được đo hai lần trên cùng view: index `INVISIBLE` (301 gets, đọc 396 mục qua `staging_facts_u1`) và `VISIBLE` (125 gets, đọc đúng 3 mục).

### Điều không cải thiện và vì sao

- **Q3** vẫn full scan `STAGING_FACTS` (≈ 19.000 gets). Optimizer ước lượng khoảng 3.400 dòng thay vì 3 khi đi qua chuỗi view có hàm cửa sổ, nên chọn hash join. Không thêm hint vào view, vì hint sẽ làm chậm trường hợp đọc toàn bộ lineage. **Khuyến nghị cho API:** màn hình chi tiết đã có `result_id`, nên gọi lineage theo `result_id` như Q7. Cách này nhanh hơn Q3 khoảng 160 lần buffer gets (125 so với 19.928).
- **Q2** cần duyệt mọi doanh nghiệp theo bản chất, 26 ms cho 600 doanh nghiệp là chấp nhận được. Không thêm index cho `quality_issues` vì bảng đang trống, không đo được tác dụng.

Hai thay đổi đã áp cho cả ba schema. Trên schema chính, [apply_tuning.py](../scripts/apply_tuning.py) xác nhận dữ liệu, 72/171, grant của role (`CREATE OR REPLACE VIEW` giữ nguyên grant) và lần đọc bằng APP không đổi.

## 6. Sao lưu và phục hồi

[backup_restore_oracle.py](../scripts/backup_restore_oracle.py) gồm hai bước tách riêng.

### Logic — Data Pump vào schema tách biệt (`--logical`)

- Export schema chính hiện tại thành `erp_design_v1_20261107_172642.dmp`.
- Import bản export **trước đợt quản trị** (`erp_design_v1_pre_admin.dmp`) vào schema mới `ERP_RESTORE_CHECK`, trong `ERP_PERF_DATA`. Bỏ grant để tài khoản dịch vụ không thấy bản sao này (đã thử: `ORA-00942`).
- So vân tay (số dòng + hash nội dung) từng bảng: **23/23 bảng khớp** schema chính. Chỉ số qua view cũng khớp: 72 VALID, 171 lineage, cùng hash. Kết quả này chứng minh việc chuyển tablespace, audit và tối ưu không đổi dữ liệu nào.
- Data Pump báo 158 cảnh báo `ORA-39346` trên COMMENT, vì bản export đầu chạy không có `NLS_LANG`. Đã so cả 175 comment cột (135 có tiếng Việt): giống hệt, không mất dữ liệu. Không có lỗi nào khác. Script nay đặt `NLS_LANG=.AL32UTF8` cho Data Pump.

Đây là phục hồi logic, **không** thay cho phục hồi vật lý.

### Vật lý — RMAN, mất datafile, restore + recover (`--physical`)

| Bước | Thực tế |
|---|---|
| Backup | `BACKUP AS COMPRESSED BACKUPSET TABLESPACE FREEPDB1:ERP_DATA`, 1 piece 1,35 MB, kiểm tra đọc được bằng `RESTORE … VALIDATE`. Checkpoint SCN 6.196.587 |
| Giao dịch sau backup | `ERP_ETL` gọi lại batch nhập qua facade: batch 41 COMPLETED, nhận 132, bỏ qua 132 do trùng. SCN sau giao dịch 6.197.472 |
| Sự cố | `ALTER TABLESPACE ERP_DATA OFFLINE IMMEDIATE`, datafile bị đổi tên (mất). APP đọc → `ORA-00376`. Thử online → `ORA-01157`. USERS vẫn online |
| Phục hồi | `RESTORE TABLESPACE FREEPDB1:ERP_DATA` + `RECOVER TABLESPACE FREEPDB1:ERP_DATA` mất 5,2 giây, rồi `ALTER TABLESPACE ERP_DATA ONLINE` |
| Kiểm chứng | Vân tay 23 bảng **bằng trạng thái sau giao dịch**; batch 41 còn; 72/171 và hash chỉ số khớp; 0 object INVALID; APP đọc lại 72 dòng |

Tổng thời gian gián đoạn của ERP: **6,4 giây**. Redo dùng để recover lấy từ online redo log, vì phần sinh ra sau backup chưa kịp archive. Media recovery hoàn tất, nên giao dịch đã commit sau backup không bị mất. File bị "mất" chỉ xóa hẳn sau khi phục hồi thành công.

Bản backup nằm ở `/opt/oracle/oradata/erp_backup/` trong volume `oracle_oracle_data`, gồm `dpump/` (3 bản dump) và `rman/`.

## 7. Thứ tự dựng mới

Trên database trống, chạy bằng SYSDBA theo thứ tự:

1. `013` (tablespace) → tạo owner trong `ERP_DATA`
2. `001` → `002` → `005` → `006` → `007` → `008` → `017` (với owner là current schema)
3. `009` → `018` → tạo role/user (`oracle_access.py`) → `010`
4. `015` (cần user `ERP_MONITOR`) → `014`

`004` chỉ dành cho schema cũ. Các runner hiện có làm phần lớn việc này cho hai schema dự án nhưng chưa gom thành một lệnh duy nhất.

Lệnh từ thư mục `CSDL_HocSau`:

```bash
python3 Quan_Tri_CSDL/scripts/apply_storage.py
python3 Quan_Tri_CSDL/scripts/check_oracle_audit.py
python3 Quan_Tri_CSDL/scripts/build_perf_dataset.py --copies 200   # chỉ chạy một lần
python3 Quan_Tri_CSDL/scripts/benchmark_oracle.py --label OPT
python3 Quan_Tri_CSDL/scripts/apply_tuning.py
python3 Quan_Tri_CSDL/scripts/backup_restore_oracle.py --logical
python3 Quan_Tri_CSDL/scripts/backup_restore_oracle.py --physical
```

## 8. Giới hạn và rủi ro còn lại

- **Đĩa đầy 98%, còn khoảng 1,2 GB.** Volume Oracle dùng chung phân vùng. Nếu đĩa đầy, tiến trình archive sẽ dừng và cả database treo, ảnh hưởng luôn THACSI.
- **Archive log khoảng 2,7 GB (16 file, tăng ~400 MB trong đợt này, chủ yếu do dựng dữ liệu benchmark) tích lũy từ tháng 7/2026, chưa từng được backup hay dọn,** `$ORACLE_HOME/dbs` là symlink tới `/opt/oracle/oradata/dbconfig/FREE/dbs`, nên archive log (tiền tố `arch`) và controlfile autobackup **nằm trong volume `oracle_oracle_data`** và vẫn còn khi tạo lại container (đính chính 08/11; ghi chú trước đó nói nằm trong lớp container là sai). Việc dọn hoặc chuyển chỗ ảnh hưởng toàn instance nên chưa làm; cần người dùng quyết định.
- **Chưa phục hồi toàn instance sang môi trường tách biệt** (container khác). CDB hiện khoảng 3,9 GB datafile, không đủ chỗ. Phần đã làm là phục hồi vật lý tại chỗ cho tablespace ERP, và phục hồi logic sang schema tách biệt.
- Backup nằm cùng đĩa với database: hợp cho diễn tập, chưa phải phương án chống mất đĩa.
- Chưa đặt chính sách lưu giữ/dọn audit trail (`DBMS_AUDIT_MGMT`). Mỗi lần chạy kiểm thử trên schema test sinh thêm bản ghi audit.
- Đo hiệu năng dùng dữ liệu nhân bản trên instance dùng chung, cache ấm; số tuyệt đối chỉ để so sánh trước/sau, không phải cam kết độ trễ.
- Index `staging_facts_ix3` và thay đổi view chưa được đưa vào `design_schema.py`/ERD (không đổi số bảng/cột/FK).
- Chưa có Docker Compose hay một lệnh cài từ đầu (NFR-01). Chưa mở rộng 10 mã và giá ngày (G4).
