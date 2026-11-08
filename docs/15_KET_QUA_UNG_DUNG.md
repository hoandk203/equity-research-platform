# Kết quả triển khai ứng dụng web

Phiên bản 1.0 — 08/11/2026. Thực hiện theo [docs/14 — Kế hoạch](14_KE_HOACH_UNG_DUNG.md) (bản 1.4), các bước B0–B11. Theo yêu cầu người dùng, các điểm dừng được bỏ qua; toàn bộ được duyệt một lần sau khi hoàn thành. Tài liệu này là đầu vào cho lần duyệt đó.

## 1. Đã làm được gì

| Bước | Kết quả |
|---|---|
| B0 | Nx 24.0.1 ở gốc repo: `apps/api`, `apps/web`, `apps/web-e2e`, `libs/contracts` (`@erp/contracts`), `db`. Ranh giới phụ thuộc: web, api và db chỉ được import `contracts` (kiểm bằng lint) |
| B1 | View `v_metric_catalog` ([sql/019](../sql/019_metric_catalog.sql)) cấp cho APP/ETL: tên, công thức, đơn vị, số đầu vào, có cần năm trước |
| B2–B5 | API NestJS: 11 endpoint, Swagger tại `/api/docs` |
| B6–B9 | Web Next.js: 5 màn hình, React Query, Redux Toolkit (3 slice), React Hook Form + zod |
| B10 | Playwright: luồng demo, trạng thái biên, ảnh chụp 7 màn hình + Swagger |
| B11 | Seed tự chứa `db/seed/` (nạp qua package thật), bộ cài một lệnh `db/install.sh`, `db/verify.sh`, Docker Compose cho toàn bộ dự án, README và mục lục tài liệu cho repo độc lập |

## 2. Kiểm thử

Tất cả chạy trên Oracle AI Database 26ai Free 23.26.3 thật, không mock database.

| Bộ | Lệnh | Kết quả |
|---|---|---|
| Đơn vị `contracts` | `nx test contracts` | 6/6 |
| Đơn vị api | `nx test api` | 16/16: danh sách tài khoản được phép (từ chối SYS, SYSTEM, owner, ETL, MONITOR…), ánh xạ ORA-2040x → 400, tìm không dấu, quét mã nguồn chỉ có `SELECT`/gọi hàm |
| API trên Oracle | `nx run api:integration` | `ERP_DESIGN_V1` (ERP_APP): **23/23**. `ERP_IMPORT_TEST` (ERP_TEST_APP): **15/15**, 8 ca dữ liệu thật bỏ qua đúng |
| Đơn vị web | `nx test web` | 19/19: định dạng tiền (BigInt, không làm tròn sai), codec URL (từ chối link độc), Redux, form sàng lọc, hộp lỗi |
| Đầu-cuối | `nx e2e web-e2e` | **10/10** |
| Bộ cài từ đầu | `db/install.sh` vào schema mới `ERP_INSTALL_CHECK` | 23 bảng, 13 view, 0 lỗi biên dịch; 132 dòng, 9 hiệu chỉnh, 12 bộ báo cáo, 72 chỉ số VALID, 171 đầu vào; **72/72 giá trị khớp**; tài khoản APP mới đọc view được, đọc bảng bị từ chối; chạy lại bị từ chối vì owner đã tồn tại |
| Hồi quy database | script kiểm thử cục bộ | app API 17/17, phân quyền 38/38, audit 10/10 (sau khi sửa sql/014); schema chính không đổi (72/171, cùng hash) |
| Lint, build | `nx run-many -t lint build` | Sạch |

Một số ca kiểm thử đáng chú ý:
- Request gửi `X-Request-Id: itest-health-0001` thì `SYS_CONTEXT('USERENV','CLIENT_IDENTIFIER')` của session cũng là giá trị đó.
- Số tiền tổng tài sản VNM 2025 trả ra đúng `"53312370717301"` (số đã hiệu chỉnh), số gốc `"53312340717301"`.
- Truy vết ROE VNM 2025 có 3 đầu vào: lợi nhuận 2025, vốn chủ sở hữu 2024, vốn chủ sở hữu 2025. Số vốn chủ sở hữu 2025 đã hiệu chỉnh, có trang PDF.
- Sàng lọc 2024 (biên lãi ròng ≥ 10%, hệ số thanh toán ≥ 1): FPT, VNM Đạt; HPG Không đạt (8,66%).
- Năm 2022: sàng lọc cho Chưa xác định, so sánh có 16 ô Chưa xác định, không bao giờ hiện 0.
- Chuỗi kiểu SQL injection trong mã chứng khoán, mã chỉ số hay link URL đều bị từ chối trước khi tới Oracle.

Ảnh chụp: chạy `nx e2e web-e2e`, ảnh nằm trong `dist/screenshots/` (01-danh-sach … 08-swagger).

## 3. Điểm khác kế hoạch (cần duyệt)

