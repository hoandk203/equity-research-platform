# Kế hoạch ứng dụng web

Phiên bản 1.3 — 08/11/2026. Trạng thái: **chờ người dùng duyệt**. Dựa trên [docs/13 — Phân tích](13_PHAN_TICH_UNG_DUNG.md) (đã duyệt) và [docs/12 — Hợp đồng dữ liệu](12_HOP_DONG_DU_LIEU_CHO_UNG_DUNG.md).

Bản 1.1 bổ sung tech stack do người dùng chỉ định: Nx monorepo, Redux Toolkit, React Hook Form, Swagger. Bản 1.2: theo người dùng, **bỏ MikroORM**; NestJS truy cập Oracle trực tiếp bằng driver `node-oracledb` qua lớp repository; **database giữ nguyên Oracle AI Database 26ai Free** đang chạy. Bản 1.3: repo GitHub là **dự án độc lập** (không gắn môn học): Nx workspace đặt ở gốc repo; thêm project `db` gồm seed tự chứa và bộ cài một lệnh (seed cách A — nạp qua package thật); `data/`, `scripts/`, `tests/`, `config/`, `evidence/`, `reports/` chỉ giữ cục bộ.

## 1. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Tech stack | **Nx monorepo · TypeScript · Next.js, Redux Toolkit, React Query, React Hook Form · NestJS, Swagger, node-oracledb (không ORM) · Oracle AI Database 26ai Free** |
| Database | Giữ nguyên Oracle AI Database 26ai Free 23.26.3.0.0, container `oracle-free`, PDB `FREEPDB1`; không cài thêm hay nâng cấp |
| Gọi API | Trình duyệt dùng TanStack Query (React Query) gọi thẳng NestJS; Next.js chỉ phục vụ giao diện |
| Tìm kiếm | Hỗ trợ tìm không dấu ("hoa phat" → Hòa Phát) |
| Lịch sử các lần tính | Không đưa vào 5 màn hình chính |
| Thời gian | Không gấp; chia bước nhỏ, mỗi bước có tài liệu và kiểm chứng |
| Repo | Dự án độc lập trên GitHub. Chứa: `apps/`, `libs/`, `db/`, `sql/`, `docs/`, `design/`. Không chứa tài liệu/bằng chứng môn học và pipeline chuẩn bị dữ liệu (phụ thuộc snapshot ngoài repo); các thư mục đó vẫn giữ trên máy |
| Dựng database từ repo | Seed **cách A**: số liệu 3 mã ở dạng văn bản trong `db/seed`, nạp qua đúng package nhập và tính chỉ số (kiểm định, snapshot, lineage như dữ liệu hiện tại). Database chỉ lưu hash/URL của file nguồn nên không cần file PDF hay snapshot |

## 2. Kiến trúc

```
Nx monorepo (gốc repo)
│
├─ apps/web ── Next.js (cổng 3000)
│     React Query: dữ liệu từ server · Redux Toolkit: trạng thái dùng chung giữa các trang
│     React Hook Form + zod: form sàng lọc
│         │  JSON qua HTTP (CORS chỉ cho localhost:3000)
│         ▼
├─ apps/api ── NestJS (cổng 4000, tiền tố /api, Swagger tại /api/docs)
│     Repository: câu SQL cố định, bind variable
│         │  driver node-oracledb (chế độ thin, không cần Oracle Client), connection pool
│         ▼
│   Oracle AI Database 26ai Free · FREEPDB1 ── tài khoản ERP_APP ── 10 view + pkg_screening
│
├─ libs/contracts ── kiểu dữ liệu và hằng số dùng chung giữa web và api
│
└─ db ── seed + bộ cài: tạo tablespace/user/role → chạy sql/ → nạp seed qua package → tính chỉ số → kiểm tra
```

### Vai trò từng công nghệ

