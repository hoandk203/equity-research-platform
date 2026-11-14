# Kế hoạch triển khai: giá ngày và định giá

Phiên bản 1.0 — 08/11/2026. Giai đoạn B của [docs/16](16_KE_HOACH_GIA_VA_DINH_GIA.md), dựa trên phân tích [docs/17](17_PHAN_TICH_GIA_VA_DINH_GIA.md). Trạng thái: **đã thực hiện**, kết quả và các điểm khác kế hoạch ở [docs/19](19_KET_QUA_GIA_VA_DINH_GIA.md).

## 1. Hợp đồng dữ liệu `erp-market/1.0.0`

| Mapping | Grain (một dòng staging) | Khóa nghiệp vụ | Kiểm định trong CSDL |
|---|---|---|---|
| `capital-review/1.0.0` | công ty × năm × chỉ tiêu (`share_capital`, `treasury_shares`, `non_controlling_interest`) | (company, year, item) — bất biến | đủ 3 chỉ tiêu/năm; năm 2022–2025; số nguyên VND ≥ 0; artifact nhà cung cấp là JSON CAFEF có đúng hash; bằng chứng là PDF của nguồn `<MÃ>_IR` có đúng hash, trang > 0; giá trị khác nhau bắt buộc có lý do hiệu chỉnh; vốn chủ hiện hành − CĐKKS > 0 |
| `vndirect-shares/1.0.0` | mã × ngày hiệu lực | (security, batch, date) | số nguyên > 0; ngày 31/12/2022–31/12/2025; artifact JSON VNDIRECT đúng hash; **số cuối năm = vốn 411a ÷ 10.000 khi cổ phiếu quỹ = 0** (đọc `capital_facts`) |
| `vndirect-prices/1.0.0` | mã × phiên (sinh 2 dòng giá: gốc, điều chỉnh) | (security, basis, batch, date) | ngày 2022–2025, không trùng, không thứ Bảy/CN; số thập phân ≤ 6 chữ số; OHLC hợp lệ ở cả hai loại giá; khối lượng nguyên ≥ 0; mọi dòng một mã cùng một artifact; khoảng cách giữa hai phiên liên tiếp ≤ 10 ngày (Tết dài nhất 9 ngày); hiệu chỉnh khai báo phải khác giá trị nhà cung cấp |

Quy tắc chung: đợt nhập (`etl_batches`) cùng vòng đời CREATED → STAGED → VALIDATED → IMPORTING → COMPLETED/PARTIAL/FAILED; nhóm lỗi (một mã hoặc một năm-công ty) bị từ chối nguyên nhóm, lỗi ghi `etl_errors` tồn tại sau rollback; nạp lại cùng nội dung → SKIPPED; cùng artifact khác nội dung → từ chối. Đợt giá/số cổ phiếu thành công dời `market_heads` (một con trỏ mỗi mã × loại dữ liệu) và làm mới materialized view.

## 2. Công thức (`market-formula/1.0.0`)

Ký hiệu: `C` giá đóng cửa điều chỉnh (đồng), `P` giá đóng cửa gốc (đồng), `S(D)` số cổ phiếu có ngày hiệu lực gần nhất ≤ D, `N` năm BCTC theo chính sách `RETRO-APR01`.

| Mã | Nhóm | Công thức | Đơn vị | Điều kiện có giá trị |
|---|---|---|---|---|
| CLOSE_PRICE | Thị trường | P | đồng | có phiên |
| RETURN_1M / 3M / 6M / 1Y | Thị trường | C_t / C_{t−k} − 1, k = 21 / 63 / 126 / 252 phiên | % | đủ k phiên trước |
| VOLATILITY_1Y | Thị trường | độ lệch chuẩn mẫu của lợi suất ngày trong 252 phiên × √252 | % | đủ 252 lợi suất |
| MA20 / MA50 / MA200 | Thị trường | trung bình C của 20 / 50 / 200 phiên gần nhất | đồng | đủ cửa sổ |
| HIGH_52W / LOW_52W | Thị trường | max cao / min thấp điều chỉnh trong 252 phiên | đồng | đủ 252 phiên |
| DIST_52W_HIGH | Thị trường | C / HIGH_52W − 1 | % | như trên |
| MARKET_CAP | Định giá | P × S(D) | đồng | có S(D) |
| EPS | Định giá | LNST công ty mẹ (N) ÷ S(D) | đồng/cp | có N, S(D) |
| PE | Định giá | MARKET_CAP ÷ LNST công ty mẹ (N) | lần | LNST mẹ > 0 |
| BVPS | Định giá | (vốn chủ (N) − lợi ích CĐKKS (N)) ÷ S(D) | đồng/cp | có CĐKKS |
| PB | Định giá | MARKET_CAP ÷ (vốn chủ (N) − CĐKKS (N)) | lần | vốn chủ mẹ > 0 |

