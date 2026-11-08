# Kế hoạch giai đoạn 2: giá ngày và định giá

Phiên bản 1.0 — 08/11/2026. Trạng thái: **kế hoạch tổng thể, chưa triển khai**. Viết để bàn giao cho một phiên làm việc khác.

Mục tiêu do người dùng chốt: **ứng dụng giống một công cụ phân tích cổ phiếu thật**. Ngoài câu hỏi "doanh nghiệp kinh doanh tốt không" (8 chỉ số hiện có), ứng dụng cần trả lời được "cổ phiếu đang được định giá thế nào": biểu đồ giá, lợi suất, biến động, P/E, P/B, vốn hóa, và sàng lọc kết hợp tài chính với định giá.

## 0. Bàn giao cho phiên mới

**Đọc trước, theo thứ tự:**
1. `PROJECT_MEMORY.md` (chỉ có trên máy, không có trong repo): mục 20–23 ghi trạng thái mới nhất và các bài học.
2. [docs/15](15_KET_QUA_UNG_DUNG.md): ứng dụng hiện tại, kiểm thử, các điểm khác kế hoạch.
3. [docs/12](12_HOP_DONG_DU_LIEU_CHO_UNG_DUNG.md), [docs/02](02_HOP_DONG_DU_LIEU_VA_CHI_SO.md), [docs/04](04_THIET_KE_ERD.md): hợp đồng dữ liệu, công thức, ERD.
4. Tài liệu này.

**Cách làm việc người dùng đã chọn:** với mỗi giai đoạn lớn, viết **phân tích → kế hoạch chi tiết → triển khai**, chia bước nhỏ, mỗi bước có kiểm thử và cập nhật tài liệu cùng memory. Không tự commit; người dùng tự commit và push.

**Ràng buộc môi trường (không được vi phạm):**
- Oracle AI Database 26ai Free 23.26.3 chạy trong container `oracle-free` (PDB `FREEPDB1`), **dùng chung với schema THACSI của dự án khác**. Không sửa THACSI, không khởi động lại, không xóa container hay volume.
- Schema chính `ERP_DESIGN_V1` đang chứa dữ liệu đã nghiệm thu. Không chạy DDL dựng lại, không xóa dữ liệu. Thay đổi chỉ bằng migration mới (`sql/020_…`), thử trên `ERP_IMPORT_TEST` trước.
- Phân vùng `/` gần đầy (Docker và Oracle lưu ở đây). Mã nguồn, `node_modules` và dữ liệu tải về đặt trên `/home`. Không build image Docker trên máy này.
- Không sửa snapshot `../Hoc_Sau/data/` (thuộc dự án khác). Snapshot này **không có dữ liệu giá**.
- Bí mật chỉ nằm trong `.local/` và `apps/api/.env*` (đều bị Git bỏ qua). Không in mật khẩu ra log.

**Lệnh hay dùng** (chạy ở thư mục gốc repo):
```bash
npm test                    # đơn vị
npm run test:integration    # API trên Oracle thật (2 schema)
npm run test:e2e            # Playwright
npm run db:verify           # đối chiếu dữ liệu đã nghiệm thu
python3 scripts/check_oracle_app_api.py   # cục bộ: hồi quy lớp dữ liệu ứng dụng
python3 scripts/check_oracle_access.py    # cục bộ: hồi quy phân quyền
```
Khi chạy lại các script kiểm thử cục bộ, giữ nguyên bằng chứng cũ trong `evidence/`: lưu kết quả mới vào thư mục mới, không ghi đè.

## 1. Phạm vi