| Công nghệ | Dùng cho | Không dùng cho |
|---|---|---|
| **Nx** | Quản lý hai ứng dụng + thư viện dùng chung trong một workspace; chạy build/test/lint theo từng project và chỉ chạy lại phần bị ảnh hưởng | — |
| **node-oracledb** (không ORM) | Mỗi module có một repository chứa câu SQL cố định (`SELECT` trên view, gọi `pkg_screening`) với bind variable, và hàm chuyển dòng kết quả sang kiểu trong `libs/contracts`. Lý do không dùng ORM: ứng dụng chỉ đọc view và gọi một hàm; view không có khóa chính; SQL tường minh dễ đưa vào báo cáo và khớp với plan đã đo ở docs/11 | Ghi dữ liệu, DDL. Repository chỉ chứa `SELECT`/gọi hàm (có kiểm thử quét); `ERP_APP` cũng không có quyền ghi, nên đây là hai lớp bảo vệ |
| **Swagger** (`@nestjs/swagger`) | Tài liệu API tự sinh từ DTO tại `/api/docs`; dùng cho người đọc báo cáo và để thử API | — |
| **React Query** | Mọi dữ liệu lấy từ server: cache, đang tải, lỗi, tải lại | Trạng thái giao diện thuần |
| **Redux Toolkit** | Trạng thái giao diện **dùng chung giữa nhiều trang**: giỏ "chọn để so sánh" (thêm mã từ danh sách/chi tiết rồi sang trang so sánh), bản nháp điều kiện sàng lọc khi rời trang rồi quay lại, tùy chọn hiển thị | Dữ liệu từ server (thuộc React Query; không dùng RTK Query để tránh hai cơ chế cache) |
| **React Hook Form** + zod | Form sàng lọc nhiều điều kiện (thêm/xóa dòng, kiểm tra từng ô, báo lỗi tại chỗ) | — |
| **URL** | Trạng thái của từng trang cần chia sẻ/chụp ảnh (năm, tab, mã đang xem) | — |

Quy tắc khi một trạng thái có thể nằm ở hai chỗ: **URL thắng** cho thứ cần tái tạo được một màn hình; Redux chỉ giữ thứ đi qua nhiều trang mà URL không mang theo.

### Bảo vệ ở backend

- **Tài khoản bị khóa cứng:** api chỉ khởi động nếu tài khoản là `ERP_APP` (hoặc `ERP_TEST_APP` khi kiểm thử) và schema là `ERP_DESIGN_V1` (hoặc `ERP_IMPORT_TEST`). Sai thì dừng với thông báo rõ (A-NFR-01).
- **Chỉ đọc:** repository chỉ chứa câu `SELECT` và lời gọi `pkg_screening.screen`; một kiểm thử quét mọi câu SQL trong mã để chắc không có `INSERT/UPDATE/DELETE/MERGE`/DDL.
- **Mã request:** mỗi request nhận mã `X-Request-Id` (tự sinh nếu thiếu). Hàm `withConnection(requestId, fn)` lấy một kết nối từ pool, đặt `connection.clientId = requestId` (gửi kèm lời gọi kế tiếp, không tốn thêm vòng gọi), chạy truy vấn, rồi trả kết nối về pool. Nhờ vậy `CLIENT_IDENTIFIER` của session khớp request, audit truy được (A-NFR-06). Nếu chế độ thin không hỗ trợ `clientId`, dùng dự phòng `DBMS_SESSION.SET_IDENTIFIER` (B2 kiểm chứng). Mã được trả lại trong header phản hồi và trong mọi lỗi.
- **Không ghép chuỗi SQL:** mọi câu SQL là hằng số trong repository, mọi giá trị đi qua bind variable. Tên schema lấy từ cấu hình đã kiểm tra theo danh sách cho phép (A-NFR-03).
- **Số tiền chính xác:** cột tiền VND được đọc dưới dạng chuỗi (`fetchTypeHandler` của node-oracledb), không qua kiểu số JavaScript.
- **Kiểm tra đầu vào** bằng DTO `class-validator` + `ValidationPipe` (mã chứng khoán, năm, danh sách mã, điều kiện sàng lọc) trước khi gọi Oracle (A-NFR-04). Giới hạn (năm hợp lệ, toán tử, tối đa 10 điều kiện, 2–3 mã) lấy từ `libs/contracts`, nên frontend và backend dùng cùng một giá trị.
- **Bộ lọc lỗi chung:** `ORA-20401`…`ORA-20405` → HTTP 400 kèm thông điệp tiếng Việt; lỗi kiểm tra đầu vào → 400; không tìm thấy → 404; còn lại → 500 với thông điệp chung. Không trả chi tiết Oracle hay stack trace cho client; chi tiết chỉ ghi log phía server (A-NFR-05).

