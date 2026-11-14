# Kết quả giai đoạn 2: giá ngày và định giá

Phiên bản 1.0 — 08/11/2026. Kết quả triển khai [kế hoạch tổng thể](16_KE_HOACH_GIA_VA_DINH_GIA.md), theo [phân tích](17_PHAN_TICH_GIA_VA_DINH_GIA.md) và [kế hoạch chi tiết](18_KE_HOACH_TRIEN_KHAI_GIA.md). Trạng thái: **hoàn thành P-01…P-09 trên 3 mã**, chờ người dùng duyệt và commit. P-10 (10 mã), P-11 (cổ tức), P-12 (VN-Index) không làm theo lựa chọn của người dùng.

## 1. Đã có gì

| Mã | Kết quả |
|---|---|
| P-01 | **2.991 phiên** (997 × FPT, HPG, VNM) từ 04/01/2022 đến 31/12/2025, mỗi phiên lưu cả giá gốc và giá điều chỉnh (5.982 dòng). 2022 là năm làm nóng cho cửa sổ 252 phiên |
| P-02 | **39 mốc số cổ phiếu** theo ngày hiệu lực (cuối quý, từ 31/12/2022); **12/12 số cuối năm khớp vốn cổ phần ÷ mệnh giá**, do chính CSDL kiểm khi nhập |
| P-03 | Lợi suất 1/3/6/12 tháng, biến động năm, MA20/50/200, cao/thấp 52 tuần, cách đỉnh 52 tuần — hàm phân tích trong `mv_market_daily` |
| P-04 | Vốn hóa, EPS, P/E, BVPS, P/B tại mọi phiên — `v_valuation_daily`, chính sách hồi cứu `RETRO-APR01` |
| P-05 | Tab **Giá**: nến/đường, khối lượng, MA bật tắt, 1T/3T/6T/1N/3N/Tất cả, giá điều chỉnh/gốc, nguồn và các phiên đã hiệu chỉnh |
| P-06 | **Thẻ định giá** ở đầu trang chi tiết; 17 hàng định giá/thị trường trong trang so sánh (chọn ngày) |
| P-07 | **Sàng lọc theo ngày**: tài chính + định giá + thị trường trong một lần gọi Oracle (`pkg_screening.screen_at`); lời gọi cũ theo năm không đổi |
| P-08 | Nhập có kiểm định, chống trùng, hash, hiệu chỉnh có lý do, theo dõi ở màn Đợt nhập; ETL TypeScript trong repo (`apps/etl`) |
| P-09 | Phân vùng theo năm, 2 materialized view, đo trước–sau trên dữ liệu nhân bản (mục 5) |

Ảnh chụp: `dist/screenshots/09-gia-dinh-gia.png`, `10-sang-loc-theo-ngay.png`, `11-so-sanh-dinh-gia.png` (cùng 8 ảnh cũ, cục bộ).

## 2. Dữ liệu và nghiệm thu

| Thành phần | Nguồn | Nghiệm thu |
|---|---|---|
| Giá ngày | VNDirect finfo (nguồn chính, nhập) | So từng trường với CafeF; khác nhau thì SSI phân xử (mục 3 của docs/17) |
| Số cổ phiếu | VNDirect `ratios` mã 51004 | Số cuối năm = vốn 411a ÷ 10.000 (cổ phiếu quỹ 0) |
| Vốn cổ phần, cổ phiếu quỹ, lợi ích CĐKKS | CafeF (giá trị nhà cung cấp) | Đọc từ bảng cân đối hợp nhất kiểm toán (PDF): 35 khớp, **1 hiệu chỉnh** (VNM 2025 mã 429: CafeF 0 → 3.797.632.379.221) |

Hiệu chỉnh giá (đều do VNDirect sai, CafeF và SSI cùng xác nhận): FPT 18/07/2025 đóng cửa 126,03 → 126,0 (sai bước giá); VNM 13/05/2025 đóng cửa 56,5 → 58,5 (ngoài biên độ ngày); VNM 15/10/2025 63,65 → 63,6 (sai bước giá). Mỗi hiệu chỉnh lưu ở `price_corrections` (giá trị nhà cung cấp, giá trị nhận, lý do, bằng chứng) và gắn cờ `is_corrected` trên dòng giá. Ngược lại, 3 phiên CafeF ghi thiếu (19–20/01/2022, 06/03/2024) và 2 phiên CafeF bị thiếu (03/02/2025, 14/08/2025 cho VNM) được giữ theo VNDirect vì SSI xác nhận.

Bộ dữ liệu đã nghiệm thu nằm trong repo: `db/seed/market/` (CSV + `manifest.json` có hash từng tệp + `reconciliation.json`); bản gốc tải về ở máy (`data/market_raw/`, 117 tệp, có URL và SHA-256).

## 3. Database