### Trong phạm vi
| Mã | Chức năng | Ghi chú |
|---|---|---|
| P-01 | **Giá ngày** 2023–2025 (mở, cao, thấp, đóng cửa, khối lượng) cho FPT, HPG, VNM | Khoảng 750 phiên × 3 mã ≈ 2.250 dòng |
| P-02 | **Số cổ phiếu lưu hành** theo thời điểm | Cần cho vốn hóa, P/E, P/B, EPS |
| P-03 | **Chỉ số thị trường theo ngày**: lợi suất ngày, tháng, năm; biến động (độ lệch chuẩn năm hóa); trung bình động 20/50/200 phiên; cao/thấp 52 tuần | Tính bằng SQL (hàm phân tích) |
| P-04 | **Định giá**: vốn hóa, EPS, P/E, BVPS, P/B tại một ngày | Dùng giá ngày đó + báo cáo tài chính năm đã chọn theo quy tắc mục 3 |
| P-05 | **Biểu đồ giá** ở tab Giá (đường hoặc nến, khối lượng, trung bình động), chọn khoảng thời gian | Thay cho thông báo "chưa có" |
| P-06 | **Thẻ định giá** ở trang chi tiết; thêm hàng định giá vào trang so sánh | |
| P-07 | **Sàng lọc kết hợp**: điều kiện tài chính + định giá + thị trường (ví dụ ROE ≥ 15% và P/E ≤ 12 và lợi suất 1 năm > 0) tại một ngày chọn | Mở rộng `pkg_screening` |
| P-08 | **ETL giá** có kiểm định, chống trùng, lưu nguồn và hash, theo dõi ở màn Đợt nhập | Cùng mô hình với nhập báo cáo tài chính |
| P-09 | **Kỹ thuật CSDL** trên dữ liệu thật: phân vùng theo ngày, materialized view tháng, đo tối ưu trước–sau | |

### Tùy chọn (quyết định ở bước phân tích)
| Mã | Nội dung | Lý do để riêng |
|---|---|---|
| P-10 | **Mở rộng lên 10 mã** của đặc tả ban đầu (MWG, PNJ, REE, GAS, DGC, VHC, GMD) | Sàng lọc định giá trên 3 mã ít ý nghĩa, nhưng mỗi mã mới phải thu thập và đối chiếu báo cáo tài chính như bộ 3 mã (tốn công nhất). Nên làm **sau** khi P-01…P-08 chạy ổn trên 3 mã |
| P-11 | Cổ tức tiền mặt, tỷ suất cổ tức | Cần nguồn sự kiện doanh nghiệp |
| P-12 | Chỉ số thị trường chung (VN-Index) để so sánh | Thêm một chuỗi giá, không phải cổ phiếu |

### Ngoài phạm vi
Giá theo thời gian thực hoặc trong phiên, đặt lệnh, danh mục đầu tư, cảnh báo, dự báo giá, khuyến nghị mua/bán.

## 2. Nguồn dữ liệu (giai đoạn A sẽ xác minh)

| Dữ liệu | Ứng viên | Cần kiểm tra |
|---|---|---|
| Giá ngày | Thư viện **Vnstock** (đã dùng để lấy danh sách mã), API công khai của các công ty chứng khoán (TCBS, SSI…), dữ liệu HOSE | Điều khoản sử dụng; có cả giá gốc và giá điều chỉnh không; đơn vị (đồng hay nghìn đồng); ngày nghỉ lễ; độ khớp giữa hai nguồn |
| Số cổ phiếu lưu hành | Trang hồ sơ doanh nghiệp CafeF/Vnstock; báo cáo thường niên | Ngày hiệu lực của con số; có tính cổ phiếu quỹ không |
| Số cổ phiếu (dự phòng) | **Suy ra từ báo cáo tài chính đã có**: vốn cổ phần phổ thông có quyền biểu quyết (bảng cân đối, mục 411a/4111) ÷ mệnh giá 10.000 đồng, trừ cổ phiếu quỹ (mục 415) nếu có | Chỉ có số cuối năm; phải thêm 2 chỉ tiêu mới vào hợp đồng dữ liệu và đối chiếu với PDF kiểm toán như 132 số hiện có |
| Sự kiện doanh nghiệp (chia cổ tức, tách cổ phiếu) | Nguồn giá điều chỉnh hoặc thông báo của sàn | Cần nếu tự điều chỉnh giá; có thể tránh bằng cách lưu giá điều chỉnh do nguồn cung cấp |

Quy tắc giữ nguyên từ giai đoạn 1: lưu file gốc tải về kèm SHA-256 và URL; đối chiếu mẫu với nguồn thứ hai; không dùng dữ liệu giả hay dữ liệu mẫu như dữ liệu thật; số liệu nào chưa đối chiếu thì gắn trạng thái chưa nghiệm thu.

## 3. Quyết định thiết kế cần chốt ở bước phân tích