## 3. Phiên bản

Chọn bản ổn định đã phát hành **ít nhất hai tuần** (tra npm ngày 08/11/2026), cố định bằng lockfile. Hai điều chỉnh so với bản 1.0 (NestJS, TypeScript) là do ràng buộc tương thích thực tế của Nx:

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Database | **Oracle AI Database 26ai Free 23.26.3.0.0** | Đang chạy, giữ nguyên |
| Node.js | 24.11.1 (đang có) | Next ≥ 20.9; NestJS 11 ≥ 20 |
| **Nx** (`nx`, `@nx/js`, `@nx/nest`, `@nx/next`, `@nx/jest`, `@nx/vitest`, `@nx/playwright`) | 24.0.1 | |
| TypeScript | **5.9.3** | Toolchain NestJS 11 dùng 5.9.3; Next 16 và Nx 24 hỗ trợ. *(Bản 1.0 chọn 6.0.3 vì NestJS 12)* |
| **NestJS** (`core`, `common`, `platform-express`, `testing`) | **11.2.8** | Plugin `@nx/nest` (mọi bản, kể cả mới nhất 24.0.5) chỉ hỗ trợ NestJS **< 12**. *(Bản 1.0 chọn 12.2.0)* |
| `@nestjs/config` | 4.0.4 | Dòng dành cho NestJS 11 |
| **`@nestjs/swagger`** | 11.4.7 | Dòng dành cho NestJS 11 |
| Driver `oracledb` (node-oracledb) | **26.0.0** | Driver Node.js chính thức của Oracle, chế độ thin; số phiên bản trùng tên Oracle 26ai nhưng là thư viện riêng. *(Bản 1.1 phải dùng 7.0.1 vì MikroORM; nay bỏ MikroORM nên dùng bản mới nhất)* |
| `class-validator` / `class-transformer` | 0.15.1 / 0.5.1 | |
| Next.js | 16.4.3 | `@nx/next` hỗ trợ < 17 |
| React / React DOM | 19.3.1 | |
| `@tanstack/react-query` | 5.104.5 | |
| **`@reduxjs/toolkit`** / `react-redux` | 2.13.0 / 9.3.0 | |
| **`react-hook-form`** / `@hookform/resolvers` / `zod` | 7.91.0 / 6.0.0 / 4.6.7 | |
| Kiểm thử api | Jest 30.5.2 (qua `@nx/jest`) + Supertest 7.3.1 | |
| Kiểm thử web | Vitest 5.0.5 (qua `@nx/vitest`) + Testing Library 16.3.3 | |
| Kiểm thử đầu-cuối | Playwright 1.64.1, chỉ Chromium (qua `@nx/playwright`) | Dùng thêm để chụp ảnh cho báo cáo |

## 4. Cấu trúc thư mục

```
<gốc repo>/                        Nx workspace = repo GitHub
  README.md                        giới thiệu, yêu cầu, cài database, chạy, kiểm thử
  nx.json  package.json  tsconfig.base.json  .gitignore
  apps/
    api/                           NestJS
      src/
        config/                    đọc .env, kiểm tra danh sách cho phép
        database/                  pool node-oracledb, withConnection(requestId), ánh xạ lỗi Oracle
        <module>/*.repository.ts   câu SQL cố định + chuyển dòng sang kiểu contracts
        common/                    request-id middleware, bộ lọc lỗi, chuẩn hóa tiếng Việt
        health/ companies/ reports/ metrics/ screening/ imports/
      test/                        kiểm thử API trên Oracle thật
      .env.example                 không chứa mật khẩu
    web/                           Next.js (App Router)
      src/app/                     các route (mục 6)
      src/store/                   Redux Toolkit (giỏ so sánh, bản nháp sàng lọc, tùy chọn)
      src/queries/                 hook React Query cho từng API
      src/lib/                     api client, định dạng số, nhãn trạng thái
      src/components/              bảng, nhãn trạng thái, đang tải/lỗi/rỗng
    web-e2e/                       Playwright
  libs/
    contracts/                     kiểu request/response, hằng số (năm, toán tử, giới hạn), mã chỉ số
  db/                              project Nx: nx run db:install
    seed/                          số liệu 3 mã (văn bản): nguồn, 132 dòng nhập, kết quả mong đợi để kiểm tra
    src/                           bộ cài TypeScript (node-oracledb, kết nối quản trị qua biến môi trường)
  sql/                             các file SQL cài đặt (bảng, trigger, package, view, quyền, audit, tối ưu)
  docs/  design/                   tài liệu kỹ thuật, ERD
```

