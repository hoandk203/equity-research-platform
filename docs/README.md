# Tài liệu

Các tài liệu được viết theo đúng thứ tự dự án đã đi qua: đặc tả → dữ liệu → thiết kế CSDL → triển khai trên Oracle → quản trị vận hành → ứng dụng.

| Tài liệu | Nội dung |
|---|---|
| [01 — Đặc tả MVP](01_DAC_TA_MVP_ORACLE.md) | Yêu cầu chức năng FR-01…09, phi chức năng NFR-01…09, chính sách dữ liệu |
| [02 — Hợp đồng dữ liệu và 8 chỉ số](02_HOP_DONG_DU_LIEU_VA_CHI_SO.md) | Đơn vị, thời gian, chất lượng; công thức phiên bản 1.0.0 |
| [03 — Bộ mẫu nghiệm thu](03_BO_MAU_NGHIEM_THU.md) | Bộ dữ liệu FPT–HPG–VNM |
| [04 — Thiết kế ERD](04_THIET_KE_ERD.md) · [05 — Từ điển dữ liệu](05_TU_DIEN_DU_LIEU.md) | 23 bảng gốc, 175 cột, 35 khóa ngoại; chuẩn hóa, snapshot, lineage (phần thị trường: 05b) |
| [06 — Quyết định thiết kế](06_QUYET_DINH_CAN_REVIEW.md) | ADR-01…37 |
| [07 — Đối chiếu và chốt dữ liệu](07_KET_QUA_DOI_CHIEU_VA_CHOT_DU_LIEU.md) | 132 giá trị, 9 hiệu chỉnh theo báo cáo kiểm toán |
| [08 — Nhập dữ liệu](08_NHAP_DU_LIEU_ORACLE.md) | Package nhập, transaction theo kỳ, chống trùng, rollback |
| [09 — Tính và lưu chỉ số](09_TINH_VA_LUU_CHI_SO_ORACLE.md) | Package tính, trạng thái, lineage, đồng thời |
| [10 — View và phân quyền](10_VIEW_VA_PHAN_QUYEN_ORACLE.md) | View chỉ đọc, ETL facade, vai trò tài khoản |
| [11 — Quản trị vận hành](11_QUAN_TRI_VAN_HANH_ORACLE.md) | Tablespace/quota, unified audit, tối ưu trước–sau, RMAN và Data Pump |
| [12 — Hợp đồng dữ liệu cho ứng dụng](12_HOP_DONG_DU_LIEU_CHO_UNG_DUNG.md) | Màn hình → view/hàm, cột, mã lỗi |
| [13 — Phân tích ứng dụng](13_PHAN_TICH_UNG_DUNG.md) · [14 — Kế hoạch](14_KE_HOACH_UNG_DUNG.md) · [15 — Kết quả](15_KET_QUA_UNG_DUNG.md) | Ứng dụng web: phân tích → kế hoạch → triển khai |
| [16 — Kế hoạch giai đoạn 2: giá ngày và định giá](16_KE_HOACH_GIA_VA_DINH_GIA.md) | Phạm vi P-01…P-12, câu hỏi thiết kế Q1–Q9, các giai đoạn A–I |
| [17 — Phân tích](17_PHAN_TICH_GIA_VA_DINH_GIA.md) · [18 — Kế hoạch triển khai](18_KE_HOACH_TRIEN_KHAI_GIA.md) · [19 — Kết quả](19_KET_QUA_GIA_VA_DINH_GIA.md) | Khảo sát nguồn và đối chiếu 3 nguồn, hợp đồng `erp-market/1.0.0`, công thức định giá, kết quả kiểm thử và đo trước–sau |
| [05b — Từ điển dữ liệu phần thị trường](05_TU_DIEN_DU_LIEU_THI_TRUONG.md) | 7 bảng mới + `daily_prices` phân vùng (sinh từ metadata Oracle); [ERD](../design/erd_market.svg) |

## Lưu ý khi đọc trong repo

Tài liệu 03 và 06–11 được viết trong lúc phát triển. Chúng có nhắc tới các thư mục làm việc cục bộ **không có trong repo**:
- `evidence/`: log kiểm thử và kết quả đo.
- `data/`: các phiên bản bộ dữ liệu trong quá trình đối chiếu.
- `scripts/`, `tests/`: công cụ chuẩn bị dữ liệu và kiểm thử Oracle bằng Python.
- `reports/`.

Các link tới những thư mục đó sẽ không mở được trên GitHub. Kết quả chính đã được ghi lại ngay trong từng tài liệu.

Repo này tự dựng lại được database và ứng dụng mà không cần các thư mục trên: `db/install.sh` (hoặc Docker Compose) nạp bộ seed trong `db/seed/` (báo cáo tài chính, rồi vốn – số cổ phiếu – giá ngày) qua đúng package nhập và tính chỉ số, rồi đối chiếu kết quả với bộ chuẩn. Dữ liệu giá thô tải về (`data/market_raw/`) chỉ ở máy; repo giữ bộ đã nghiệm thu trong `db/seed/market/` kèm hash và biên bản đối chiếu.