| # | Vấn đề | Đề xuất ban đầu |
|---|---|---|
| Q1 | Lưu giá gốc, giá điều chỉnh hay cả hai | **Cả hai** khi nguồn có (bảng đã có cột `price_basis`). Biểu đồ và lợi suất dùng giá điều chỉnh; vốn hóa dùng giá gốc × số cổ phiếu tại ngày đó |
| Q2 | Số cổ phiếu: nguồn thị trường hay suy từ báo cáo tài chính | Bảng riêng theo ngày hiệu lực, ghi rõ nguồn từng dòng; ưu tiên số suy từ báo cáo đã kiểm toán vì đối chiếu được |
| Q3 | **Định giá tại ngày D dùng báo cáo năm nào** | Ngày công bố báo cáo **chưa xác minh**, nên cần một quy tắc hồi cứu rõ ràng. Đề xuất: giá trong năm N+1 dùng báo cáo năm N, tính từ một ngày cố định có cấu hình (ví dụ 01/04/N+1, sau hạn nộp báo cáo kiểm toán). Ghi nhãn "hồi cứu" trên giao diện; khi xác minh được ngày công bố thì thay bằng ngày thật |
| Q4 | P/E dùng lợi nhuận nào | **Lợi nhuận thuộc cổ đông công ty mẹ** (`parent_net_income`, đã có trong 132 số), vì vốn hóa chỉ thuộc về cổ đông công ty mẹ. P/B dùng vốn chủ sở hữu thuộc công ty mẹ, nên cần thêm chỉ tiêu lợi ích cổ đông không kiểm soát nếu lấy được |
| Q5 | Lưu sẵn chỉ số định giá hay tính khi đọc | Chỉ số thị trường đổi theo từng ngày, khác 8 chỉ số năm. Đề xuất: **không** đưa vào `metric_results`; dùng view tính khi đọc + **materialized view theo tháng** cho sàng lọc nhanh. Giữ nguyên engine `metric-engine/1.0.0` và 8 công thức phiên bản 1.0.0 |
| Q6 | Phân vùng `daily_prices` | Bảng hiện **rỗng**, nên có thể tạo lại dưới dạng phân vùng theo năm (interval partitioning) bằng migration mà không mất dữ liệu. Với khoảng 2.250 dòng, lợi ích hiệu năng nhỏ; giá trị chủ yếu là minh họa kỹ thuật. Xác nhận Oracle Free có hỗ trợ partitioning không trước khi chốt |
| Q7 | Thư viện biểu đồ | Đề xuất **lightweight-charts** (chuyên cho biểu đồ tài chính, nhẹ) hoặc **Recharts**. Chọn bản đã phát hành ít nhất 2 tuần, ghim phiên bản |
| Q8 | Sàng lọc tại ngày nào | Mặc định phiên giao dịch gần nhất có dữ liệu; cho chọn ngày. Điều kiện không có dữ liệu ở ngày đó → Chưa xác định (giữ quy tắc hiện tại) |
| Q9 | ETL giá chạy ở đâu | Repo giờ là dự án độc lập, nên công cụ nhập giá nằm **trong repo** (project Nx `etl`, TypeScript, tài khoản `ERP_ETL`, qua facade), không dùng script Python cục bộ |

## 4. Thay đổi dự kiến

### Database (migration mới, không sửa file cũ)
- `020_market_data.sql`:
  - Bảng số cổ phiếu theo ngày hiệu lực (ví dụ `share_counts`: mã, ngày hiệu lực, số cổ phiếu lưu hành, cổ phiếu quỹ, nguồn, artifact, trạng thái nghiệm thu, ràng buộc không chồng chéo).
  - Tùy Q6: tạo lại `daily_prices` dạng phân vùng.
  - Index theo (`security_id`, `trading_date`).
  - Cập nhật ERD, từ điển dữ liệu và `design/schema_model.json`; số bảng tăng từ 23.