Thư mục chỉ giữ trên máy (đã ignore): `data/`, `scripts/`, `tests/`, `config/`, `evidence/`, `reports/`, ghi chú nội bộ và hồ sơ môn học. File `.env` của api được sinh bởi bộ cài (mật khẩu ngẫu nhiên, quyền 0600) và không được commit.

## 5. API

Tiền tố `/api`; tài liệu Swagger tại `/api/docs`. JSON dùng camelCase. **Số tiền VND trả dạng chuỗi** để giữ chính xác tuyệt đối (giá trị tới 10¹³, kiểu Oracle `NUMBER(28,0)`); tỷ lệ trả dạng số. Kiểu dữ liệu request/response nằm trong `libs/contracts`.

| # | Phương thức và đường dẫn | Tham số | Nguồn Oracle | Màn hình |
|---|---|---|---|---|
| A1 | `GET /api/health` | — | `USER`, `SYS_CONTEXT` | Kiểm tra hệ thống |
| A2 | `GET /api/companies` | `q` (tùy chọn, ≤ 50 ký tự) | `v_company_directory`, `v_current_report_sets` | S1 |
| A3 | `GET /api/companies/:symbol` | `symbol` | `v_company_directory`, `v_current_report_sets` | S2 (đầu trang, danh sách năm) |
| A4 | `GET /api/companies/:symbol/reports` | `year` (bắt buộc) | `v_report_lines` | S2a |
| A5 | `GET /api/companies/:symbol/metrics` | `year` (bắt buộc) | `v_current_metrics` | S2b |
| A6 | `GET /api/metric-results/:resultId/lineage` | `resultId` | `v_metric_history`, `v_metric_lineage`, `v_metric_catalog` | S2c |
| A7 | `GET /api/metrics/catalog` | — | `v_metric_catalog` | S2c, S3 |
| A8 | `POST /api/screening` | `{year, conditions:[{metric, op, value}]}` (`value` là tỷ lệ thuần) | `pkg_screening.screen` (SQL thô có bind) | S3 |
| A9 | `GET /api/compare` | `symbols` (2–3 mã, phân cách dấu phẩy), `year` | `v_current_metrics`, `v_metric_catalog` | S4 |
| A10 | `GET /api/imports` | — | `v_import_batches` | S5 |
| A11 | `GET /api/imports/:batchId/errors` | `batchId` | `v_import_errors` | S5 |

Ghi chú:
- **A2 tìm không dấu:** danh mục doanh nghiệp rất nhỏ, nên backend đọc toàn bộ rồi lọc bằng chuẩn hóa Unicode (bỏ dấu, `đ` → `d`, không phân biệt hoa/thường) trên mã và tên. Đây là xử lý giao diện, không phải quy tắc nghiệp vụ.
- **A6** trả: thông tin kết quả (mã, năm, chỉ số, giá trị, trạng thái), công thức, danh sách đầu vào. `resultId` không tồn tại → 404.
- **A8:** frontend đổi ngưỡng từ đơn vị hiển thị sang tỷ lệ thuần trước khi gửi (10% → 0.10), dựa vào `displayUnit` của A7.
- **A9:** luôn trả đủ 8 chỉ số × mỗi mã; mã không có giá trị Hợp lệ được đánh dấu UNKNOWN kèm trạng thái gốc. Không lùi sang năm khác.
- **Lỗi** thống nhất: `{"error": {"code": "...", "message": "...tiếng Việt...", "requestId": "..."}}`; Swagger mô tả cả phản hồi lỗi.

