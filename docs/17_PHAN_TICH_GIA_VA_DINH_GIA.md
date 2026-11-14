# Phân tích giai đoạn 2: giá ngày và định giá

Phiên bản 1.0 — 08/11/2026. Giai đoạn A của [docs/16](16_KE_HOACH_GIA_VA_DINH_GIA.md). Trạng thái: **đã chốt** (người dùng trả lời 3 câu hỏi mở và giao triển khai toàn bộ kế hoạch; các quyết định còn lại theo đề xuất ở đây).

## 1. Câu trả lời của người dùng (docs/16 mục 8)

| Câu hỏi | Trả lời |
|---|---|
| Mở rộng 10 mã (P-10)? | **Không**, chỉ làm giá và định giá trên FPT, HPG, VNM. |
| Ràng buộc nguồn? | **Nguồn miễn phí, công khai**, đối chiếu chéo. |
| Kiểu biểu đồ? | **Nến**, có nút chuyển sang **đường**; khối lượng và trung bình động bên dưới. |

## 2. Khảo sát nguồn (thử thật ngày 08/11/2026)

| Nguồn | Điểm cuối | Kết quả | Vai trò |
|---|---|---|---|
| VNDirect finfo | `api-finfo.vndirect.com.vn/v4/stock_prices` | Một lần gọi trả đủ 997 phiên 2022–2025/mã. Có **cả giá gốc (open/high/low/close) và giá điều chỉnh (adOpen…adClose)**, khối lượng khớp lệnh `nmVolume`, đơn vị **nghìn đồng** | **Nguồn chính, được nhập** |
| VNDirect finfo | `/v4/ratios?q=itemCode:51004` | **Số cổ phiếu lưu hành theo quý** (ngày báo cáo cuối quý) từ 31/12/2022 | Nguồn số cổ phiếu, được nhập |
| CafeF | `PriceHistory.ashx` | Giá gốc OHLC + giá điều chỉnh (2 chữ số) + khối lượng khớp lệnh. **Mỗi truy vấn tối đa ~1 năm, 30 dòng/trang** → tải theo năm, nhiều trang | Nguồn thứ hai, chỉ đối chiếu |
| SSI iBoard | `statistics/charts/history` | Chỉ giá **điều chỉnh** + khối lượng khớp lệnh; một lần gọi đủ dải | Nguồn thứ ba, phân xử sai lệch |
| VCI (Vietcap) | `OHLCChart/gap` | Giá điều chỉnh (đồng), khối lượng gồm cả thỏa thuận | Không dùng (khối lượng khác định nghĩa) |
| TCBS | `bars-long-term` | Bị Cloudflare chặn | Không dùng |
| CafeF BCTC (đã có trong seed) | `GetReportCDKT` | Có mã 411/411a/411b/415/429 cho 2022–2025 | Giá trị nhà cung cấp cho vốn cổ phần, cổ phiếu quỹ, lợi ích CĐKKS |

Điều khoản: các API là điểm cuối công khai, không yêu cầu khóa; dự án chỉ dùng cho mục đích học thuật, lưu bản gốc kèm SHA-256/URL ở máy (`data/market_raw/`, bị Git bỏ qua). Repo chỉ chứa bộ dữ liệu đã chuẩn hóa và biên bản đối chiếu. Rủi ro nguồn đổi định dạng hoặc chặn được giảm bằng seed trong repo.

## 3. Kết quả đối chiếu thật

Bộ tải ngày 08/11/2026 (run `20261108T024848Z`, 117 tệp, 2,2 MB):

| Kiểm tra | FPT | HPG | VNM |
|---|---|---|---|
| Phiên VNDirect 2022–2025 | 997 | 997 | 997 |
| So khớp với CafeF | 996 | 996 | 995 |
| Phiên thiếu ở CafeF, SSI xác nhận (khối lượng bằng nhau) | 03/02/2025 | 03/02/2025 | 03/02/2025, 14/08/2025 |
| Phiên CafeF ghi thiếu (khối lượng thấp hơn, SSI = VNDirect) → giữ VNDirect | 19–20/01/2022, 06/03/2024 | như FPT | như FPT, + giá mở cửa 05/05 và 08/05/2025 |
| **Lỗi của VNDirect** được sửa theo CafeF + SSI | đóng cửa 18/07/2025: 126,03 → 126,0 (sai bước giá) | — | đóng cửa 13/05/2025: 56,5 → 58,5 (ngoài biên độ ngày); 15/10/2025: 63,65 → 63,6 (sai bước giá) |
| Số cổ phiếu cuối năm = vốn 411a ÷ 10.000 (415 = 0) | 4/4 khớp | 4/4 khớp | 4/4 khớp |

