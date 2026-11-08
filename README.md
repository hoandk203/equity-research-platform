# Equity Research Platform

Cơ sở dữ liệu báo cáo tài chính trên **Oracle AI Database 26ai**, kèm API **NestJS** và giao diện **Next.js** để xem báo cáo, truy vết chỉ số tài chính tới từng số liệu gốc, sàng lọc và so sánh doanh nghiệp niêm yết Việt Nam.

Dữ liệu mẫu: FPT, HPG, VNM, báo cáo tài chính hợp nhất năm 2022–2025. Tổng cộng 132 số liệu đã đối chiếu với báo cáo kiểm toán (9 số được hiệu chỉnh theo PDF kiểm toán) và 8 chỉ số cho các năm 2023–2025.

## Tính năng

| Màn hình | Nội dung |
|---|---|
| Doanh nghiệp | Tìm theo mã hoặc tên, gõ có dấu hay không dấu đều được ("hoa phat" → Hòa Phát) |
| Chi tiết | 3 báo cáo tài chính theo từng dòng; số đã hiệu chỉnh kèm lý do, trang PDF kiểm toán; 8 chỉ số; **truy vết** một chỉ số tới từng đầu vào (năm t / t−1, số gốc, hiệu chỉnh, hash và trang PDF) |
| Sàng lọc | Nhiều điều kiện AND; Oracle trả **Đạt / Không đạt / Chưa xác định** cho từng doanh nghiệp và từng điều kiện |
| So sánh | 2–3 doanh nghiệp, cùng năm, cùng phiên bản công thức; thiếu dữ liệu hiện "Chưa xác định", không lấy số năm khác |
| Đợt nhập | Các đợt nhập dữ liệu với bộ đếm nhận / nhập / từ chối / bỏ qua do trùng, cùng lỗi chi tiết |

Nguyên tắc: ứng dụng **chỉ đọc**; mọi quy tắc nghiệp vụ (kiểm định khi nhập, tính chỉ số, sàng lọc) nằm trong Oracle (PL/SQL). Dữ liệu thiếu không bao giờ hiển thị thành 0.

## Kiến trúc

```
Trình duyệt ── Next.js 16 (React Query · Redux Toolkit · React Hook Form + zod)
     │  HTTP/JSON, header X-Request-Id
     ▼
NestJS 11 API (/api, Swagger /api/docs) ── node-oracledb 26 (thin), SQL cố định + bind variable
     │  tài khoản ERP_APP: chỉ đọc 10 view và gọi hàm sàng lọc
     ▼
Oracle AI Database 26ai Free ── 23 bảng · 14 trigger · 5 package · 13 view · 4 vai trò tài khoản · unified audit
```

- **Phân quyền tối thiểu.** API chỉ khởi động với tài khoản `ERP_APP`, không có quyền trên bảng gốc. Nhập dữ liệu dùng tài khoản `ERP_ETL` qua một package facade. Chủ schema không đăng nhập được.
- **Truy vết audit.** Mỗi request mang một mã định danh, được gắn vào `CLIENT_IDENTIFIER` của session Oracle.
- **Bất biến và phiên bản.** Số liệu gốc, hiệu chỉnh và snapshot báo cáo không bị ghi đè. Mỗi chỉ số khóa đúng snapshot năm t và t−1 đã dùng.

Monorepo **Nx**:

| Thư mục | Nội dung |
|---|---|
| `apps/api` | NestJS: config có danh sách tài khoản được phép, pool Oracle, 6 module (health, companies, reports, metrics, screening, imports) |
| `apps/web` | Next.js App Router, 5 màn hình |
| `apps/web-e2e` | Kiểm thử đầu-cuối Playwright |
| `libs/contracts` | Kiểu dữ liệu và giới hạn dùng chung giữa web và API |
| `db` | Bộ cài một lệnh, seed dữ liệu mẫu, script kiểm tra |
| `sql` | DDL, trigger, package, view, phân quyền, audit, tối ưu |
| `docs`, `design` | Tài liệu thiết kế, ERD |

## Chạy bằng Docker Compose

Yêu cầu: Docker có Compose, khoảng 15 GB trống cho image Oracle, quyền tải image từ `container-registry.oracle.com`.

```bash
cp .env.example .env          # đặt ORACLE_PWD
docker compose up -d          # lần đầu: tạo database + cài schema, mất vài phút
docker compose logs -f oracle # chờ "[db:install] done"
```

Sau đó mở:
- Giao diện: http://localhost:3000
- Tài liệu API: http://localhost:4000/api/docs