- `021_price_import.sql`: package nhập giá (stage → kiểm định OHLC, trùng, khoảng trống ngày → ghi), mở rộng `pkg_etl_api` với API nhập giá và số cổ phiếu (giới hạn nguồn, mã, khoảng ngày).
- `022_market_views.sql`:
  - `v_price_history` (giá gốc/điều chỉnh).
  - `v_market_metrics_daily` (lợi suất, MA, biến động, cao/thấp 52 tuần; dùng `LAG`, `AVG/STDDEV … OVER`).
  - `v_valuation_daily` (vốn hóa, EPS, P/E, BVPS, P/B theo quy tắc Q3).
  - Materialized view theo tháng.
  - Cấp `READ` cho role APP/ETL trong `010`.
- `023_screening_v2.sql`: mở rộng `pkg_screening` (thêm tham số ngày; mã chỉ số định giá/thị trường trong cùng danh mục, có cờ "loại chỉ số"). **Giữ tương thích** lời gọi cũ `screen(year, conditions)`.
- Audit: thêm các bảng mới vào `ERP_DATA_CHANGE_POL`. Tối ưu: đo trước–sau các truy vấn biểu đồ và sàng lọc trên dữ liệu thật.

### Seed và bộ cài
- `db/seed/prices/…`: giá và số cổ phiếu đã nghiệm thu (văn bản, kèm hash nguồn), nạp qua package nhập giá.
- `db/install.sh` thêm bước nạp giá; `verify.sql` thêm số dòng và vài giá trị định giá chuẩn.

### API (NestJS)
- `GET /api/companies/:symbol/prices?from=&to=&basis=`: chuỗi giá; khoảng thời gian có giới hạn.
- `GET /api/companies/:symbol/market-metrics?date=`: lợi suất, biến động, MA, 52 tuần.
- `GET /api/companies/:symbol/valuation?date=`: vốn hóa, EPS, P/E, P/B, kèm báo cáo năm đã dùng và nhãn "hồi cứu".
- Mở rộng `POST /api/screening` (thêm `date`, chỉ số định giá) và `GET /api/compare` (thêm hàng định giá).
- Kiểu dữ liệu mới trong `libs/contracts`; kiểm thử tích hợp trên cả 2 schema.

### Web (Next.js)
- Tab **Giá**: biểu đồ, chọn khoảng (1T, 3T, 1N, 3N, tất cả), chuyển giá gốc/điều chỉnh, MA, khối lượng; trạng thái rỗng khi thiếu dữ liệu.
- Thẻ **Định giá** ở đầu trang chi tiết; hàng định giá trong trang so sánh.
- Form sàng lọc: thêm chọn ngày, nhóm chỉ số (tài chính / định giá / thị trường).
- Danh sách doanh nghiệp: thêm cột giá đóng cửa gần nhất, thay đổi trong ngày, vốn hóa.

## 5. Các giai đoạn

Mỗi giai đoạn theo quy trình phân tích → kế hoạch → triển khai.

| Giai đoạn | Nội dung | Đầu ra | Hoàn thành khi |
|---|---|---|---|
| **A. Khảo sát nguồn** | Thử lấy giá 3 mã từ 2 nguồn; so khớp; xác định đơn vị và loại giá; tìm nguồn số cổ phiếu; kiểm tra Oracle Free có hỗ trợ partitioning | `docs/17_PHAN_TICH_GIA_VA_DINH_GIA.md` (phân tích, trả lời Q1–Q9) | Người dùng duyệt các quyết định |
| **B. Hợp đồng dữ liệu và thiết kế** | Bổ sung hợp đồng `erp-prices/1.0.0`, công thức định giá phiên bản mới; ERD và từ điển dữ liệu | Cập nhật docs/02, 04, 05; `docs/18_KE_HOACH_TRIEN_KHAI_GIA.md` | Thiết kế được duyệt |
| **C. Thu thập và đối chiếu** | Tải dữ liệu, lưu hash; đối chiếu mẫu (ví dụ 10 phiên mỗi mã với nguồn thứ hai; số cổ phiếu với báo cáo kiểm toán) | Bộ dữ liệu đã nghiệm thu, có biên bản | Sai lệch được giải thích hoặc ghi hiệu chỉnh |
| **D. Database** | Migration 020–023 trên `ERP_IMPORT_TEST` trước rồi `ERP_DESIGN_V1`; kiểm thử nhập (trùng, OHLC sai, rollback, hai session); view; quyền; audit | SQL + kiểm thử | Kiểm thử mới đạt; hồi quy cũ (17 + 38 + 10 ca) vẫn đạt; 72 chỉ số cũ không đổi |
| **E. ETL trong repo** | Project Nx `etl`: đọc file nguồn, kiểm hash, nạp qua facade bằng `ERP_ETL`; seed + bộ cài | `nx run etl:prices`, seed giá | Cài từ đầu vào schema mới tái tạo đúng dữ liệu giá |
| **F. API** | Endpoint mới + mở rộng sàng lọc/so sánh; Swagger | API + kiểm thử tích hợp | Đạt trên cả 2 schema; lời gọi sàng lọc cũ vẫn chạy |
| **G. Giao diện** | Biểu đồ, thẻ định giá, sàng lọc kết hợp, cột giá ở danh sách | 4 màn hình cập nhật | Kiểm thử đơn vị + Playwright đạt; ảnh chụp mới |
| **H. Tối ưu và hoàn thiện** | Đo trước–sau truy vấn biểu đồ và sàng lọc; materialized view; docs kết quả; README | `docs/19_KET_QUA_GIA_VA_DINH_GIA.md` | Toàn bộ kiểm thử đạt; tài liệu cập nhật |
| *(Tùy chọn)* **I. Mở rộng 10 mã** | Thu thập và đối chiếu báo cáo tài chính + giá cho 7 mã mới theo quy trình giai đoạn 1 | Seed mở rộng | Theo tiêu chí nghiệm thu ở docs/03, 07 |