Kết luận:
- **Không nguồn nào sạch tuyệt đối.** VNDirect có 3 trường giá sai trong 2.991 phiên; CafeF có 3 phiên dữ liệu không đầy đủ và 2 phiên bị thiếu. Vì vậy quy tắc nghiệm thu phải phân xử bằng nguồn thứ ba thay vì tin một nguồn.
- **Quy tắc phân xử** (cài trong `apps/etl/src/lib/market.ts`, có kiểm thử): mọi trường giá gốc và khối lượng phải bằng CafeF; nếu khác, quy đổi giá điều chỉnh của SSI về giá gốc bằng hệ số quan sát trên các trường hai nguồn đã khớp cùng phiên; ứng viên nằm trong 0,06% giá trị quy đổi **và đúng bước giá HOSE** thắng. Khối lượng: giá trị bằng SSI thắng. Không phân xử được → dừng dựng dữ liệu.
- Mỗi trường VNDirect bị sửa được ghi thành **hiệu chỉnh có lý do và bằng chứng** (`price_corrections.csv`), nhập vào CSDL như lineage, giống cách 9 hiệu chỉnh BCTC.
- Giá điều chỉnh lệch CafeF > 0,5% chỉ xảy ra đúng ở các phiên CafeF ghi thiếu (đã giải thích); còn lại lệch tối đa do làm tròn.

### Lợi ích cổ đông không kiểm soát và vốn cổ phần (đối chiếu PDF)

36 giá trị (3 chỉ tiêu × 12 năm-công ty) đọc từ bảng cân đối hợp nhất đã kiểm toán (lớp chữ PDF với FPT/HPG 2023, ảnh trang với bản scan VNM và HPG 2025): 35 khớp CafeF, **1 hiệu chỉnh**: VNM 2025 mã 429, CafeF ghi 0, PDF trang 9 ghi 3.797.632.379.221 đồng (cùng nguyên nhân với hiệu chỉnh vốn chủ VNM 2025 đã có: CafeF lấy vốn chủ thuộc công ty mẹ làm tổng). VNM 2022 CafeF để 411a = 0 nhưng 411 = 20.899.554.450.000 và 411b = 0 → quy tắc ánh xạ lấy 411, không cần hiệu chỉnh. Biên bản: `apps/etl/review/capital_review.json`.

## 4. Kiểm tra Oracle

`v$option`: **Partitioning = TRUE**, Materialized view rewrite = TRUE. Owner hiện chỉ có CREATE TABLE/VIEW/PROCEDURE/TRIGGER → migration cấp thêm **CREATE MATERIALIZED VIEW**. `daily_prices` trên cả 5 schema dự án đều **0 dòng**. Đĩa `/` còn ~2,1 GB; dữ liệu giá ~6.000 dòng, không đáng kể.

## 5. Trả lời Q1–Q9

