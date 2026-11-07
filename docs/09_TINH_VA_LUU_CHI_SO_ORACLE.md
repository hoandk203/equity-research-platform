# Tính và lưu chỉ số trên Oracle

Thực hiện ngày 07/11/2026, schema `ERP_DESIGN_V1`, PDB `FREEPDB1`. Đã chạy package nghiệp vụ, lưu kết quả và liên kết đầu vào; THACSI giữ nguyên.

## 1. Kết quả đã lưu

| Thành phần | Kết quả |
|---|---:|
| Công thức có phiên bản trong metric_definitions | 8 |
| Phụ thuộc chỉ tiêu/năm trong metric_dependencies | 19 |
| Calculation run COMPLETED | 9 |
| Chỉ số đã lưu trong metric_results | 72 |
| Kết quả VALID | 72 |
| Liên kết trong metric_input_facts | 171 |
| Kết quả khớp bộ chuẩn | 72/72 |
| Đầu vào khớp bộ chuẩn | 171/171 |
| Liên kết đầu vào dùng correction | 7 |

Chín run **41–49** tương ứng FPT, HPG, VNM × năm 2023–2025; dùng snapshot năm 2022 làm cơ sở. Mỗi run có 8 kết quả và 19 đầu vào. Chạy lại cùng khóa trả đúng run cũ, không thêm kết quả hoặc liên kết.

**VALID** giữ đúng phạm vi nghiệm thu hồi cứu local đã chốt. Ngày công bố vẫn UNKNOWN, không có chứng nhận dữ liệu point-in-time hay kiểm toán độc lập.

Bằng chứng: [validation](../evidence/oracle_calculation/validation.json), [72 kết quả đọc từ Oracle](../evidence/oracle_calculation/metric_results_from_oracle.csv), [171 liên kết đầu vào](../evidence/oracle_calculation/metric_input_lineage_from_oracle.csv), [log thực thi](../evidence/oracle_calculation/execution.log), [kiểm kê schema](../evidence/oracle_calculation/inventory.json), [39 ca kiểm thử](../evidence/oracle_calculation_tests/validation.json).

## 2. Package nghiệp vụ

[pkg_metric_calculation](../sql/006_metric_calculation.sql) có ba API:

| API | Hành vi |
|---|---|
| install_catalog | Tạo/kiểm tra đúng 8 công thức và 19 vị trí đầu vào; caller COMMIT. Không thay công thức hoặc dependency cũ |
| calculate_snapshot | Nhận khóa run, snapshot năm t và snapshot t−1 cụ thể, trả run_id; tự quản lý transaction |
| calculate_current | Khóa company và hai head, chọn snapshot hiện hành t/t−1 rồi tính; tự quản lý transaction |

Engine `metric-engine/1.0.0`, formula `1.0.0`; tám công thức và cách làm tròn không đổi. Package kiểm tra định nghĩa, vị trí chỉ tiêu và year_offset trước khi chạy; metadata công thức không phải SQL động. Catalog bị khóa trong transaction tính để tránh thay đổi dependency đồng thời.

Driver [calculate_verified_pilot.py](../scripts/calculate_verified_pilot.py) tính trên 12 snapshot đã nghiệm thu, truyền khóa `pilot-metrics-1:<current_set_id>:<previous_set_id>`. Không lấy số từ CSV để nạp làm đầu vào phép tính. CSV chỉ dùng đối chiếu **sau khi** kết quả và lineage đã được Oracle lưu.

## 3. Lựa chọn và liên kết đầu vào

Mỗi input là `selection_fact_id` của đúng snapshot đã khóa. Theo quan hệ, có thể truy ngược: result → input position → selected fact → fact nguồn → report/JSON; nếu chọn correction thì truy tiếp correction → PDF/hash/trang/reviewer. Không dùng correction có ID lớn nhất hoặc head mới ở lần đọc sau để đổi đầu vào của kết quả đã hoàn tất.

Vị trí là **0, 1, 2**. Công thức hai đầu vào dùng vị trí 0–1; ROA/ROE/CFO_AVG_ASSETS dùng 0–2, lần lượt là tử số năm t, mẫu số năm t−1 và mẫu số năm t. Vì vậy 5 × 2 + 3 × 3 = 19 liên kết/run; 9 × 19 = **171**.