| # | Kế hoạch | Thực tế | Lý do |
|---|---|---|---|
| D1 | TypeScript 5.9.3 | **6.0.3** | Nx 24 sinh workspace với 6.0.3. NestJS được build bằng webpack của Nx (không dùng NestJS CLI, vốn là lý do chọn 5.9.3); decorator chạy đúng (build + kiểm thử đạt) |
| D2 | `@hookform/resolvers` 6.0.0 | **5.9.2** | Bản 6.0.0 gây xung đột peer dependency (`effect`) khi cài; 5.9.2 hỗ trợ zod 4 |
| D3 | Jest 30.5.2 | **30.3.0** | Bộ Jest do `@nx/jest` sinh ra (đồng bộ với `jest-environment-node`, `jest-util`) |
| D4 | `@nestjs/config` | **Không dùng** | Cấu hình tự viết gọn hơn (`config/app-config.ts` + `node:util.parseEnv`), đủ kiểm tra danh sách tài khoản; bỏ gói để giảm phụ thuộc |
| D5 | `withConnection` có dự phòng `DBMS_SESSION.SET_IDENTIFIER` | Chỉ dùng `connection.clientId` | Chế độ thin hỗ trợ `clientId`; đã kiểm chứng bằng `SYS_CONTEXT` |
| D6 | Bộ cài là project Nx viết bằng TypeScript (node-oracledb) | **`db/install.sh` (bash + SQL\*Plus)**, gọi qua `nx run db:install` | Các file `sql/` dùng cú pháp SQL\*Plus (`/`, `WHENEVER`, `SET DEFINE OFF`). Image Oracle chính thức chạy script khởi tạo bằng SQL\*Plus, nên một bộ cài dùng chung được cho máy phát triển (`docker exec`) và Docker Compose (bên trong container), không cần mật khẩu SYS |
| D7 | Seed xuất bằng script trong `db` | Công cụ xuất là script Python **cục bộ** (không có trong repo); repo chứa sẵn `db/seed/pilot_seed.sql` + `verify.sql` | Công cụ xuất đọc database gốc bằng SYSDBA, chỉ người bảo trì cần |
| D8 | Chạy thử Compose nếu đĩa đủ | **Chưa build image Docker thật** | Phân vùng `/` (nơi Docker lưu image) còn khoảng 2,9 GB, và container Oracle dùng chung với dự án khác chạy trên đó. Đã kiểm: `docker compose config` hợp lệ; chạy lại các bước runtime của cả hai Dockerfile trên `/home` (api: `npm ci --omit=dev` + `/api/health` OK; web: build standalone + `server.js` trả trang và file tĩnh 200) |
| D9 | — | **Sửa `sql/014_audit_policies.sql`** | Bản cũ bật policy cho các user/package cố định (`ERP_TEST_*`, `ERP_IMPORT_TEST.PKG_ETL_API`), lỗi trên database mới. Nay chỉ áp cho object thực sự tồn tại; kiểm thử audit vẫn 10/10 |
| D10 | — | Thêm `db/verify.sh`, target `nx run db:verify` | Đối chiếu lại database bất kỳ lúc nào |

## 4. Câu SQL chính của từng API

Mọi câu là hằng số trong `*.repository.ts`, tham số qua bind, tên schema lấy từ cấu hình đã kiểm tra.

| API | SQL (rút gọn) |
|---|---|
| A2 danh sách | `SELECT symbol, company_name, exchange_code FROM v_company_directory`; lọc không dấu ở backend |
| A4 báo cáo | `SELECT … FROM v_report_lines WHERE symbol = :symbol AND fiscal_year = :year ORDER BY <BS, IS, CF>, item_id`. Cột tiền đọc dạng chuỗi |
| A5 chỉ số | `SELECT … FROM v_current_metrics WHERE symbol = :symbol AND fiscal_year = :year AND scope_code = 'CONSOLIDATED' AND formula_version = :formula` |
| A6 truy vết | `v_metric_history WHERE result_id = :resultId` + `v_metric_lineage WHERE result_id = :resultId ORDER BY input_position`. Lọc theo `result_id` theo kết quả tối ưu ở docs/11 |
| A8 sàng lọc | `SELECT … FROM TABLE(pkg_screening.screen(:year, :conditions))`, điều kiện là một giá trị JSON bind |
| A9 so sánh | `v_current_metrics WHERE symbol IN (:s0, :s1[, :s2]) AND fiscal_year = :year …`. Hai câu cố định cho 2 và 3 mã |
| A10–A11 đợt nhập | `v_import_batches ORDER BY batch_id DESC`; `v_import_errors WHERE batch_id = :batchId` |

## 5. Còn lại và giới hạn

- Chưa build/chạy Docker Compose thật (D8). Cần khoảng 15 GB cho image Oracle trên máy mới; trên máy này nên chuyển thư mục dữ liệu Docker sang `/home` trước.
- Schema `ERP_INSTALL_CHECK` (trong tablespace `ERP_PERF_DATA`, cùng tài khoản `ERP_IC_APP`, `ERP_IC_ETL`) được giữ lại làm bằng chứng cài từ đầu. Có thể xóa nếu không cần.
- Dữ liệu vẫn là 3 doanh nghiệp, chưa có giá ngày. Ngày công bố báo cáo chưa xác minh.
- Tài liệu 03, 06–11 có link tới thư mục làm việc cục bộ không có trong repo ([docs/README.md](README.md)).