### Lớp truy cập dữ liệu

| Repository | Nguồn Oracle | API |
|---|---|---|
| CompaniesRepository | `v_company_directory`, `v_current_report_sets` | A2, A3 |
| ReportsRepository | `v_report_lines` | A4 |
| MetricsRepository | `v_current_metrics`, `v_metric_history`, `v_metric_lineage`, `v_metric_catalog` | A5, A6, A7, A9 |
| ScreeningRepository | `pkg_screening.screen` | A8 |
| ImportsRepository | `v_import_batches`, `v_import_errors` | A10, A11 |

Truy vết (A6) lọc theo `result_id` như khuyến nghị ở docs/11; câu SQL của từng API được liệt kê trong tài liệu kết quả (docs/15) để đưa vào báo cáo.

## 6. Giao diện

| Route | Màn hình | Trạng thái giữ trên URL |
|---|---|---|
| `/` | S1 Danh sách doanh nghiệp | `?q=` |
| `/doanh-nghiep/[symbol]` | S2 Chi tiết (bốn tab: Báo cáo, Chỉ số, Truy vết, Giá) | `?nam=2025&tab=chi-so&ketqua=<resultId>` |
| `/sang-loc` | S3 Sàng lọc | `?nam=2024&dk=<điều kiện mã hóa>` |
| `/so-sanh` | S4 So sánh | `?ma=FPT,VNM&nam=2024` |
| `/dot-nhap` | S5 Đợt nhập | `?batch=<id>` |

- Trang hiển thị dữ liệu là client component; mỗi API có một hook React Query riêng (`useCompanies`, `useReportLines`…).
- **Redux store** gồm ba slice: `compareBasket` (tối đa 3 mã, nút "Thêm vào so sánh" ở S1/S2, mở S4 với các mã đã chọn), `screeningDraft` (điều kiện đang soạn, giữ khi chuyển trang), `preferences` (ví dụ hiện số VND đầy đủ hay theo tỷ đồng).
- **Form sàng lọc** dùng React Hook Form với `useFieldArray` (thêm/xóa điều kiện) và schema zod lấy giới hạn từ `libs/contracts`. Lỗi từ server (400) hiển thị lại đúng vào ô gây lỗi nếu xác định được.
- **Một nguồn duy nhất** cho định dạng số (`formatTyDong`, `formatPercent`, `formatTimes`) và nhãn trạng thái (bảng mục 7 của docs/13).
- Ba trạng thái chung có component riêng: đang tải, lỗi (hiển thị `requestId`), rỗng.
- Phong cách: CSS Modules và bảng màu của deck báo cáo (kem, xanh rừng, xanh xám), để ảnh chụp và slide đồng bộ. Không thêm thư viện UI lớn.
- Dòng ghi chú giới hạn cố định ở chân trang: "Phân tích hồi cứu; ngày công bố báo cáo chưa xác minh; chưa có dữ liệu giá".

## 7. Kiểm thử

Mọi kiểm thử chạy qua Nx (`nx test api`, `nx test web`, `nx e2e web-e2e`, `nx run-many -t test`).

| Tầng | Công cụ | Nội dung | Dữ liệu |
|---|---|---|---|
| Đơn vị api | Jest | Chuẩn hóa tiếng Việt, ánh xạ lỗi Oracle → HTTP, DTO, danh sách cho phép, quét SQL chỉ có `SELECT`/gọi hàm | Không cần database |
| API | Jest + Supertest | Mọi API: đúng dữ liệu, đúng mã lỗi, đầu vào độc hại; `CLIENT_IDENTIFIER` của session đúng bằng `requestId`; session là `ERP_APP`; Swagger JSON sinh được | `ERP_DESIGN_V1` (132 dòng, 9 hiệu chỉnh, 72 chỉ số, ví dụ sàng lọc 2024) và `ERP_IMPORT_TEST` cho trạng thái biên |
| Đơn vị web | Vitest + Testing Library | Định dạng số, nhãn trạng thái, đổi ngưỡng %, slice Redux, form sàng lọc (thêm/xóa điều kiện, lỗi tại chỗ), component rỗng/lỗi | Không cần backend |
| Đầu-cuối | Playwright | Luồng demo: tìm "hoa phat" → chi tiết → truy vết ROE VNM 2025 → thêm vào so sánh → sàng lọc → so sánh → đợt nhập | api + Oracle thật |
| Ảnh chụp | Playwright | Chụp 5 màn hình và trang Swagger theo URL cố định cho báo cáo | Như trên |

