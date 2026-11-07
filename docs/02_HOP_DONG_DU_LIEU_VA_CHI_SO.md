# Hợp đồng dữ liệu và 8 chỉ số

Contract `erp-financials/1.0.0`; mapping pilot `cafef-panel/1.0.0`; formula `1.0.0`. Ngày 07/11/2026. Bộ 8 công thức được chọn để triển khai; dữ liệu đầu vào vẫn chịu cổng nghiệm thu.

**Cập nhật triển khai cùng ngày:** bộ mẫu v1 giữ nguyên lịch sử; v2 đã có 3 correction VNM và tính được 72 kết quả provisional. Mô hình vật lý/khóa cụ thể ở [ERD](04_THIET_KE_ERD.md), trạng thái ở [memory](../PROJECT_MEMORY.md). Công thức không đổi. Correction trong schema vật lý bất biến; review mới tạo successor, không sửa bản đã khóa.

**Trạng thái hiện hành:** đã đối chiếu đủ 132 giá trị và chốt metadata/hiệu chỉnh theo [biên bản dữ liệu](07_KET_QUA_DOI_CHIEU_VA_CHOT_DU_LIEU.md). Bộ `data/pilot_verified` có 132 fact VERIFIED và 72 metric VALID cho demo hồi cứu local theo policy `pilot-acceptance/1.0.0`. Người dùng đã ủy quyền agent tự review/chốt; không có yêu cầu chờ human sign-off cho pilot. Các mô tả provisional bên trên và ví dụ bên dưới phản ánh lịch sử/bộ chưa nghiệm thu, không thay trạng thái hiện hành. Chỉ 11 chỉ tiêu trong checklist được nghiệm thu; ngày công bố vẫn UNKNOWN.

**Triển khai Oracle đã chạy:** package nhập đã lưu 132 số nguồn/9 correction/12 snapshot; package calculation đã lưu **72 metric result VALID và 171 input lineage**, đúng 8 công thức không đổi. Đối chiếu 72 kết quả và 171 đầu vào khớp chuẩn; [docs/09](09_TINH_VA_LUU_CHI_SO_ORACLE.md) mô tả trạng thái, transaction và khóa. Không còn chỉ là baseline Python hoặc package số học rời.

## 1. Grain, khóa và phiên bản

- Company độc lập với security; pilot nhận diện bằng symbol nhưng CSDL dùng ID doanh nghiệp và ID chứng khoán riêng. Sàn trong snapshot là sàn hiện tại, không phải lịch sử niêm yết.
- Báo cáo: một company + fiscal year + period kind ANNUAL + statement kind BS/IS/CF + scope + source + source artifact/version. Raw source type giữ nguyên `HK`; canonical scope có UNKNOWN/CONSOLIDATED/SEPARATE; không tự coi HK đã xác minh.
- Fact: duy nhất `(report_version_id, item_code)`; fact ID bất biến. Nhiều source/version cùng kỳ được giữ riêng. Nhiều giá trị cho cùng fact trong một version là lỗi, không lấy tùy tiện dòng cuối.
- Report set: tập chọn ba report version cùng kỳ/phạm vi; selection version có hiệu lực nội bộ, không giả là thời điểm công bố lịch sử. Mỗi selection liên kết chính xác các report version.
- Metric: duy nhất `(report_set_selection_id, metric_code, formula_version, calculation_version)`; input bridge liên kết từng fact/correction ID t và t−1. Một kết quả mới không ghi đè mất lịch sử tính cũ.
- Mapping mới hoặc correction mới phải tạo dataset/calculation version mới. Hash tệp chứng minh định danh bytes, không chứng minh số liệu đúng hay thời điểm công bố.

## 2. Trường bắt buộc và biểu diễn