Trong 171 liên kết có **7 lần dùng 4 correction**: assets HPG 2022 dùng hai lần; CFO HPG 2024 dùng một lần; assets VNM 2025 dùng ba lần; equity VNM 2025 dùng một lần. Năm correction còn lại vẫn tồn tại trong 132 số đã chốt nhưng không tham gia 8 công thức của các năm 2023–2025. `funding_total` và `parent_net_income` được giữ để đối chiếu; không tự đưa chúng vào công thức.

Nếu đã chọn correction mà giá trị VND của correction là NULL, package giữ NULL; không dùng COALESCE để âm thầm lấy lại số nguồn bị thay thế.

## 4. Trạng thái và phạm vi tác động

- **BLOCKED_INPUT_QUALITY:** input BLOCKED, correction REJECTED, lỗi chất lượng OPEN mức HIGH/CRITICAL ảnh hưởng đúng report/fact, số âm bất hợp lệ ở tài sản ngắn hạn/nợ phải trả, hoặc metadata đơn vị/niên độ không tương thích. Giá trị kết quả NULL.
- **MISSING_INPUT:** thiếu snapshot t−1, thiếu selected fact hoặc giá trị NULL. Chỉ gắn các liên kết đầu vào thực sự tồn tại; không tạo fact giả cho phần thiếu. Giá trị kết quả NULL.
- **INVALID_DENOMINATOR:** mẫu số không dương, gồm cả từng đầu kỳ của ROA/ROE/CFO_AVG_ASSETS. Không dùng bình quân dương để che VCSH đầu kỳ âm. Giá trị kết quả NULL.
- **CALCULATED_PROVISIONAL:** tính được nhưng snapshot/input/metadata cần dùng chưa đủ VERIFIED; có số để kiểm tra, không tự thành VALID.
- **VALID:** tính được, các snapshot phụ thuộc được nghiệm thu và từng input/metadata/correction đạt yêu cầu. Lưu ratio thuần NUMBER(28,12), ROUND_HALF_UP 12 chữ số thập phân.

Thứ tự ưu tiên là **blocked → missing → invalid denominator → calculated**. CFO/lợi nhuận âm được tính bình thường; CFO bằng 0 là số 0, không phải thiếu.

Không có năm trước: REVENUE_GROWTH, ROA, ROE, CFO_AVG_ASSETS là MISSING_INPUT; bốn chỉ số chỉ dùng năm hiện tại vẫn có thể VALID. Snapshot năm trước PENDING chỉ ngăn VALID ở các công thức thực sự phụ thuộc năm trước. Một fact CFO bị BLOCKED không làm bảy công thức khác bị BLOCKED; nếu cả snapshot hiện tại còn PENDING thì các kết quả tính được còn lại vẫn provisional.

Engine đợt này dùng dữ liệu đã chuẩn hóa và kiểm định **VND/hệ số 1, niên độ 01/01–31/12**. Chưa triển khai quy đổi ngoại tệ hoặc tự xử lý nguồn nghìn/triệu tại lúc tính. UNKNOWN currency không được đưa vào phép chia như đã chuẩn hóa.

## 5. Transaction, khóa và bất biến

Một run là một đơn vị transaction độc lập. Sau khi tạo run/RUNNING, package đặt SAVEPOINT cho toàn bộ metric result và input bridge. Nếu có lỗi thực thi giữa chừng, rollback mọi kết quả/liên kết của run, giữ run **FAILED** cùng lỗi trong `business_change_log`, rồi commit thông tin lỗi; caller rollback không xóa bằng chứng này. Sai tham số/snapshot/catalog trước khi tạo run được từ chối trực tiếp.

Run FAILED không được ghi đè bằng chạy lại cùng khóa; sửa nguyên nhân và dùng khóa mới. Run COMPLETED được trả lại nếu khóa, snapshots và engine trùng nhau. Cùng khóa nhưng head đã thay đổi bị từ chối; kết quả cũ giữ nguyên snapshot gốc.