Trạng thái định giá: `VALID`, `NO_PRICE`, `NO_SHARES`, `NO_REPORT` (chưa có BCTC năm N), `INPUT_NOT_VERIFIED` (dòng BCTC không VERIFIED hoặc có lỗi chất lượng mở), `NEGATIVE_EARNINGS`, `NEGATIVE_BOOK`. Đầu vào BCTC lấy từ snapshot hiện hành (`v_report_lines`), không tính lại 8 chỉ số.

## 3. Database (migration mới, không sửa file cũ trừ mẫu cấp quyền 010)

| Tệp | Nội dung |
|---|---|
| `sql/020_market_schema.sql` | Cấp CREATE MATERIALIZED VIEW; tạo lại `daily_prices` phân vùng theo năm (dừng nếu bảng có dữ liệu) + `batch_id`, `is_corrected`; bảng mới `staging_market_rows`, `market_heads`, `share_counts`, `capital_facts`, `price_corrections`, `valuation_policies`, `market_metric_definitions` (nạp 17 chỉ số); `etl_errors.market_staging_id`. 23 → **30 bảng** |
| `sql/021_market_import.sql` | `pkg_market_import` (definer; create_batch, stage_row, seal_batch, process_batch); thay `pkg_etl_api` bằng bản mở rộng (thêm nguồn VNDIRECT/JSON và 4 thủ tục thị trường, giữ nguyên 6 thủ tục cũ) |
| `sql/022_market_views.sql` | `mv_market_daily`, `mv_price_monthly` (REFRESH COMPLETE ON DEMAND); view `v_price_history`, `v_market_metrics_daily`, `v_price_monthly`, `v_share_counts`, `v_capital_facts`, `v_valuation_inputs`, `v_valuation_daily`, `v_market_metric_catalog`; cập nhật `v_import_errors` để hiện lỗi dòng thị trường |
| `sql/023_screening_v2.sql` | `pkg_screening.screen_at(date, conditions)`; `screen(year, conditions)` giữ nguyên chữ ký và hành vi |
| `sql/024_market_audit.sql` | Thêm INSERT/UPDATE/DELETE/LOCK/ALTER trên 7 bảng mới vào `ERP_DATA_CHANGE_POL` (CSDL đã cài); bộ cài mới tự có vì 014 liệt kê bảng lúc chạy |
| `sql/010_role_grants.sql` | READ 8 view mới cho APP và ETL |

Áp dụng: `ERP_IMPORT_TEST` trước (kiểm thử), rồi `ERP_DESIGN_V1`; dữ liệu nạp vào schema chính bằng `nx run etl:load` với tài khoản `ERP_ETL` thật.

## 4. ETL (`apps/etl`, project Nx `etl`)

| Target | Lệnh | Đầu ra |
|---|---|---|
| `etl:fetch` | `node apps/etl/src/fetch.ts` | `data/market_raw/<run>/` + manifest (URL, SHA-256, thời điểm) |
| `etl:build` | `node apps/etl/src/build-dataset.ts [run]` | `db/seed/market/`: `daily_prices.csv`, `share_counts.csv`, `capital_facts.csv`, `price_corrections.csv`, `reconciliation.json`, `manifest.json` |
| `etl:load` | `node apps/etl/src/load.ts --schema ERP_DESIGN_V1` | nạp qua `pkg_etl_api` bằng tài khoản ETL, kiểm hash tệp theo manifest |
| `etl:export-seed` | `node apps/etl/src/export-seed.ts` | `db/seed/market_seed.sql` (gọi thẳng `pkg_market_import`, dùng trong bộ cài) |
| `etl:test` | `node --test apps/etl/src/**/*.spec.ts` | kiểm thử quy tắc chuẩn hóa/phân xử |

