# View chỉ đọc và phân quyền tài khoản trên Oracle

Thực hiện ngày 07/11/2026, schema chủ `ERP_DESIGN_V1`, PDB `FREEPDB1`. Kiểm thử trên `ERP_IMPORT_TEST` lúc 16:17:58Z, triển khai schema chính lúc 16:19:31Z (23:19 giờ Việt Nam). THACSI giữ nguyên.

## 1. Kết quả đã triển khai

| Thành phần | Kết quả |
|---|---:|
| View chỉ đọc (`WITH READ ONLY`) | 9 |
| Package VALID | 4 (thêm `pkg_etl_api`) |
| Bảng / cột / FK | 23 / 175 / 35 (không đổi) |
| Lỗi biên dịch | 0 |
| Tài khoản dịch vụ trên schema chính | 2 (`ERP_APP`, `ERP_ETL`) |
| Quyền trực tiếp trên bảng của hai tài khoản | 0 |
| Chỉ số đọc bằng `ERP_APP` khớp bộ chuẩn | 72/72 |
| Đầu vào lineage đọc bằng `ERP_APP` khớp bộ chuẩn | 171/171 |
| Lineage có hash và trang PDF của doanh nghiệp | 171 |
| Ca kiểm thử phân quyền | 38 PASS, 0 FAIL |

Số dòng `ERP_APP` đọc được: `v_company_directory` 3, `v_current_report_sets` 12, `v_metric_history` 72, `v_current_metrics` 72, `v_screening_metrics` 72, `v_metric_lineage` 171.

`ERP_ETL` chạy lại toàn bộ luồng nhập qua facade với batch 21 (`roles-reviewed-pilot-…`). Kết quả: COMPLETED, nhận 132, bỏ qua 132 do trùng, không nhập thêm. Tính lại 9 khóa trả đúng run 41–49. Dữ liệu nghiệp vụ không nhân bản.

Bằng chứng: [validation](../evidence/oracle_access/validation.json), [log thực thi](../evidence/oracle_access/execution.log), [chỉ số sàng lọc đọc bằng ERP_APP](../evidence/oracle_access/screening_metrics_as_app.csv), [lineage đọc bằng ERP_APP](../evidence/oracle_access/lineage_as_app.csv), [38 ca kiểm thử](../evidence/oracle_access_tests/validation.json). Các dòng `ORA-00942`/`ORA-06550` trong log là lệnh bị từ chối đúng mong đợi, không phải lỗi.

## 2. Mô hình tài khoản

| Tài khoản | Role | Quyền hệ thống | Đọc | Thực thi |
|---|---|---|---|---|
| `ERP_DESIGN_V1` | — | Chủ schema, `NO AUTHENTICATION` (không đăng nhập được) | Toàn bộ | Toàn bộ |
| `ERP_APP` | `ERP_APP_READ` | `CREATE SESSION` | 6 view nghiệp vụ | Không |
| `ERP_ETL` | `ERP_ETL_RUN` | `CREATE SESSION` | 6 view nghiệp vụ + 3 view vận hành | `pkg_etl_api` |

Schema kiểm thử có bộ tương ứng `ERP_TEST_APP`/`ERP_TEST_ETL` với role `ERP_TEST_APP_READ`/`ERP_TEST_ETL_RUN`. Hai bộ tách biệt: tài khoản của schema này không đọc được view của schema kia.

Quyền nằm trên role, không cấp trực tiếp cho user. Không có grant option, không có role lồng nhau. Tài khoản dịch vụ có `QUOTA 0` nên không tạo được bảng.

## 3. Chín view

[sql/008_read_views.sql](../sql/008_read_views.sql). Mọi view khai báo `WITH READ ONLY`.