Kiểm thử hồi quy database (`check_oracle_app_api.py`, `check_oracle_access.py`) chạy lại sau mọi thay đổi ở Oracle.

## 8. Các bước triển khai

Mỗi bước kết thúc bằng: chạy kiểm thử của bước, cập nhật tài liệu liên quan và memory, báo kết quả ngắn cho người dùng. Có **bốn điểm dừng để duyệt**: sau B1 (thay đổi database), sau B5 (backend xong), sau B9 (giao diện xong), sau B11 (repo độc lập).

| Bước | Nội dung | Đầu ra | Hoàn thành khi |
|---|---|---|---|
| **B0** Chuẩn bị | `git init`; Nx workspace ở gốc repo (apps `api`, `web`, `web-e2e`; lib `contracts`; project `db` rỗng) với phiên bản ở mục 3; `.env.example`; sinh `.env` cho api từ tài khoản hiện có (tạm thời, đến B11 thì bộ cài đảm nhận) | Workspace build được khung rỗng | `nx run-many -t build` chạy được; `.env` quyền 0600; danh sách file sẽ commit không có bí mật hay thư mục cục bộ |
| **B1** Bổ sung database | `sql/019_metric_catalog.sql`: view `v_metric_catalog` (mã, tên, công thức, đơn vị, phiên bản, có cần năm trước) cấp cho APP/ETL; cập nhật `oracle_access.py`, docs/12 | View trên schema test và schema chính | Kiểm thử app API và 38 ca phân quyền chạy lại đạt; dữ liệu chính không đổi |
| ⏸ | *Điểm dừng 1: duyệt thay đổi database* | | |
| **B2** Khung api | Config + danh sách cho phép; pool node-oracledb; `withConnection` + `clientId`; bộ lọc lỗi; Swagger; A1 | `GET /api/health` trả `ERP_APP`; `/api/docs` mở được | Kết nối thật tới Oracle 26ai; kiểm thử `CLIENT_IDENTIFIER` đạt; api từ chối khởi động với tài khoản không được phép |
| **B3** API danh sách + đợt nhập | Repository + A2 (kể cả tìm không dấu), A10, A11 | 3 API, có trong Swagger | "hoa phat", "sữa", "fpt" đúng; 3 batch, 0 lỗi; batch không tồn tại → 404 |
| **B4** API chi tiết | Repository + A3, A4, A5, A6, A7 | 5 API | 132 dòng báo cáo khớp dữ liệu chuẩn (9 hiệu chỉnh); 72 chỉ số; truy vết ROE VNM 2025 có 3 đầu vào, có trang PDF; năm 2022 không có chỉ số |
| **B5** API sàng lọc + so sánh | A8, A9 | 2 API | Ví dụ 2024 → FPT, VNM Đạt, HPG Không đạt; 8 kiểu đầu vào sai → 400; so sánh sai số mã → 400; năm 2022 → UNKNOWN |
| ⏸ | *Điểm dừng 2: duyệt backend (kèm Swagger)* | | |
| **B6** Khung web | Layout, menu, bảng màu; React Query provider + api client; Redux store (3 slice); định dạng số, nhãn trạng thái; component đang tải/lỗi/rỗng | Trang khung chạy được | Kiểm thử đơn vị web đạt |
| **B7** S1 + S5 | Danh sách có tìm kiếm và nút "Thêm vào so sánh"; trang đợt nhập | 2 màn hình | Đúng tiêu chí S1, S5 ở docs/13 |
| **B8** S2 | Bốn tab: Báo cáo, Chỉ số, Truy vết, Giá | 1 màn hình | Đúng tiêu chí S2: hiệu chỉnh có PDF/trang, thiếu hiện rõ, truy vết đủ đầu vào |
| **B9** S3 + S4 | Form sàng lọc (React Hook Form + zod, giữ bản nháp trong Redux); bảng so sánh lấy mã từ URL hoặc giỏ so sánh | 2 màn hình | Đúng tiêu chí S3, S4 |
| ⏸ | *Điểm dừng 3: duyệt giao diện* | | |
| **B10** Hoàn thiện ứng dụng | Playwright đầu-cuối + ảnh chụp; **docs/15 — Kết quả ứng dụng** | Ảnh và kết quả kiểm thử | `nx run-many -t test` và e2e đạt |
| **B11** Repo độc lập | **Seed:** xuất từ database hiện tại sang `db/seed` (danh sách nguồn với hash/URL, 132 dòng nhập kèm thông tin hiệu chỉnh, 72 chỉ số + 171 đầu vào mong đợi). **Bộ cài `nx run db:install`:** kiểm tra kết nối quản trị → tạo tablespace, owner, role, user (mật khẩu ngẫu nhiên ghi vào `.env` của api) → chạy `sql/` đúng thứ tự → nạp seed qua `pkg_etl_api` → tính 9 bộ chỉ số → đối chiếu với kết quả mong đợi → tùy chọn cài audit. **README mới** cho dự án độc lập; rà `docs/` bỏ link tới thư mục cục bộ và nội dung riêng môn học | Repo tự dựng được database và chạy ứng dụng | Trên một **schema mới** của cùng Oracle 26ai: cài từ đầu ra đúng 132 số liệu, 9 hiệu chỉnh, 12 snapshot, 72 chỉ số, 171 đầu vào; ứng dụng chạy trên schema đó; schema hiện tại không bị đụng tới |

