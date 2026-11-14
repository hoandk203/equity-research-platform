# Equity Research Platform

Cơ sở dữ liệu báo cáo tài chính trên **Oracle AI Database 26ai**, kèm API **NestJS** và giao diện **Next.js** để xem báo cáo, truy vết chỉ số tài chính tới từng số liệu gốc, sàng lọc và so sánh doanh nghiệp niêm yết Việt Nam.

Dữ liệu mẫu: FPT, HPG, VNM, báo cáo tài chính hợp nhất năm 2022–2025. Tổng cộng 132 số liệu đã đối chiếu với báo cáo kiểm toán (9 số được hiệu chỉnh theo PDF kiểm toán) và 8 chỉ số cho các năm 2023–2025. Giá ngày 2022–2025 (2.991 phiên, giá gốc và điều chỉnh) đối chiếu 3 nguồn, số cổ phiếu lưu hành và lợi ích cổ đông không kiểm soát cho định giá P/E, P/B, vốn hóa.

## Tính năng

| Màn hình | Nội dung |
|---|---|
| Doanh nghiệp | Tìm theo mã hoặc tên, gõ có dấu hay không dấu đều được ("hoa phat" → Hòa Phát); giá đóng cửa, thay đổi phiên, vốn hóa |
| Chi tiết | **Thẻ định giá** (giá, vốn hóa, P/E, P/B, EPS, BVPS, năm BCTC dùng); 3 báo cáo tài chính theo từng dòng; số đã hiệu chỉnh kèm lý do, trang PDF kiểm toán; 8 chỉ số; **truy vết** một chỉ số tới từng đầu vào; tab **Giá**: biểu đồ nến/đường, khối lượng, MA20/50/200, lợi suất, biến động, cao/thấp 52 tuần, các phiên đã hiệu chỉnh |
| Sàng lọc | Nhiều điều kiện AND theo **năm** (chỉ số tài chính) hoặc theo **ngày** (tài chính + định giá + thị trường, ví dụ ROE ≥ 15%, P/E ≤ 12, lợi suất 1 năm > 0); Oracle trả **Đạt / Không đạt / Chưa xác định** |
| So sánh | 2–3 doanh nghiệp, cùng năm, cùng phiên bản công thức, kèm 17 hàng định giá/thị trường tại ngày chọn; thiếu dữ liệu hiện "Chưa xác định", không lấy số năm khác |
| Đợt nhập | Các đợt nhập dữ liệu với bộ đếm nhận / nhập / từ chối / bỏ qua do trùng, cùng lỗi chi tiết |

Nguyên tắc: ứng dụng **chỉ đọc**; mọi quy tắc nghiệp vụ (kiểm định khi nhập, tính chỉ số, sàng lọc) nằm trong Oracle (PL/SQL). Dữ liệu thiếu không bao giờ hiển thị thành 0.

## Kiến trúc

```
Trình duyệt ── Next.js 16 (React Query · Redux Toolkit · React Hook Form + zod)
     │  HTTP/JSON, header X-Request-Id
     ▼
NestJS 11 API (/api, Swagger /api/docs) ── node-oracledb 26 (thin), SQL cố định + bind variable
     │  tài khoản ERP_APP: chỉ đọc 19 view và gọi hàm sàng lọc
     ▼
Oracle AI Database 26ai Free ── 30 bảng (giá ngày phân vùng theo năm) · 20 trigger · 6 package · 23 view
                                + 2 materialized view · 4 vai trò tài khoản · unified audit
```

- **Phân quyền tối thiểu.** API chỉ khởi động với tài khoản `ERP_APP`, không có quyền trên bảng gốc. Nhập dữ liệu dùng tài khoản `ERP_ETL` qua một package facade. Chủ schema không đăng nhập được.
- **Truy vết audit.** Mỗi request mang một mã định danh, được gắn vào `CLIENT_IDENTIFIER` của session Oracle.
- **Bất biến và phiên bản.** Số liệu gốc, hiệu chỉnh và snapshot báo cáo không bị ghi đè. Mỗi chỉ số khóa đúng snapshot năm t và t−1 đã dùng.

Monorepo **Nx**:

