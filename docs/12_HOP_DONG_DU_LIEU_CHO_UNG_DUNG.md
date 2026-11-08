# Hợp đồng dữ liệu cho ứng dụng (backend/frontend)

Cập nhật 08/11/2026. Tài liệu này là điểm vào cho người viết API NestJS và giao diện Next.js. API REST đã triển khai trên hợp đồng này: xem [README](../README.md#api) và [docs/15](15_KET_QUA_UNG_DUNG.md). Mọi dữ liệu đọc qua view/hàm của schema `ERP_DESIGN_V1`; không có quyền trên bảng gốc.

## 1. Kết nối

| Mục đích | Tài khoản | Ghi chú |
|---|---|---|
| Mọi màn hình | `ERP_APP` | Chỉ đọc 10 view và gọi `pkg_screening` |
| Nhập dữ liệu (không làm trên web) | `ERP_ETL` | Script Python, qua `pkg_etl_api` |

- Chuỗi kết nối: `//127.0.0.1:1521/FREEPDB1`. Driver đề xuất: `node-oracledb` chế độ thin (không cần Oracle Client).
- Mật khẩu nằm trong `Quan_Tri_CSDL/.local/oracle_accounts.json` (không commit). Backend đọc từ biến môi trường, không hard-code.
- Mỗi request nên gọi `DBMS_SESSION.SET_IDENTIFIER('<request-id>')` để audit truy được thao tác (docs/11).
- Luôn dùng bind variable. Tên view phải viết kèm schema: `ERP_DESIGN_V1.v_current_metrics`.

## 2. Dữ liệu hiện có

3 doanh nghiệp (FPT, HPG, VNM) × báo cáo năm 2022–2025, phạm vi hợp nhất. 8 chỉ số cho các năm 2023–2025; năm 2022 chỉ làm cơ sở nên không có chỉ số. Toàn bộ 72 chỉ số đều VALID, được đối chiếu với báo cáo kiểm toán. Giá cổ phiếu ngày chưa có dữ liệu; màn hình hiển thị "chưa có dữ liệu" (ADR-29).

Tám mã chỉ số (`metric_code`): `REVENUE_GROWTH`, `GROSS_MARGIN`, `NET_MARGIN`, `ROA`, `ROE`, `LIABILITIES_ASSETS`, `CURRENT_RATIO`, `CFO_AVG_ASSETS`.

## 3. Màn hình → nguồn dữ liệu

| Màn hình | Nguồn | Truy vấn điển hình |
|---|---|---|
| Danh sách (FR-01) | `v_company_directory` | `WHERE UPPER(symbol) LIKE :q OR UPPER(company_name) LIKE :q` |
| Chi tiết (FR-02): BCTC | `v_report_lines` | `WHERE symbol=:s AND fiscal_year=:y ORDER BY statement_kind, item_code` |
| Chi tiết: thông tin bộ báo cáo | `v_current_report_sets` | `WHERE symbol=:s ORDER BY fiscal_year` |
| Chi tiết: chỉ số | `v_current_metrics` | `WHERE symbol=:s AND fiscal_year=:y` |
| Chi tiết: truy vết chỉ số | `v_metric_lineage` | `WHERE result_id=:rid` (lấy `result_id` từ `v_current_metrics`) |
| Sàng lọc (FR-04) | `pkg_screening.screen` | Mục 5 |
| So sánh (FR-05) | `v_current_metrics` | `WHERE symbol IN (:a,:b,:c) AND fiscal_year=:y` |
| Đợt nhập (FR-06) | `v_import_batches`, `v_import_errors` | `ORDER BY batch_id DESC`; lỗi: `WHERE batch_id=:b` |
| Công thức, danh sách chỉ số cho form sàng lọc | `v_metric_catalog` (sql/019) | `WHERE formula_version='1.0.0'` |

**Truy vết lineage phải lọc theo `result_id`,** không lọc theo mã/năm/chỉ số. Cách lọc theo mã/năm/chỉ số chậm hơn khoảng 160 lần (docs/11, Q3/Q7).

## 4. Cột chính

**`v_report_lines`**: mỗi bộ báo cáo hiện hành × 11 chỉ tiêu, gồm 6 dòng BS, 4 dòng IS, 1 dòng CF.

| Cột | Ý nghĩa |
|---|---|
| `statement_kind` | `BS` cân đối kế toán, `IS` kết quả kinh doanh, `CF` lưu chuyển tiền tệ |
| `item_code`, `line_name` | Mã chỉ tiêu và tên dòng tiếng Việt theo nguồn (ví dụ "TỔNG CỘNG TÀI SẢN") |
| `effective_value_vnd` | Giá trị dùng để hiển thị (đã áp hiệu chỉnh), đơn vị VND |
| `provider_value_vnd`, `is_corrected` | Số gốc của nguồn; cờ 1 nếu đã hiệu chỉnh |
| `correction_key`, `correction_reason`, `correction_page`, `correction_pdf_url` | Bằng chứng hiệu chỉnh: lý do, trang và link PDF kiểm toán |
| `line_status` | `VERIFIED`, `PROVISIONAL`, `BLOCKED` hoặc `MISSING`. Với `MISSING` thì giá trị NULL; **không hiển thị là 0** |
| `currency_code`, `original_unit`, `fiscal_start`, `fiscal_end`, `metadata_status` | Đơn vị và niên độ |
| `publication_status` | `UNKNOWN`: ngày công bố chưa xác minh (giới hạn đã công bố) |
| `open_issue_count` | Số vấn đề chất lượng đang mở; lớn hơn 0 thì hiện cảnh báo |
| `provider_sha256`, `provider_url` | Nguồn dữ liệu gốc |

**`v_current_metrics`**: `metric_code`, `metric_name`, `metric_value` (tỷ lệ thuần), `display_value` (đã nhân 100 nếu `display_unit='PERCENT'`, làm tròn 2 chữ số), `display_unit` (`PERCENT`/`TIMES`), `result_status`, `reason_codes`, `result_id`. Chỉ `VALID` và `CALCULATED_PROVISIONAL` có giá trị; các trạng thái khác giá trị NULL và cần hiện lý do.

**`v_import_batches`**: `batch_id`, `batch_key`, `batch_status`, `started_at`, `finished_at`, `received_count`, `imported_count`, `rejected_count`, `skipped_count`, `error_count`.

**`v_import_errors`**: `batch_id`, `row_no`, `source_symbol`, `fiscal_year_raw`, `item_code_raw`, `error_code`, `error_message`, `logged_at`. Hiện chưa có lỗi nào trong dữ liệu thật.

## 5. Sàng lọc

```sql
SELECT symbol, company_name, overall_status, passed_count, failed_count, unknown_count, details
FROM TABLE(ERP_DESIGN_V1.pkg_screening.screen(:year, :conditions_json))
```

- `:conditions_json`: mảng gồm 1–10 điều kiện, nối với nhau bằng AND. Ví dụ `[{"metric":"NET_MARGIN","op":">=","value":0.10},{"metric":"CURRENT_RATIO","op":">=","value":1.0}]`.
- `value` là **tỷ lệ thuần**: người dùng nhập 10% thì frontend gửi `0.10`.
- `op` thuộc `>=`, `>`, `<=`, `<`, `=`.
- Một điều kiện chỉ PASS/FAIL khi chỉ số hiện hành là `VALID`; mọi trường hợp khác là UNKNOWN.
- Kết quả chung: có điều kiện FAIL thì `FAIL`; nếu không có FAIL nhưng có UNKNOWN thì `UNKNOWN`; còn lại `PASS`.
- Hàm trả mọi doanh nghiệp. Frontend tự nhóm PASS / UNKNOWN / FAIL.
- `details` là mảng JSON theo thứ tự điều kiện: `metric`, `op`, `threshold`, `value`, `display_value`, `unit`, `metric_status`, `condition_status`. Dùng để hiện lý do từng điều kiện.

| Mã lỗi | Nguyên nhân | Backend trả |
|---|---|---|
| `ORA-20401` | Năm không phải số nguyên | 400 |
| `ORA-20402` | Không phải JSON, hoặc số điều kiện ngoài khoảng 1–10 | 400 |
| `ORA-20403` | Mã chỉ số không tồn tại | 400 |
| `ORA-20404` | Toán tử không hợp lệ | 400 |
| `ORA-20405` | Thiếu `value` hoặc `value` không phải số | 400 |

Ví dụ đã kiểm chứng (năm 2024, biên lãi ròng ≥ 10% và hệ số thanh toán hiện hành ≥ 1): FPT PASS, VNM PASS, HPG FAIL (biên lãi ròng 8,66%). Năm 2022: cả ba UNKNOWN vì không có chỉ số.

## 6. Kiểm chứng

[check_oracle_app_api.py](../scripts/check_oracle_app_api.py), đăng nhập thật bằng tài khoản APP: **15/15 ca đạt** ([bằng chứng](../evidence/oracle_app_api/validation.json)).
- Grant chính xác.
- `v_report_lines` có đủ dòng cho mọi chỉ tiêu và khớp 132 giá trị đã nghiệm thu, trong đó 9 dòng đã hiệu chỉnh.
- View mới không lộ payload hay đường dẫn local.
- Đợt nhập: số batch và số lỗi khớp dữ liệu gốc.
- Sàng lọc: từ chối 8 kiểu đầu vào sai, kể cả chuỗi kiểu SQL injection; khớp đánh giá Python độc lập ở 5 kịch bản; năm không có dữ liệu cho UNKNOWN.
- Quality issue OPEN làm điều kiện thành UNKNOWN và gắn cờ dòng BCTC.

38 ca phân quyền chạy lại đều đạt ([kết quả](../evidence/oracle_access_tests_after_app_api/validation.json)).

```bash
python3 Quan_Tri_CSDL/scripts/check_oracle_app_api.py            # test schema rồi schema chính
```