## 9. Quy ước

- Mã nguồn, tên biến và comment viết tiếng Anh; giao diện và thông điệp lỗi trả về người dùng viết tiếng Việt.
- Ranh giới phụ thuộc trong Nx: `web` và `api` được dùng `libs/contracts`; `web` không import gì từ `api` và ngược lại.
- Git được khởi tạo ở B0 (Nx dựa vào Git để xác định phần bị ảnh hưởng). Trước mỗi commit, kiểm tra danh sách file không chứa bí mật hay thư mục chỉ giữ cục bộ.
- Không chạy `npm audit fix --force` hay nâng phiên bản ngoài bảng mục 3 khi chưa ghi lại lý do.
- Mỗi bước được ghi vào memory dự án: đã làm gì, kiểm thử nào đạt, việc còn lại.

## 10. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| Driver node-oracledb 26 chế độ thin với Oracle 26ai, và việc gắn `clientId` | B2 kiểm tra kết nối thật, `clientId` và một truy vấn view trước mọi API khác; dự phòng `DBMS_SESSION.SET_IDENTIFIER` |
| NestJS 11 thay vì 12 | Bắt buộc do plugin Nx; NestJS 11 vẫn được bảo trì; nếu `@nx/nest` hỗ trợ 12 sau này thì nâng cấp riêng |
| `@nx/jest` khai báo `ts-jest ^29` | Kiểm tra ngay ở B0 với Jest 30; nếu lỗi thì chọn bản ts-jest/Jest tương thích và ghi lại |
| Dữ liệu thật thiếu trạng thái biên (cả 72 chỉ số Hợp lệ, 0 lỗi nhập) | Kiểm thử API trên `ERP_IMPORT_TEST`; giao diện kiểm thử thêm bằng dữ liệu giả ở tầng đơn vị |
| Đĩa phân vùng `/` còn khoảng 4 GB | Mã nguồn, `node_modules`, cache Nx và trình duyệt Playwright nằm trên `/home`; không dùng Docker cho ứng dụng |
| Bộ cài cần quyền quản trị Oracle; tạo audit policy cần thêm quyền `AUDIT_ADMIN` | Bộ cài kiểm tra quyền trước; thiếu `AUDIT_ADMIN` thì bỏ qua phần audit kèm cảnh báo, phần còn lại vẫn cài đủ |
| Đường dẫn datafile của tablespace phụ thuộc cách cài Oracle | Lấy từ cấu hình, mặc định theo container Oracle 26ai Free chính thức |