| Trường | Quy tắc |
|---|---|
| company/security identifier, source_symbol | Bắt buộc; mã không dùng làm khóa doanh nghiệp vĩnh viễn |
| fiscal_year, period_kind | Năm số nguyên; pilot 2022–2025, ANNUAL; không trộn quý/lũy kế |
| source_report_type, canonical_scope, scope_status | Giữ mã gốc; scope chưa đối chiếu là UNKNOWN/PENDING |
| fiscal_period_start/end, fiscal_status | DATE hoặc NULL; chưa xác minh không tự dựng ngày từ year |
| publication_at, publication_status | Timestamp kèm nguồn hoặc NULL/UNKNOWN; thiếu không chặn demo hồi cứu, chặn tuyên bố point-in-time |
| collected_at, imported_at | Timestamp UTC riêng biệt; giữ timezone gốc khi cần; không thay publication_at |
| source/provider, artifact_path/url, artifact_sha256 | Bắt buộc với fact có dữ liệu; URL có thể NULL nếu không truy được, không bịa link |
| item_code, raw_code/name, section, raw_locator | Mã nội bộ và selector/mã nguồn; phải dò được đến giá trị gốc |
| value_original, original_unit, multiplier | Decimal hoặc NULL; đơn vị nguồn chưa có bằng chứng giữ UNKNOWN, không tự gán VND |
| currency, value_vnd, unit_status | Chuẩn đích VND; nhân hệ số 1/1000/1000000 chỉ sau xác minh. Pilot tính tỷ số theo giả định cùng scale, có nhãn PROVISIONAL |
| mapping_version, dataset_version, quality_status | Bắt buộc; không dùng quality flag nguồn làm bằng chứng đã kiểm toán nội bộ |

Oracle dự kiến: tiền `NUMBER(28,0)` sau quy đổi sang VND và xác nhận không mất phần lẻ; raw decimal giữ chuỗi gốc, staging có thể dùng `NUMBER(38,6)` cho nguồn có phần lẻ, không âm thầm làm tròn. Nếu nguồn vượt độ chính xác thì từ chối để sửa contract. Tỷ số `NUMBER(28,12)`; tính bằng NUMBER/Decimal, không binary float. Ngày nghiệp vụ DATE; timestamp thu thập/nhập dùng TIMESTAMP WITH TIME ZONE. Chi tiết kích thước/DDL sẽ kiểm chứng khi dựng Oracle.

**Bổ sung khi nhập thật:** `collected_at` được phép NULL khi file kế thừa không có receipt thời gian tải; không lấy mtime/ngày đăng ký thay thế. Package pilot chỉ nhận tiền nguyên VND/hệ số 1 đã nghiệm thu, mapping `pilot-import/1.0.0`; giữ JSON provider ở fact gốc và số issuer khác biệt trong correction, snapshot chọn đúng số đã chốt. [Kết quả và transaction](08_NHAP_DU_LIEU_ORACLE.md).

`NULL` là thiếu/không biết. 0 là số thực nếu có bằng chứng; phần CFO toàn 0 bị gắn lỗi chất lượng, không thay mọi số 0 bằng NULL. Lợi nhuận/CFO có thể âm. Không có CHECK dương áp cho toàn bộ facts.

## 3. Danh mục chỉ tiêu đầu vào

| Mã nội bộ | Ý nghĩa | Nguồn pilot |
|---|---|---|
| revenue | Doanh thu thuần | IS code 10, kiểm tra tên chứa doanh thu thuần |
| gross_profit | Lợi nhuận gộp | IS code 20, kiểm tra tên |
| net_income | LNST toàn doanh nghiệp | IS code 60; không dùng parent_net_income thay thế |
| parent_net_income | LNST cổ đông công ty mẹ | IS code 61, lưu riêng để đối chiếu |
| assets | Tổng tài sản cuối kỳ | BS/TN/270 |
| liabilities | Tổng nợ phải trả, gồm nợ vay và nghĩa vụ khác | BS/NV/300; không gọi là nợ vay |
| equity | Tổng vốn chủ sở hữu cuối kỳ | BS/NV/400; không mặc nhiên là vốn của cổ đông mẹ |
| current_assets | Tài sản ngắn hạn | BS/TN/100 |
| current_liabilities | Nợ ngắn hạn | BS/NV/310 |
| funding_total | Tổng nguồn vốn | BS/NV/440, dùng kiểm tra cân đối |
| cfo | Lưu chuyển tiền thuần từ hoạt động kinh doanh | CF/HDKD, dò đúng tên; không dùng FCF |

Các trường khác trong panel được bảo tồn để truy vết; `interest_expense` hiện thiếu theo mapping đang dùng. Không bổ sung Interest Coverage hoặc đổi mapping này trong snapshot Học sâu chỉ để hoàn thiện MVP.