Khóa company NOWAIT phối hợp với luồng import; API current khóa thêm các head. Guard của metric result/input khóa parent run trước khi kiểm tra trạng thái, để writer phải chờ một phiên đang finalize rồi đọc lại trạng thái cuối. Đã tái hiện bằng hai session: finalize giữ khóa, writer chờ, sau commit writer nhận lỗi thay vì sửa được kết quả.

[Migration guards 007](../sql/007_metric_guard_hardening.sql) thay ba trigger hiện có, không thêm bảng/cột/trigger: chống đổi run_key, chống xóa run kết thúc, khóa parent khi sửa result/input và yêu cầu đủ 8 công thức khi finalize engine này. `sql/002_integrity_guards.sql` chứa cùng định nghĩa cho schema dựng mới. Toàn mô hình vẫn **23 bảng/175 cột/35 FK/14 trigger**, nay có **3 package**, không lỗi biên dịch.

Nếu kết nối/database dừng trước commit, transaction Oracle sẽ rollback run đang tính; nếu dừng sau commit nhưng client chưa nhận phản hồi, chạy lại cùng khóa lấy run đã hoàn tất. Không có lịch tính tự động hoặc worker nền trong đợt này.

## 6. Kiểm thử và tái chạy

**39 ca integration PASS** trên `ERP_IMPORT_TEST`: bộ chuẩn 72 số/171 input; replay/xung đột khóa; sai company/scope/năm; thiếu năm trước; snapshot pending; VCSH đầu kỳ 0/âm; nợ ngắn hạn 0; CFO âm/0; làm tròn dương/âm; fact blocked/missing/NULL; ưu tiên trạng thái; currency unknown; issue OPEN; rollback giữa run và lưu FAILED/log; retry khóa mới; bất biến result/input/run/formula/dependency; catalog chạy lại; finalize thiếu công thức; current-head và đổi head; hai-session writer/finalize và head NOWAIT.

**21 smoke checks cấu trúc PASS lại** sau nâng guards, fixture rollback sạch; formula version giả lập trong smoke được tách khỏi danh mục thật để chạy được khi catalog đã có dữ liệu. **13 Python tests PASS** về công thức, Fraction, metadata, hash và tái lập bộ mẫu. 31 ca import đã đạt ở đợt trước, không cộng thành ca calculation mới.

Từ thư mục `CSDL_HocSau`:

```bash
python3 Quan_Tri_CSDL/scripts/check_oracle_calculation.py
python3 Quan_Tri_CSDL/scripts/calculate_verified_pilot.py
python3 -m unittest discover -s Quan_Tri_CSDL/tests -v
```

Yêu cầu: bộ pilot đã nhập và container `oracle-free` đang chạy. Không dựng đè schema, không drop, không sửa snapshot nguồn hoặc các bộ mẫu lịch sử. Fixture calculation chỉ nằm trong schema test; các head thay để thử nghiệm được khôi phục sau test. Bằng chứng nhập ở `evidence/oracle_import/` giữ nguyên trạng thái tại đợt nhập; bằng chứng calculation mới ở thư mục riêng.

## 7. Quyết định và phần tiếp theo

1. Tính theo snapshot bất biến, lineage là liên kết quan hệ, không lưu lại chuỗi số làm đầu vào thay cho fact/correction.
2. Hoàn tất đúng 8 kết quả/run, kể cả kết quả có trạng thái thiếu/bị chặn. COMPLETED thể hiện xử lý đủ bộ chỉ số, không đồng nghĩa mọi chỉ số VALID.
3. Commit theo run; lỗi runtime giữ FAILED/log, không để lại một phần kết quả dùng được.
4. VALID dựa trên nghiệm thu đúng các dependency, giữ phạm vi hồi cứu local; không nâng trạng thái chỉ vì phép chia thành công.

Tiếp theo: view đọc kết quả/lineage, vai trò ETL/app và kiểm tra quyền bằng tài khoản thực tế. Chưa có phân quyền vận hành, API/UI, giá ngày, audit database, tối ưu hoặc phục hồi backup thực nghiệm. PowerPoint hiện có chưa cập nhật hai đợt nhập/tính mới.