| View | Dành cho | Nội dung |
|---|---|---|
| `v_company_directory` | APP, ETL | Doanh nghiệp và mã niêm yết chính (ưu tiên HOSE) |
| `v_current_report_sets` | APP, ETL | Snapshot hiện hành theo head; `publication_status` UNKNOWN khi còn report thiếu ngày công bố |
| `v_metric_history` | APP, ETL | Mọi kết quả của run COMPLETED, kèm số input kỳ vọng/thực tế và cờ quality issue OPEN |
| `v_current_metrics` | APP, ETL | Kết quả hiện hành theo quy tắc ở mục 4 |
| `v_screening_metrics` | APP, ETL | Tập con VALID của `v_current_metrics`, dùng cho sàng lọc |
| `v_metric_lineage` | APP, ETL | Đầu vào của từng kết quả: số nguồn, correction, hash CafeF, hash/trang PDF doanh nghiệp |
| `v_etl_batches` | ETL | Trạng thái và số đếm của batch nhập |
| `v_etl_errors` | ETL | Lỗi nhập kèm dòng staging |
| `v_calculation_runs` | ETL | Run tính và việc run còn khớp head hiện hành hay không |

View nghiệp vụ không lộ payload staging hoặc đường dẫn file local. Đã có ca kiểm thử riêng cho điều này.

## 4. Quy tắc "hiện hành" của chỉ số

`v_current_metrics` chọn kết quả theo các bước sau:

1. Chỉ lấy run COMPLETED, engine `metric-engine/1.0.0`, formula `1.0.0`.
2. Snapshot của run phải trùng head hiện hành của năm đó. Với 4 công thức cần năm trước (REVENUE_GROWTH, ROA, ROE, CFO_AVG_ASSETS), snapshot năm trước của run cũng phải trùng head năm trước.
3. Trong các run thỏa điều kiện, lấy run mới nhất theo `started_at`, `run_id`.
4. Tại thời điểm đọc, nếu đầu vào dính quality issue OPEN mức HIGH/CRITICAL, hoặc kết quả VALID có số input khác số kỳ vọng, trạng thái chuyển thành `BLOCKED_INPUT_QUALITY` và giá trị bị ẩn (NULL).
5. Chỉ VALID và CALCULATED_PROVISIONAL mới có `metric_value`. `display_value` nhân 100 cho đơn vị PERCENT và làm tròn 2 chữ số; giá trị lưu trữ không đổi.

Hệ quả, đều đã được kiểm thử:

- Đổi head năm trước chỉ ẩn 4 kết quả phụ thuộc; 4 công thức còn lại vẫn hiện.
- Head mới chưa được tính thì ẩn 8 kết quả của năm đó và 4 kết quả phụ thuộc của năm sau.
- Nếu kết quả mới nhất bị chặn, view không lùi về kết quả VALID cũ hơn.
- Run cũ và đầu vào của nó vẫn truy vấn được trong `v_metric_history`/`v_metric_lineage`.
- Mở một quality issue mới thì giá trị bị loại khỏi sàng lọc ngay, không cần tính lại. Sau khi review và có run VALID mới, giá trị trở lại.

## 5. Facade cho ETL

[sql/009_etl_api.sql](../sql/009_etl_api.sql) tạo `pkg_etl_api` (`AUTHID DEFINER`). Đây là package duy nhất ETL được EXECUTE. Nó bọc 6 thủ tục:

| Thủ tục | Kiểm tra thêm ngoài package nội bộ |
|---|---|
| `register_artifact` | Chỉ nhận CAFEF/JSON, FPT_IR·HPG_IR·VNM_IR/PDF, PILOT_REVIEW/CSV |
| `create_batch`, `stage_fact`, `seal_batch`, `process_batch` | Chuyển thẳng sang `pkg_financial_import` |
| `calculate_current` | Chỉ FPT/HPG/VNM, năm nguyên 2023–2025, scope CONSOLIDATED |

Không mở `install_catalog`, `calculate_snapshot` hay truy cập trực tiếp ba package nội bộ. Khi mở rộng 10 mã, phải sửa danh sách cho phép trong facade bằng một phiên bản mới.

`business_change_log` ghi đúng session của `ERP_ETL`, không ghi SYS. Lỗi kiểm định và log vẫn còn sau khi caller rollback, do package nhập dùng autonomous transaction như docs/08.

## 6. Cấp quyền

[sql/010_role_grants.sql](../sql/010_role_grants.sql) dùng `GRANT READ` thay vì `GRANT SELECT`. `READ` cho phép truy vấn nhưng không cho `SELECT … FOR UPDATE` hoặc `LOCK TABLE`, nên tài khoản đọc không thể giữ khóa chặn luồng ghi. Đã kiểm thử.