## 4. Bộ 8 công thức đã chốt

Ký hiệu: R = revenue, GP = gross_profit, NI = net_income toàn doanh nghiệp; A = assets, E = equity tổng cộng, L = liabilities, CA/CL = tài sản/nợ ngắn hạn; CFO = dòng tiền hoạt động. `avg(X) = (X[t−1] + X[t])/2`, chỉ dùng hai năm liên tiếp, cùng company, phạm vi và currency/unit tương thích. Mỗi fact đầu vào được khóa phiên bản. Năm chỉ số của pilot: 2023–2025; năm 2022 là cơ sở, không tự lấy 2021 dù snapshot có lịch sử sâu hơn.

| Mã | Tên | Công thức | Điều kiện mẫu số | Đơn vị hiển thị |
|---|---|---|---|---|
| REVENUE_GROWTH | Tăng trưởng doanh thu | R[t]/R[t−1] − 1 | R[t−1] > 0 | % |
| GROSS_MARGIN | Biên lợi nhuận gộp | GP[t]/R[t] | R[t] > 0 | % |
| NET_MARGIN | Biên lợi nhuận ròng | NI[t]/R[t] | R[t] > 0 | % |
| ROA | Sinh lời trên tổng tài sản bình quân | NI[t]/avg(A) | A[t−1] > 0 và A[t] > 0 | % |
| ROE | Sinh lời trên tổng VCSH bình quân | NI[t]/avg(E) | E[t−1] > 0 và E[t] > 0 | % |
| LIABILITIES_ASSETS | Nợ phải trả / tổng tài sản | L[t]/A[t] | A[t] > 0 | % |
| CURRENT_RATIO | Khả năng thanh toán hiện hành | CA[t]/CL[t] | CL[t] > 0 | lần |
| CFO_AVG_ASSETS | CFO / tổng tài sản bình quân | CFO[t]/avg(A) | A[t−1] > 0 và A[t] > 0 | % |

ROE dùng NI toàn doanh nghiệp và E tổng cộng, gồm lợi ích không kiểm soát nếu có; không diễn giải là ROE riêng cổ đông công ty mẹ. VCSH một đầu kỳ âm hoặc bằng 0 thì ROE không có giá trị hợp lệ, kể cả bình quân dương. CA/CL/L âm là tín hiệu cần review, không tự cho lọt công thức. NI/GP/CFO âm được giữ để tính. Tăng trưởng NI chưa nằm trong bộ 8.

Giá trị lưu là tỷ lệ thuần: 0.15 = 15%; CURRENT_RATIO là số lần. Decimal precision 38, lượng tử hóa **12 chữ số thập phân, ROUND_HALF_UP**, tương ứng ROUND trên số NUMBER theo quy tắc làm tròn đã chọn; cần kiểm chứng khi chạy Oracle. Hiển thị 2 chữ số thập phân cho %/lần, không dùng số đã làm tròn trên UI để sàng lọc. Dung sai baseline–Oracle: trị tuyệt đối ≤ 0.000000000001 trên tỷ lệ thuần.

`CFO_AVG_ASSETS` là định nghĩa riêng của bộ chỉ số Oracle. Feature Học sâu hiện ghi “CFO/tài sản” nhưng chưa khóa mẫu số: chưa được tự đổi thành cùng công thức. Khi tích hợp phải thống nhất rõ hoặc giữ mã/formula version khác nhau.

## 5. Trạng thái chất lượng và phép tính

Fact: MISSING, PROVISIONAL, BLOCKED, VERIFIED; correction pilot có trạng thái APPLIED_PROVISIONAL dựa bằng chứng đã lưu, chưa được tính là đã review đầy đủ kỳ báo cáo. Không gắn VERIFIED tự động chỉ vì có số hoặc nhãn nguồn “Đã kiểm toán”.

Kết quả: CALCULATED_PROVISIONAL, VALID (chỉ sau G2), MISSING_INPUT, INVALID_DENOMINATOR, BLOCKED_INPUT_QUALITY. Thứ tự xử lý: lỗi chất lượng của đầu vào liên quan → thiếu → mẫu số/miền không hợp lệ → tính. Khi cần nhiều lý do lưu danh sách chi tiết; status chính theo thứ tự trên. Giá trị kết quả NULL cho mọi trạng thái không tính được. Kết quả provisional có số để đối chiếu kỹ thuật, không được bộ lọc chính thức xem là VALID.