| Hạng mục | Trước | Sau |
|---|---|---|
| Bảng | 23 | **30** (+`staging_market_rows`, `market_heads`, `share_counts`, `capital_facts`, `price_corrections`, `valuation_policies`, `market_metric_definitions`; `daily_prices` tạo lại phân vùng) |
| View | 13 | **23** (+9 cho ứng dụng, +`v_price_current` nội bộ) + **2 materialized view** |
| Package | 5 | **6** (`pkg_market_import`; `pkg_etl_api` thêm 4 thủ tục; `pkg_screening.screen_at`) |
| Trigger | 14 | **20** (bất biến giá/hiệu chỉnh/số cổ phiếu/vốn; guard + lịch sử `market_heads`) |
| Khóa ngoại | 35 | **49** |

Migration: `sql/020`–`024` (024 chỉ cho CSDL đã cài: thêm hành động audit cho bảng mới). Từ điển: [05_TU_DIEN_DU_LIEU_THI_TRUONG.md](05_TU_DIEN_DU_LIEU_THI_TRUONG.md); ERD: [SVG](../design/erd_market.svg), [PNG](../design/erd_market.png), [Mermaid](../design/erd_market.mmd) — đều sinh từ metadata thật.

Quy trình áp dụng: xuất Data Pump schema chính trước (`erp_design_v1_pre_market.dmp`) → thử trên `ERP_IMPORT_TEST` → áp lên `ERP_DESIGN_V1` → nạp bằng tài khoản **`ERP_ETL` thật** qua facade (`nx run etl:load`). Kết quả tài chính trước/sau giống hệt (72 kết quả, 171 lineage, cùng hash giá trị).

## 4. Kiểm thử

| Bộ | Kết quả | Bằng chứng |
|---|---|---|
| ETL đơn vị (`nx run etl:test`) | 12/12 | quy tắc chuẩn hóa, phân xử SSI, bước giá HOSE, CSV |
| CSDL thị trường (`scripts/check_oracle_market.py`) | **20/20** | `evidence/oracle_market_tests/20261108T034522` (lần chạy đầu 11/20 do lỗi kịch bản kiểm thử, giữ nguyên) |
| Giá trị tham chiếu độc lập (TypeScript ↔ SQL) | **273/273** khớp ≤ 1e-9 | `db/seed/market_verify.sql` |
| Hồi quy lớp ứng dụng / phân quyền / audit | 17/17, 38/38, 10/10 | `evidence/*_after_market/` (bằng chứng gốc giữ nguyên) |
| Contracts / API đơn vị / web đơn vị | 8, 16, 29 | |
| API tích hợp | `ERP_DESIGN_V1` 38/38; `ERP_IMPORT_TEST` 27 + 11 bỏ qua (chỉ dành cho dữ liệu chính) | |
| Playwright | **13/13** | gồm thẻ định giá, biểu đồ, hiệu chỉnh, sàng lọc theo ngày, so sánh |
| Cài từ đầu (`db:install` vào `ERP_INSTALL_CHECK2`) | 22,7 s; 72/72 chỉ số + 273 giá trị thị trường khớp; nạp lại bằng tài khoản ETL mới → toàn bộ SKIPPED | |

20 ca CSDL gồm: nạp đúng; nạp lại cùng khóa không nhân bản; cùng nội dung đợt mới → SKIPPED; cùng artifact khác nội dung → từ chối; OHLC sai; trùng phiên, cuối tuần, khoảng trống > 10 ngày, ngoài cửa sổ hợp đồng; sai hash, sai nguồn; hiệu chỉnh không hợp lệ; số cổ phiếu cuối năm lệch vốn; nhóm vốn thiếu chỉ tiêu, khác nhau không lý do, CĐKKS ≥ vốn chủ, xung đột với số đã nhập; đợt PARTIAL và lỗi tồn tại sau rollback nhóm; chuỗi mới dời head + làm mới MV, nạp lại chuỗi cũ kích hoạt lại; rollback của người gọi; **hai session tranh khóa (ORA-00054 ngay, không chờ)**; bất biến; quyền APP/ETL; sàng lọc cũ không đổi và `screen_at` khớp từng giá trị; lỗi hiện ở màn Đợt nhập; lớp tài chính không đổi.

## 5. Tối ưu — đo trước/sau

`scripts/benchmark_market.py` trên `ERP_PERF_TEST`: chuỗi giá thật nhân bản cho 60 mã (119.640 dòng giá, 59.820 phiên), 600 công ty; 15 lần đo sau 3 lần khởi động; mọi cặp so sánh cùng hash kết quả. Bằng chứng `evidence/oracle_market_perf/20261108T034315` (trước tối ưu sàng lọc) và `…034503` (sau).