Lần chạy đầu, container Oracle tự chạy `db/install.sh`. Mật khẩu các tài khoản dịch vụ được sinh ngẫu nhiên và chia sẻ cho API qua một volume riêng.

## Chạy khi phát triển (Oracle có sẵn)

Yêu cầu: Node.js 24, một container Oracle AI Database 26ai Free đang chạy (mặc định tên `oracle-free`, PDB `FREEPDB1`).

```bash
npm ci
npm run db:install            # dựng schema ERP_DESIGN_V1, nạp seed, kiểm tra, ghi apps/api/.env
npm run start:api             # http://localhost:4000/api  (Swagger: /api/docs)
npm run start:web             # http://localhost:3000
```

`npm run db:install` dành cho database **chưa có** schema; nếu `ERP_DESIGN_V1` đã tồn tại (đã cài trước đó), lệnh dừng lại có chủ ý. Khi đó chỉ cần `npm run db:verify` để kiểm tra dữ liệu, rồi chạy API bằng `apps/api/.env` có sẵn.

`db/install.sh` cấu hình được qua biến môi trường: `ORACLE_CONTAINER`, `ERP_OWNER`, `ERP_APP_USER`, `ERP_TABLESPACE`, `ERP_WITH_AUDIT`… Bộ cài **không bao giờ sửa schema đã tồn tại**: nếu owner đã có, nó dừng lại. Nó in kết quả đối chiếu (132 dòng, 9 hiệu chỉnh, 12 bộ báo cáo, 72 chỉ số, 171 đầu vào, khớp từng giá trị) và ghi mật khẩu vào `apps/api/.env` cùng `.local/db-accounts.env` (quyền 600, không commit).

## Kiểm thử

```bash
npm test                      # đơn vị: contracts, api (cấu hình, ánh xạ lỗi, quét SQL chỉ đọc), web (định dạng, Redux, form)
npm run test:integration      # API trên Oracle thật, chạy trên 2 schema
npm run test:e2e              # Playwright: luồng demo + trạng thái biên + ảnh chụp vào dist/screenshots
npm run db:verify             # đối chiếu lại dữ liệu trong database với bộ chuẩn
npm run lint
```

Kiểm thử API cần `apps/api/.env` (tài khoản `ERP_APP`). Lượt thứ hai dùng `apps/api/.env.test` (tài khoản `ERP_TEST_APP` trên schema kiểm thử `ERP_IMPORT_TEST`) để kiểm các trạng thái biên.

## API

| Đường dẫn | Mô tả |
|---|---|
| `GET /api/health` | Tài khoản Oracle đang dùng, mã request trên session |
| `GET /api/companies?q=` | Danh sách, tìm không dấu |
| `GET /api/companies/:symbol` | Thông tin và các bộ báo cáo theo năm |
| `GET /api/companies/:symbol/reports?year=` | 11 dòng báo cáo (tiền VND dạng chuỗi) |
| `GET /api/companies/:symbol/metrics?year=` | 8 chỉ số hiện hành |
| `GET /api/metric-results/:resultId/lineage` | Truy vết một kết quả |
| `GET /api/metrics/catalog` | Danh mục công thức |
| `POST /api/screening` | Sàng lọc `{year, conditions:[{metric, op, value}]}`, ngưỡng là tỷ lệ thuần |
| `GET /api/compare?symbols=&year=` | So sánh 2–3 mã |
| `GET /api/imports`, `GET /api/imports/:batchId/errors` | Đợt nhập và lỗi |

Lỗi có định dạng thống nhất `{"error": {"code", "message", "requestId"}}`, không lộ chi tiết Oracle.

## Giới hạn dữ liệu

- Phân tích **hồi cứu**: ngày công bố của từng báo cáo chưa được xác minh.
- Chưa có dữ liệu giá cổ phiếu; màn hình giá chỉ hiển thị thông báo.
- Dữ liệu mẫu gồm 3 doanh nghiệp. Việc đối chiếu được thực hiện bằng quy trình tự động so với PDF kiểm toán, không phải ý kiến kiểm toán độc lập.

## Tài liệu

Xem [docs/README.md](docs/README.md): đặc tả, hợp đồng dữ liệu và công thức, ERD và từ điển dữ liệu, nhập dữ liệu, tính chỉ số, phân quyền, quản trị vận hành (tablespace, audit, tối ưu, sao lưu – phục hồi), hợp đồng dữ liệu cho ứng dụng, phân tích – kế hoạch – kết quả ứng dụng.