| Thư mục | Nội dung |
|---|---|
| `apps/api` | NestJS: config có danh sách tài khoản được phép, pool Oracle, 7 module (health, companies, reports, metrics, screening, imports, market) |
| `apps/etl` | Thu thập giá (VNDirect, đối chiếu CafeF + SSI), dựng bộ dữ liệu đã nghiệm thu, nạp bằng tài khoản ETL, sinh seed (TypeScript chạy trực tiếp bằng Node 24) |
| `apps/web` | Next.js App Router, 5 màn hình, biểu đồ lightweight-charts |
| `apps/web-e2e` | Kiểm thử đầu-cuối Playwright |
| `libs/contracts` | Kiểu dữ liệu và giới hạn dùng chung giữa web và API |
| `db` | Bộ cài một lệnh, seed dữ liệu mẫu, script kiểm tra |
| `sql` | DDL, trigger, package, view, phân quyền, audit, tối ưu |
| `docs`, `design` | Tài liệu thiết kế, ERD |

## Bắt đầu

Có ba cách chạy. Dev mới nên dùng **cách B**: Oracle chạy trong Docker, còn API và web chạy trên máy để sửa code thấy ngay.

| Cách | Oracle | API + web | Khi nào dùng |
|---|---|---|---|
| A. Docker Compose toàn bộ | Docker | Docker | Xem demo, không sửa code |
| B. Oracle Docker + code local | Docker | `npm` trên máy | **Phát triển hằng ngày** |
| C. Oracle có sẵn | container của bạn | `npm` trên máy | Đã có Oracle 26ai Free đang chạy |

### Yêu cầu