Chặn theo nhóm phụ thuộc: lỗi cân đối VNM 2025 chặn BS của kỳ này và mọi metric sử dụng BS đó, không tự chặn doanh thu/biên IS. CFO HPG 2024 gốc bị chặn; effective layer chỉ dùng giá trị sửa có correction ID và nguồn gốc. Không lan cờ lỗi CFO sang metric chỉ dùng IS/BS. Mọi input dùng để tính vẫn phải đạt xác nhận phạm vi, niên độ, đơn vị và kỳ đối chiếu để có VALID.

Kiểm tra cân đối: A = L + E và A = funding_total. Sau chuẩn hóa VND, dung sai tối đa một đơn vị làm tròn lớn nhất của các đầu vào đã xác minh (1 VND nếu báo cáo đồng, 1.000/1.000.000 VND nếu làm tròn nghìn/triệu). Unknown unit thì kiểm tra pilot bằng raw exact equality và chỉ kết luận bất nhất nguồn; không diễn giải thành số VND được xác minh. Mức lệch lớn không được giải quyết bằng tăng dung sai.

## 6. Correction và nghiệm thu

Correction phải có ID, symbol/year/field, old/new, issuer document hash, trang, report year và năm số so sánh, lý do, trạng thái review, người/thời điểm review nếu có. HPG 2024 dùng số so sánh trong báo cáo 2025: hợp lệ cho đối chiếu hồi cứu theo giới hạn, không chứng minh số này đã công bố trong 2025 hay tại cutoff dự báo. Raw và panel Học sâu không bị sửa.

Bộ mẫu chỉ ghi APPLIED_PROVISIONAL trong nhánh dữ liệu Oracle. Trong bộ mẫu v1, VNM 2025 chưa có correction có bằng chứng nên các metric BS bị chặn. Bộ mẫu v2 đã đối chiếu PDF kiểm toán VAS và bổ sung 3 correction AUTO_REVIEWED; các metric liên quan tính được provisional, chưa phải VALID. Muốn chuyển VALID phải bổ sung bảng đối chiếu toàn bộ input cần dùng, bằng chứng scope/unit/fiscal, giải quyết discrepancy, review correction. Thiếu publication date vẫn có thể cho phép VALID hồi cứu khi ghi rõ temporal mode RETROSPECTIVE; tuyệt đối không dùng như point-in-time.

## 7. Hợp đồng giá ngày cho giai đoạn sau

Một hàng = security + trading_date + provider + price_basis + source_version. OHLC/close không âm, volume không âm; high ≥ low, high ≥ open/close, low ≤ open/close khi có đủ trường. Ngày nghỉ không tự chèn giá 0. Lưu currency, price_unit/multiplier và adjusted/unadjusted/UNKNOWN; chưa biết basis không dùng để so sánh/định giá. Không có dữ liệu giá trong bộ mẫu v1; chưa chọn nguồn giá hoặc tuyên bố đã nghiệm thu.

## 8. Định hướng quan hệ cho bước DDL

`companies` 1–N `securities`; `data_sources` 1–N `source_artifacts`; `etl_batches` 1–N `staging_facts`/`etl_errors`; `financial_reports` liên kết company, source artifact và version; `financial_items` 1–N `financial_facts`; `report_set_selections` + `report_set_members` chọn đúng BS/IS/CF; `fact_corrections` tham chiếu fact và evidence; `metric_definitions` + `metric_results` + `metric_input_facts` giữ formula và lineage; `business_change_log` giữ lịch sử lựa chọn/chỉnh sửa; `daily_prices` liên kết security/source.

Bảng phiên bản/fact bất biến; trigger lịch sử tập trung vào metadata/lựa chọn có thể cập nhật. Hợp đồng logic này đã được cụ thể hóa bằng ERD/DDL v1.0.0 trong docs/04 và docs/05; đã thử trên Oracle trong ERP_DESIGN_V1. Quy tắc package nhập và nghiệm thu toàn bộ luồng còn phải triển khai.