## 5. API (NestJS) — module `market`

| # | Endpoint | Nguồn |
|---|---|---|
| M1 | `GET /api/companies/:symbol/prices?from&to&basis=ADJUSTED|UNADJUSTED&interval=day|month` | `v_price_history` / `v_price_monthly`; tối đa 1.100 phiên |
| M2 | `GET /api/companies/:symbol/market-metrics?date` | `v_market_metrics_daily` (phiên gần nhất ≤ date) |
| M3 | `GET /api/companies/:symbol/valuation?date` | `v_valuation_daily` + `v_valuation_inputs` (năm BCTC dùng, chính sách, nhãn hồi cứu, bằng chứng CĐKKS) |
| M4 | `GET /api/market/catalog` | `v_market_metric_catalog` |
| — | `POST /api/screening` thêm `date` | có `date` → `screen_at`; không có → `screen(year)` như cũ |
| — | `GET /api/compare` thêm `date` | thêm hàng định giá/thị trường |
| — | `GET /api/companies` | thêm giá đóng cửa gần nhất, thay đổi phiên, vốn hóa |

Kiểu mới trong `libs/contracts`; tiền VND trả chuỗi như hiện có; tỷ lệ trả số.

## 6. Giao diện (Next.js)

- Tab **Giá**: nến/đường (lightweight-charts), khối lượng, MA20/50/200 bật tắt, khoảng 1T/3T/6T/1N/3N/Tất cả, giá điều chỉnh/gốc, chú thích nguồn và số phiên đã hiệu chỉnh; thẻ chỉ số thị trường.
- **Thẻ định giá** đầu trang chi tiết: vốn hóa, P/E, P/B, EPS, BVPS, năm BCTC dùng + nhãn hồi cứu.
- **Sàng lọc**: chọn ngày (tùy chọn), danh mục điều kiện chia nhóm tài chính / định giá / thị trường, đơn vị nhập theo nhóm (%, lần, tỷ đồng, nghìn đồng).
- **So sánh**: hàng định giá và thị trường.
- **Danh sách**: cột giá, thay đổi, vốn hóa.

## 7. Các bước và tiêu chí

| Bước | Nội dung | Hoàn thành khi |
|---|---|---|
| C | Thu thập + đối chiếu (đã làm ở giai đoạn A) | `etl:build` chạy sạch, biên bản `reconciliation.json` |
| D1 | 020–023 trên `ERP_IMPORT_TEST` | 0 lỗi biên dịch; dữ liệu cũ không đổi |
| D2 | `scripts/check_oracle_market.py`: nhập đúng, nạp lại SKIPPED, cùng artifact khác nội dung, OHLC sai, trùng phiên, khoảng trống, sai hash, sai nguồn, hiệu chỉnh không hợp lệ, số cổ phiếu cuối năm lệch vốn, rollback nhóm lỗi, hai session tranh khóa, quyền APP/ETL, giá trị định giá khớp tính tay, sàng lọc cũ không đổi | tất cả PASS |
| D3 | Áp lên `ERP_DESIGN_V1` + `etl:load` bằng `ERP_ETL`; 024 audit | 72/171 không đổi; hồi quy 17 + 38 + 10 ca PASS |
| E | `export-seed`, bộ cài + verify mở rộng; cài từ đầu vào schema mới | số dòng và giá trị định giá chuẩn khớp |
| F | API + kiểm thử đơn vị/tích hợp 2 schema | PASS; lời gọi sàng lọc cũ vẫn chạy |
| G | Giao diện + Vitest + Playwright, ảnh chụp | PASS |
| H | Đo trước–sau (partition pruning, MV) + docs/19, cập nhật docs 02/04/05/12/README | toàn bộ kiểm thử PASS |