| Truy vấn | Cách làm | Thời gian (trung vị) | Buffer gets/lần |
|---|---|---|---|
| Biểu đồ 1 mã, 1 năm | bảng phân vùng / bản sao không phân vùng | 0,48 / 0,45 ms | **63 / 92** |
| Tổng hợp mọi mã trong năm 2025 | phân vùng (pruning còn 1 phân vùng) / không phân vùng | 10,2 / 6,9 ms | **349 / 1.264** |
| Lợi suất 1 năm + MA200 mọi mã tại một ngày | **materialized view** / tính trực tiếp bằng hàm phân tích | **0,16 / 184 ms** | 63 / 1.382 |
| Định giá mọi mã tại một ngày | view tính khi đọc | 37,5 ms | 1.819 |
| Sàng lọc theo ngày, 3 điều kiện, 600 công ty | `screen_at` trước / sau khi tính trước các tập con (`MATERIALIZE`) và đẩy khoảng ngày vào view định giá | **4.696 → 229 ms** | **449.561 → 21.632** |

Nhận xét trung thực: phân vùng giảm 30–72% buffer gets nhờ chỉ đọc phân vùng của năm cần, nhưng ở cỡ dữ liệu này thời gian không nhanh hơn (đọc tuần tự bảng nhỏ đã rất rẻ); giá trị chính là minh họa partition pruning và chuẩn bị cho dữ liệu lớn hơn. Materialized view mang lại lợi ích lớn nhất (≈1.000 lần) vì các cửa sổ 252 phiên phải duyệt toàn bộ lịch sử. Tối ưu `screen_at` là thay đổi có thật duy nhất được đưa vào mã sản phẩm sau đo đạc (`sql/023`). Làm mới hoàn toàn cả hai MV ở 60 mã: 2,6–3,1 giây (nạp giá cho 3 mã thật: 1,1 giây gồm cả làm mới).

## 6. Khác kế hoạch

| # | Kế hoạch | Thực tế | Lý do |
|---|---|---|---|
| K1 | Đối chiếu 2 nguồn | 3 nguồn (VNDirect, CafeF, SSI) | Cả nguồn chính lẫn nguồn đối chiếu đều có lỗi; cần nguồn thứ ba để phân xử thay vì chọn tùy ý |
| K2 | Lợi ích CĐKKS là chỉ tiêu BCTC mới | Bảng `capital_facts` riêng | Đưa vào luồng 11 chỉ tiêu sẽ tạo snapshot mới và đổi 72 chỉ số đã nghiệm thu |
| K3 | Giá 2023–2025 | 2022–2025 | Năm làm nóng cho cửa sổ 252 phiên |
| K4 | MV theo tháng | MV ngày (chỉ số) + MV tháng (biểu đồ dải dài) | Sàng lọc theo ngày cần chỉ số ngày |
| K5 | — | Thêm `sql/024` | Policy audit cũ liệt kê bảng tại thời điểm tạo |
| K6 | Đường MA trên biểu đồ từ CSDL | Biểu đồ tự tính MA từ chuỗi đầy đủ (cùng quy tắc cửa sổ đủ); thẻ chỉ số lấy từ CSDL | API giá trả chuỗi đầy đủ một lần; không cần endpoint thêm |
| K7 | Ước lượng 13–20 ngày công | Một phiên làm việc | Hạ tầng giai đoạn 1 (facade, kiểm thử, bộ cài) dùng lại được |

## 7. Việc còn mở

- **Đĩa `/` còn ~1,4 GB (98%)**: đợt này sinh thêm 3 archive log (~575 MB). Dọn/chuyển archive log ảnh hưởng toàn instance (kể cả THACSI) — cần người dùng quyết.
- Schema giữ làm bằng chứng, có thể xóa khi người dùng đồng ý: `ERP_INSTALL_CHECK2` (18 MB, tài khoản `ERP_IC2_APP`/`ERP_IC2_ETL`, role `ERP_IC2_*`), dữ liệu nhân bản trong `ERP_PERF_TEST` (bảng `daily_prices_flat`, đợt `perf-market-replica`).
- Giá điều chỉnh là ảnh chụp tại ngày tải (08/11/2026); tải lại sau sự kiện doanh nghiệp: `nx run etl:fetch` → `etl:build-dataset` → `etl:load` (đợt mới, head mới) → `etl:export-seed`.
- Ngày công bố BCTC vẫn chưa xác minh: định giá luôn gắn nhãn "hồi cứu".
- Số cổ phiếu theo quý trễ so với ngày phát hành thực (ví dụ cổ phiếu thưởng giữa quý).
- Điều khoản sử dụng API công khai của VNDirect/CafeF/SSI chưa có văn bản cho phép tái phân phối; repo chỉ chứa giá đã chuẩn hóa phục vụ học tập.
- Chưa build image Docker thật (đĩa); Dockerfile không cần đổi.