- **Docker** có Compose v2 (`docker compose version`). Trên Linux, user phải chạy được `docker` không cần `sudo`.
- **Node.js 24** (`node -v`) và npm. Chỉ cần cho cách B và C.
- Khoảng **20 GB trống**: image Oracle 13,8 GB, dữ liệu database khoảng 4,3 GB, image API và web khoảng 0,8 GB.
- Mạng tải được image từ `container-registry.oracle.com`. Image Free công khai, không cần đăng nhập.
- Cổng trống: **1521** (Oracle), **4000** (API), **3000** (web). Nếu bị chiếm thì đổi trong `.env`, xem [Cấu hình `.env`](#cấu-hình-env).

### Cấu hình `.env`

```bash
cp .env.example .env
```

| Biến | Ý nghĩa |
|---|---|
| `ORACLE_PWD` | **Bắt buộc.** Mật khẩu SYS/SYSTEM của container Oracle: ít nhất 8 ký tự, có chữ hoa, chữ thường và số, ví dụ `Erp2026Dev`. Chỉ dùng cho quản trị; ứng dụng dùng các tài khoản riêng do bộ cài sinh ngẫu nhiên |
| `ORACLE_PORT` | Cổng Oracle trên máy (mặc định 1521) |
| `API_PORT`, `WEB_PORT` | Cổng API và web khi chạy bằng Docker (mặc định 4000, 3000). Chỉ ảnh hưởng cách A |

`.env` đã nằm trong `.gitignore`, không commit.

### Cách A: Docker Compose toàn bộ

```bash
docker compose up -d --build
docker compose logs -f oracle      # chờ dòng "[db:install] done", rồi Ctrl+C
```

Lần đầu mất khoảng 5–10 phút: build image API và web, khởi động Oracle, rồi cài schema, seed dữ liệu và tự kiểm tra (132 dòng báo cáo, 72 chỉ số, 2.991 phiên giá…). Trong lúc đó container `api` sẽ khởi động lại vài lần; điều này là bình thường, vì API chờ bộ cài ghi xong mật khẩu.

Sau đó mở:
- Giao diện: http://localhost:3000
- Tài liệu API: http://localhost:4000/api/docs
- Kiểm tra nhanh: `curl localhost:4000/api/health` trả về `"status":"ok"` và `"user":"ERP_APP"`

Nếu đổi `API_PORT`/`WEB_PORT` thì thay số cổng trong các địa chỉ trên.

### Cách B: Oracle trong Docker, API và web trên máy

```bash
npm ci                             # cài thư viện (lần đầu, hoặc khi package-lock.json đổi)
docker compose up -d oracle        # chỉ bật Oracle
docker compose logs -f oracle      # chờ "[db:install] done", rồi Ctrl+C
npm run db:env                     # lấy mật khẩu từ Docker -> apps/api/.env và .local/db-accounts.env
```

Rồi mở hai terminal:

```bash
npm run start:api                  # http://localhost:4000/api  (Swagger: /api/docs)
npm run start:web                  # http://localhost:3000
```

`npm run db:env` chép thông tin đăng nhập mà bộ cài ghi trong volume Docker ra máy, đổi địa chỉ thành `localhost:<ORACLE_PORT>`. Nếu `apps/api/.env` đã có (ví dụ từ một database khác), lệnh dừng lại; chạy `FORCE=1 npm run db:env` để ghi đè.

Cách này không cần `npm run db:install`: Oracle trong Docker tự cài schema ở lần bật đầu.

### Cách C: dùng Oracle có sẵn

Dành cho khi bạn đã có một container Oracle AI Database 26ai Free **chưa có** schema `ERP_DESIGN_V1` (mặc định tên `oracle-free`, PDB `FREEPDB1`, cổng 1521).

```bash
npm ci
npm run db:install                 # dựng schema, nạp seed, kiểm tra, ghi apps/api/.env
npm run start:api
npm run start:web
```

Tên container khác thì thêm `ORACLE_CONTAINER=<tên>` trước lệnh. Bộ cài **không bao giờ sửa schema đã tồn tại**: nếu `ERP_DESIGN_V1` đã có, nó dừng lại. Khi đó dùng lại `apps/api/.env` từ lần cài trước và chạy `npm run db:verify` để kiểm tra. Các biến khác: `ERP_OWNER`, `ERP_APP_USER`, `ERP_TABLESPACE`, `ERP_WITH_AUDIT`… (đầu file `db/install.sh`). Bộ cài ghi mật khẩu vào `apps/api/.env` và `.local/db-accounts.env` (quyền 600, không commit).

### Vận hành hằng ngày

```bash
docker compose up -d               # bật lại (dữ liệu còn nguyên, không cài lại)
docker compose ps                  # trạng thái; oracle phải "healthy"
docker compose stop                # tắt, giữ container
docker compose down                # xoá container, giữ dữ liệu trong volume
docker compose down -v             # xoá cả dữ liệu; lần bật sau cài lại từ đầu
docker compose up -d --build api web   # build lại API/web sau khi sửa code (cách A)
```

Sau `down -v` ở cách B, chạy lại `FORCE=1 npm run db:env`, vì mật khẩu được sinh mới.

Kiểm tra lại dữ liệu trong Oracle của Compose:

```bash
ORACLE_CONTAINER=equity-research-platform-oracle-1 npm run db:verify
```

Mở SQL*Plus với quyền quản trị: `docker compose exec oracle sqlplus / as sysdba`. Mật khẩu các tài khoản dịch vụ (`ERP_APP`, `ERP_ETL`) nằm trong `.local/db-accounts.env` sau khi chạy `db:env`.

### Xử lý sự cố

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| `api` khởi động lại liên tục | Bộ cài chưa xong. Xem `docker compose logs oracle \| grep db:install`. Nếu có `ERROR`, xem lỗi, rồi `docker compose down -v` và bật lại |
| `oracle` mãi chưa `healthy` | Lần đầu cần vài phút. Kiểm tra dung lượng đĩa (`df -h`) và RAM (Oracle cần khoảng 2 GB) |
| `port is already allocated` / `address already in use` | Cổng đã có tiến trình khác dùng (một Oracle khác, `npm run start:*` đang chạy). Tắt tiến trình đó, hoặc đổi `ORACLE_PORT`/`API_PORT`/`WEB_PORT` trong `.env` |
| `npm run db:install` báo owner đã tồn tại | Schema đã cài. Không cần cài lại; dùng `npm run db:verify` |
| API báo `ORA-12541` / không kết nối được | Oracle chưa chạy, hoặc `ORACLE_CONNECT_STRING` trong `apps/api/.env` sai cổng. Ở cách B chạy lại `FORCE=1 npm run db:env` |
| `ORA-01017` (sai mật khẩu) | `apps/api/.env` là của database khác hoặc của lần cài trước `down -v`. Chạy lại `FORCE=1 npm run db:env` |
| Web hiện lỗi mạng/CORS | API chưa chạy, hoặc web không gọi đúng cổng API. Khi chạy local, đặt `NEXT_PUBLIC_API_URL=http://localhost:<cổng>/api` nếu API không ở cổng 4000 |

## Kiểm thử

```bash
npm test                      # đơn vị: contracts, api (cấu hình, ánh xạ lỗi, quét SQL chỉ đọc), web (định dạng, Redux, form)
npm run test:integration      # API trên Oracle thật, chạy trên 2 schema
npm run test:e2e              # Playwright: luồng demo + trạng thái biên + ảnh chụp vào dist/screenshots
npm run db:verify             # đối chiếu lại dữ liệu trong database với bộ chuẩn
npm run lint
npx nx run etl:test           # quy tắc chuẩn hóa và phân xử nguồn giá
```

## Dữ liệu giá

```bash
npm run etl:fetch             # tải gốc vào data/market_raw/<run>/ (URL + SHA-256 từng tệp)
npm run etl:build             # chuẩn hóa, đối chiếu VNDirect với CafeF, SSI phân xử -> db/seed/market/
npm run etl:load              # nạp qua pkg_etl_api bằng tài khoản ERP_ETL (đợt mới; nội dung trùng -> SKIPPED)
npm run etl:export-seed       # sinh db/seed/market_seed.sql và market_verify.sql cho bộ cài
```

`etl:build` dừng nếu còn bất kỳ khác biệt nào chưa phân xử được. Mỗi trường giá bị sửa được lưu thành hiệu chỉnh có lý do và bằng chứng; xem [docs/17](docs/17_PHAN_TICH_GIA_VA_DINH_GIA.md) mục 3.

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
| `POST /api/screening` | Sàng lọc `{year \| date, conditions:[{metric, op, value}]}`; ngưỡng theo đơn vị lưu trữ (tỷ lệ, lần, đồng) |
| `GET /api/compare?symbols=&year=&date=` | So sánh 2–3 mã, kèm hàng định giá/thị trường |
| `GET /api/imports`, `GET /api/imports/:batchId/errors` | Đợt nhập và lỗi |
| `GET /api/companies/:symbol/prices?from=&to=&basis=&interval=` | Chuỗi giá ngày/tháng (điều chỉnh hoặc gốc), nguồn, các hiệu chỉnh |
| `GET /api/companies/:symbol/market-metrics?date=` | Lợi suất, biến động, MA, cao/thấp 52 tuần tại phiên gần nhất ≤ date |
| `GET /api/companies/:symbol/valuation?date=` | Vốn hóa, EPS, P/E, BVPS, P/B, năm BCTC dùng (hồi cứu) |
| `GET /api/market/catalog` | 17 chỉ số thị trường và định giá |

Lỗi có định dạng thống nhất `{"error": {"code", "message", "requestId"}}`, không lộ chi tiết Oracle.

## Giới hạn dữ liệu

- Phân tích **hồi cứu**: ngày công bố của từng báo cáo chưa được xác minh.
- Định giá dùng quy tắc hồi cứu: BCTC năm N áp dụng từ 01/04 năm N+1. Giá điều chỉnh là ảnh chụp của nguồn tại ngày tải (08/11/2026). Số cổ phiếu lấy theo số cuối quý.
- Dữ liệu mẫu gồm 3 doanh nghiệp. Việc đối chiếu được thực hiện bằng quy trình tự động so với PDF kiểm toán, không phải ý kiến kiểm toán độc lập.

## Tài liệu

Xem [docs/README.md](docs/README.md): đặc tả, hợp đồng dữ liệu và công thức, ERD và từ điển dữ liệu, nhập dữ liệu, tính chỉ số, phân quyền, quản trị vận hành (tablespace, audit, tối ưu, sao lưu – phục hồi), hợp đồng dữ liệu cho ứng dụng, phân tích – kế hoạch – kết quả ứng dụng.