| # | Quyết định |
|---|---|
| Q1 | Lưu **cả hai**: mỗi phiên hai dòng `daily_prices` (`UNADJUSTED`, `ADJUSTED`), giữ đơn vị nguồn (nghìn đồng, `price_multiplier = 1000`). Biểu đồ, lợi suất, MA, biến động dùng giá điều chỉnh; vốn hóa và P/E, P/B dùng giá gốc × số cổ phiếu tại ngày đó. Giá điều chỉnh là ảnh chụp tại ngày tải; tải lại sau sự kiện doanh nghiệp tạo đợt nhập mới. |
| Q2 | Bảng `share_counts` theo **ngày hiệu lực** (ngày cuối quý của VNDirect), mỗi dòng gắn artifact và đợt nhập. Số cuối năm được CSDL **tự đối chiếu** với vốn 411a ÷ 10.000 khi cổ phiếu quỹ bằng 0 (cả 12 khớp). Số giữa hai mốc là xấp xỉ (phát hành giữa quý chưa phản ánh đến cuối quý) — ghi rõ trên giao diện. |
| Q3 | Bảng `valuation_policies`, chính sách đang dùng `RETRO-APR01`: giá ngày D dùng BCTC năm N với N = năm gần nhất mà D ≥ 01/04/(N+1). Ví dụ 15/03/2024 dùng năm 2022, 15/04/2024 dùng năm 2023. Giao diện gắn nhãn "hồi cứu, ngày công bố chưa xác minh". |
| Q4 | **P/E = vốn hóa ÷ lợi nhuận sau thuế thuộc cổ đông công ty mẹ năm N**; EPS = LNST công ty mẹ ÷ số cổ phiếu tại D (hiển thị theo số cổ phiếu hiện hành để P/E = giá ÷ EPS nhất quán). **P/B = vốn hóa ÷ (vốn chủ sở hữu − lợi ích CĐKKS)**; BVPS tương tự. LNST mẹ ≤ 0 → P/E "không có ý nghĩa"; vốn chủ mẹ ≤ 0 → P/B tương tự. |
| Q5 | Không đưa vào `metric_results`; engine `metric-engine/1.0.0` và 8 công thức giữ nguyên. Chỉ số thị trường (lợi suất, MA, biến động, 52 tuần) lưu trong **materialized view** làm mới sau mỗi đợt nhập giá; định giá là **view tính khi đọc** (vì phụ thuộc BCTC hiện hành, có thể đổi độc lập với giá). Thêm MV theo tháng cho biểu đồ dải dài. |
| Q6 | Tạo lại `daily_prices` (đang rỗng) **phân vùng theo năm** (interval partitioning), unique index LOCAL. Lợi ích hiệu năng nhỏ ở 6.000 dòng; giá trị là minh họa partition pruning, đo ở giai đoạn H. |
| Q7 | **lightweight-charts** (thư viện biểu đồ tài chính, nến + đường + histogram khối lượng), ghim phiên bản đã phát hành ≥ 2 tuần. |
| Q8 | Sàng lọc theo ngày: mặc định phiên gần nhất có dữ liệu; mỗi mã dùng phiên gần nhất ≤ ngày chọn. Chỉ số tài chính trong cùng điều kiện lấy theo năm BCTC của chính sách Q3 tại ngày đó. Không có dữ liệu → Chưa xác định. Lời gọi cũ `screen(year, conditions)` giữ nguyên. |
| Q9 | Project Nx **`etl`** trong repo, TypeScript chạy trực tiếp bằng Node 24: `fetch` (tải gốc + hash), `build` (chuẩn hóa + phân xử + biên bản), `load` (nạp bằng tài khoản ETL qua facade), `export-seed` (sinh seed SQL cho bộ cài). |

### Quyết định bổ sung phát sinh khi phân tích

- **Năm 2022 là năm làm nóng** cho cửa sổ 252 phiên (giống năm 2022 là năm cơ sở của BCTC): lợi suất 1 năm, MA200, biến động và cao/thấp 52 tuần có giá trị từ khoảng tháng 01/2023. Định giá có giá trị từ 01/04/2023 (cần BCTC 2022 và số cổ phiếu từ 31/12/2022).
- **Không nhét chỉ tiêu mới vào luồng BCTC 11 chỉ tiêu.** Luồng đó khóa đúng 11 chỉ tiêu mỗi snapshot; thêm chỉ tiêu sẽ tạo snapshot mới, dời head, buộc tính lại và đổi 72 chỉ số đã nghiệm thu. Thay vào đó, bảng `capital_facts` (vốn cổ phần, cổ phiếu quỹ, lợi ích CĐKKS) có cùng nguyên tắc: giá trị nhà cung cấp + giá trị phát hành + PDF/trang + hiệu chỉnh có lý do, bất biến.
- **Hợp đồng mới `erp-market/1.0.0`** với 3 mapping: `capital-review/1.0.0`, `vndirect-shares/1.0.0`, `vndirect-prices/1.0.0`. Thứ tự nhập bắt buộc: vốn → số cổ phiếu (CSDL kiểm số cuối năm với vốn) → giá.
- Đợt nhập giá/số cổ phiếu có **con trỏ hiện hành** `market_heads` (cùng mẫu `report_heads`): tải lại tạo phiên bản mới, không ghi đè.

## 6. Rủi ro còn lại

| Rủi ro | Xử lý |
|---|---|
| Giá điều chỉnh của VNDirect đổi sau mỗi sự kiện doanh nghiệp | Đợt nhập mới + head mới; giá gốc không đổi nên vốn hóa ổn định |
| Số cổ phiếu theo quý trễ so với ngày phát hành thực | Nhãn "xấp xỉ theo số cuối quý"; không ảnh hưởng số cuối năm (đã đối chiếu) |
| 2 phiên VNDirect sai dù đã phân xử ổn định nhờ SSI; nếu SSI cũng thiếu thì dừng | Bộ dựng không cho qua bất kỳ khác biệt nào chưa phân xử |
| Ngày công bố BCTC chưa xác minh | Chính sách cấu hình được + nhãn hồi cứu |