## 6. Rủi ro

| Rủi ro | Ảnh hưởng | Cách xử lý |
|---|---|---|
| Nguồn giá đổi định dạng, chặn truy cập hoặc điều khoản không cho dùng lại | Không có dữ liệu | Lưu file gốc + hash ngay khi tải; có nguồn thứ hai; seed trong repo giữ dữ liệu đã nghiệm thu |
| Giá điều chỉnh khác nhau giữa các nguồn | Lợi suất và biểu đồ lệch | Lưu `price_basis`, ghi nguồn; đối chiếu mẫu; không trộn hai nguồn trong một chuỗi |
| Ngày công bố báo cáo chưa xác minh | P/E, P/B tại một ngày có thể dùng báo cáo chưa công bố vào ngày đó | Quy tắc Q3 có cấu hình, nhãn "hồi cứu" rõ trên giao diện |
| Số cổ phiếu thay đổi giữa năm (phát hành, cổ phiếu thưởng) | Vốn hóa sai trong một số giai đoạn | Bảng số cổ phiếu theo ngày hiệu lực; nếu chỉ có số cuối năm thì ghi rõ là xấp xỉ |
| Oracle Free giới hạn tính năng hoặc dung lượng (giới hạn 12 GB dữ liệu người dùng) | Partitioning hoặc materialized view không dùng được | Kiểm tra ở giai đoạn A; dữ liệu giá 3 mã rất nhỏ so với giới hạn |
| Thay đổi `pkg_screening` làm hỏng sàng lọc cũ | Hồi quy | Giữ chữ ký cũ; kiểm thử cũ phải đạt nguyên vẹn |
| Đĩa máy phát triển gần đầy | Oracle dùng chung có thể bị treo | Dữ liệu tải về đặt trên `/home`; theo dõi `df -h /`; không build Docker trên máy này |

## 7. Ước lượng sơ bộ

| Giai đoạn | Ngày công |
|---|---|
| A–B Khảo sát, phân tích, thiết kế | 2–3 |
| C Thu thập và đối chiếu (3 mã) | 2–3 |
| D–E Database, ETL, seed | 4–6 |
| F–G API, giao diện | 4–6 |
| H Tối ưu, tài liệu | 1–2 |
| *(Tùy chọn)* I Mở rộng 10 mã | 6–10 |

Ước lượng để lập kế hoạch, chưa phải cam kết.

## 8. Câu hỏi mở cho người dùng (hỏi đầu giai đoạn A)

1. Có làm mở rộng 10 mã (P-10) trong giai đoạn này không, hay chỉ làm định giá trên 3 mã trước?
2. Có ràng buộc gì về nguồn dữ liệu không, ví dụ chỉ nguồn miễn phí hoặc chỉ nguồn chính thức của sàn?
3. Giao diện biểu đồ ưu tiên nến (candlestick) hay đường giá đơn giản?