Tên owner/role trong file là token (`__OWNER__`, `__APP_ROLE__`, `__ETL_ROLE__`). Installer chỉ thay bằng giá trị trong danh sách cố định của [oracle_access.py](../scripts/oracle_access.py).

## 7. Mật khẩu và kết nối

- Mật khẩu sinh ngẫu nhiên 36 ký tự khi tạo user lần đầu, lưu ở `.local/oracle_accounts.json`. Thư mục có quyền 0700, file 0600; `.local/` nằm trong `.gitignore`.
- Mật khẩu truyền vào SQL*Plus qua stdin, không qua tham số dòng lệnh. Output được thay mật khẩu bằng `[REDACTED]` trước khi ghi log.
- Kết nối bằng `CONNECT user/password@//127.0.0.1:1521/FREEPDB1`. Không dùng proxy login hay `ALTER SESSION SET CURRENT_SCHEMA` để giả lập user. Danh tính được kiểm bằng `SYS_CONTEXT('USERENV','AUTHENTICATED_IDENTITY')` và `AUTHENTICATION_METHOD = PASSWORD`.
- Nếu user/role đã tồn tại mà không có trong file local, installer dừng và không đụng vào tài khoản đó.

Chạy truy vấn bằng tài khoản dịch vụ:

```bash
python3 Quan_Tri_CSDL/scripts/oracle_access.py --as APP --sql Quan_Tri_CSDL/sql/011_demo_app_queries.sql
python3 Quan_Tri_CSDL/scripts/oracle_access.py --as ETL --sql Quan_Tri_CSDL/sql/012_demo_etl_status.sql
```

## 8. Kiểm thử

38 ca trên `ERP_IMPORT_TEST`, đăng nhập thật bằng `ERP_TEST_APP`/`ERP_TEST_ETL`:

- **Danh tính và quyền:** đăng nhập mật khẩu thật; đúng quyền hệ thống/role/object, không có grant trên bảng.
- **Bị từ chối đúng:** APP và ETL không đọc, không ghi, không tạo được bảng gốc nào trong 23 bảng. Không đọc được DBA catalog, không gọi được 3 package nội bộ. APP không gọi được ETL facade, không đọc 3 view vận hành, không tự bật hoặc tự cấp role ETL/DBA. Facade không lộ API quản trị catalog. `READ` không cho khóa bảng, view không cập nhật được.
- **Luồng ETL qua facade:** từ chối nguồn ngoài danh sách và năm/mã ngoài phạm vi; register–stage–process–replay 132 giá trị; lỗi và log còn sau caller rollback; business log ghi đúng session ETL.
- **Đọc của APP:** view không lộ payload/đường dẫn; 72 giá trị sàng lọc khớp chuẩn; 171 input có hash và trang PDF; hiển thị phần trăm không làm đổi tỷ lệ lưu trữ.
- **Hiện hành và lịch sử:** các tình huống ở mục 4.

Dữ liệu fixture còn lại trong schema kiểm thử. Head kiểm thử đã khôi phục, quality issue giả lập đã resolve.

Từ thư mục `CSDL_HocSau`:

```bash
python3 Quan_Tri_CSDL/scripts/check_oracle_access.py
python3 Quan_Tri_CSDL/scripts/deploy_oracle_access.py
```

## 9. Quyết định và giới hạn

Quyết định ADR-19 đến ADR-22 ở [docs/06](06_QUYET_DINH_CAN_REVIEW.md).

Giới hạn:

- Việc cài đặt vẫn chạy bằng SYSDBA. Chủ schema không đăng nhập được. Đây là chủ ý, không phải tài khoản vận hành thứ ba.
- Màn hình "Đợt nhập" (FR-06) cần dữ liệu từ `v_etl_batches`/`v_etl_errors`, nhưng hiện chỉ ETL đọc được. Trước khi làm API phải chọn: cấp thêm cho role app, hay tạo role đọc vận hành riêng.
- Chưa có view trả từng dòng BCTC cho màn hình chi tiết (FR-02).
- Facade đang khóa cứng phạm vi pilot 3 mã, 2023–2025.
- VALID vẫn chỉ cho phân tích hồi cứu local; ngày công bố UNKNOWN.
