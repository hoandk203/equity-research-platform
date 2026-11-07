# Kết quả nhập bộ mẫu vào Oracle

Ngày thực hiện: 07/11/2026. Schema ứng dụng `ERP_DESIGN_V1`, PDB `FREEPDB1`, container có sẵn `oracle-free`. Schema `THACSI` giữ nguyên.

**Cập nhật sau đợt nhập:** đã hoàn tất package tính/lưu 72 chỉ số và 171 liên kết đầu vào. [Kết quả calculation hiện hành](09_TINH_VA_LUU_CHI_SO_ORACLE.md). Các con số “chưa lưu kết quả” trong mô tả nghiệm thu đợt nhập dưới đây là trạng thái tại thời điểm chạy batch nhập, được giữ cùng bằng chứng lịch sử.

## 1. Đã chạy thực tế

Batch `1`, khóa `reviewed-pilot-62675a9f4ce19abdcfdffb27`, trạng thái **COMPLETED**: nhận 132, nhập 132, loại 0, bỏ qua 0. Chạy lại cùng batch giữ nguyên kết quả và số bản ghi.

| Dữ liệu trong schema ứng dụng | Số lượng |
|---|---:|
| Doanh nghiệp và mã niêm yết | 3 và 3 |
| Chỉ tiêu tài chính đầu vào | 11 |
| Báo cáo BS/IS/CF | 36 |
| Số nguồn được bảo tồn trong financial_facts | 132 |
| Hiệu chỉnh đã duyệt trong fact_corrections | 9 |
| Bộ báo cáo FROZEN, VERIFIED | 12 |
| Con trỏ bộ báo cáo hiện hành | 12 |
| Giá trị hiệu lực VERIFIED trong report_set_facts | 132 |
| Tài liệu nguồn: JSON / PDF / checklist CSV | 9 / 6 / 1 |

132 giá trị hiệu lực đọc lại từ Oracle khớp hoàn toàn bộ đã đối chiếu. Package số học lấy đầu vào bằng truy vấn các bảng Oracle và cho **72/72 kết quả khớp**, dung sai tối đa `1e-12`. Đây là kiểm chứng tính toán từ dữ liệu đã lưu; chưa tạo calculation run, metric result hoặc input lineage của kết quả trong database.

Bằng chứng: [validation nhập thật](../evidence/oracle_import/validation.json), [log thực thi](../evidence/oracle_import/execution.log), [132 giá trị đọc từ Oracle](../evidence/oracle_import/selected_facts_from_oracle.csv), [kiểm kê database](../evidence/oracle_import/inventory.json), [31 tình huống kiểm thử](../evidence/oracle_import_tests/validation.json).

## 2. Lưu số nguồn và số được chọn

- `financial_facts` bảo tồn 132 số CafeF: 123 số khớp được ghi VERIFIED, 9 số khác báo cáo doanh nghiệp ghi BLOCKED.
- `fact_corrections` giữ 9 số thay thế APPROVED cùng PDF/hash/trang, reviewer và thời điểm review. Review là tự động/AI theo ủy quyền, phạm vi hồi cứu local; không đổi thành tuyên bố kiểm toán độc lập.
- `report_set_facts` chọn 123 số gốc và 9 correction, đủ 11 chỉ tiêu cho mỗi doanh nghiệp–năm. Cả 132 lựa chọn được ghi VERIFIED.
- 36 report version giữ artifact JSON gốc; metadata hợp nhất/VND/niên độ được xác nhận bởi checklist/PDF. Payload staging giữ cả JSON, PDF và checklist ID/hash, trang số liệu, trang niên độ, cột so sánh/hiện tại và thông tin review. Không tự chọn bản correction mới nhất khi truy vấn.
- 60 fact ngoài danh mục đã nghiệm thu không được nhập trong đợt này. `publication_at` tiếp tục NULL. File snapshot và các bộ mẫu lịch sử giữ nguyên.

Thay đổi so với CSV `financial_facts_ready`: CSV biểu diễn số issuer được chọn trực tiếp; khi lưu vào mô hình Oracle đã có, giữ số provider ở bảng gốc và dùng correction/snapshot để ra cùng số hiệu lực. Hai cách biểu diễn phải cho đúng cùng 132 giá trị, đã đối chiếu bằng truy vấn database.

## 3. Package và transaction

[pkg_financial_import](../sql/005_financial_import.sql) cung cấp:

| Thủ tục | Hành vi |
|---|---|
| register_artifact | Đăng ký source/hash/path và trả ID; transaction riêng; trùng source/hash trả lại ID |
| create_batch | Tạo batch theo khóa duy nhất; transaction riêng; kiểm tra contract/mapping |
| stage_fact | Ghi staging; transaction do bên gọi quản lý; cùng batch/row phải có cùng nội dung |
| seal_batch | Chốt số hàng, khóa việc thêm hàng mới; bên gọi phải COMMIT trước xử lý |
| process_batch | Transaction riêng, kiểm định rồi nhập theo từng doanh nghiệp–năm; tự COMMIT/ROLLBACK |

Tiền được truyền bằng **chuỗi số nguyên VND**, tối đa 28 chữ số, không đi qua float. Package kiểm tra năm pilot, đủ 11 mã duy nhất, đơn vị, scope, niên độ, mẫu số, artifact/hash, correction và hai phương trình cân đối. Lợi nhuận/CFO âm hợp lệ; CFO bằng 0 không bị loại chỉ vì bằng 0.

Nếu một hàng sai, cả 11 hàng của kỳ bị REJECTED và ghi một lỗi kèm staging ID nếu xác định được. Nếu lỗi khi đang tạo report/fact/correction/snapshot/head, rollback toàn bộ nghiệp vụ của kỳ đó về SAVEPOINT; staging và log lỗi được giữ. Kỳ khác hợp lệ có thể nhập thành công và batch kết thúc PARTIAL.

Batch được nhận xử lý bằng khóa hàng NOWAIT. Sau commit, trạng thái IMPORTING là dấu nhận xử lý bền vững; worker khác không tự chạy tiếp trạng thái này. Khóa hàng company tuần tự hóa việc tạo phiên bản giữa các batch. Nếu process bị dừng đột ngột, cần xác nhận worker đã dừng và kiểm tra các kỳ đã commit; dùng batch thử lại với khóa mới, giữ batch cũ để điều tra. Chưa có API tự phục hồi batch bị gián đoạn.

Chống nhập trùng có hai mức: cùng batch/row phải trùng nội dung; batch khác nhưng cùng company/year/scope/dataset phải khớp cả số liệu và provenance trước khi SKIPPED. Muốn thay nguồn, metadata hoặc giá trị phải dùng dataset mới; snapshot cũ bất biến.

Driver Python xác minh SHA-256 của manifest, input/output, JSON, PDF và checklist trước khi gửi. Oracle kiểm tra ID/hash đã đăng ký và quy tắc quan hệ; không đọc PDF để đối chiếu lại số. Package dành cho luồng ETL được tin cậy; chưa cấp quyền cho tài khoản nhập liệu bên ngoài.

Cơ chế transaction tham chiếu tài liệu Oracle: [autonomous transactions](https://docs.oracle.com/en/database/oracle/oracle-database/26/lnpls/autonomous-transactions.html) và [transaction processing and control](https://docs.oracle.com/en/database/oracle/oracle-database/26/lnpls/transaction-processing-and-control.html).

## 4. Kiểm chứng và chạy lại

**31 tình huống Oracle PASS** trên schema riêng `ERP_IMPORT_TEST`: bộ chuẩn 132 số/72 phép tính; cùng batch chạy lại; batch khác bỏ qua snapshot trùng; sửa nội dung dưới cùng khóa; thêm hàng sau seal; sai currency/unit/scope/niên độ/năm/mã; thiếu/trùng chỉ tiêu; hash JSON/PDF/checklist sai; NULL/số lẻ/vượt độ chính xác; mẫu số 0; lệch cân đối; correction chưa duyệt; xung đột provenance; CFO âm và 0; rollback sau khi đã chèn nhiều fact; log còn sau caller rollback; batch PARTIAL; trạng thái gián đoạn; khóa NOWAIT bằng hai session thật.

**13 Python tests PASS**: công thức, kiểm tra độc lập bằng Fraction, coverage/metadata, correction, hash và tái tạo bộ mẫu. 21 smoke checks cấu trúc thuộc đợt kiểm chứng trước, không cộng lại thành kiểm thử mới.

Từ thư mục `CSDL_HocSau`:

```bash
python3 Quan_Tri_CSDL/scripts/check_oracle_import.py
python3 Quan_Tri_CSDL/scripts/import_verified_pilot.py
python3 -m unittest discover -s Quan_Tri_CSDL/tests -v
```

Runner chỉ chấp nhận hai schema thuộc dự án, không drop schema, không đổi container/schema có sẵn khác. Triển khai mới dùng DDL 001, guards 002 rồi package 005. Với schema cũ, migration [004](../sql/004_unknown_collection_time.sql) cho `collected_at` nullable; runner chỉ áp dụng khi cột còn NOT NULL. Không dùng script 001 để dựng đè schema có dữ liệu.

Schema kiểm thử giữ các phiên bản giả lập và lỗi cố ý, không dùng làm nguồn ứng dụng. Log kiểm thử chứa các ORA được kỳ vọng trong các ca từ chối; `failed: 0` trong validation thể hiện các kỳ vọng đều đạt.

## 5. Quyết định đã áp dụng và phần tiếp theo

1. Giữ số provider + correction riêng, chọn số hiệu lực bằng snapshot; không ghi đè số gốc.
2. Đơn vị transaction là một doanh nghiệp–năm; batch có thể PARTIAL, mỗi kỳ nhập đủ ba báo cáo hoặc rollback.
3. Cho phép `source_artifacts.collected_at` NULL khi thiếu bằng chứng tải. FPT 2025 không có receipt, HPG 2025 có metadata tải nhưng không có timestamp; không dùng mtime/ngày đăng ký thay ngày tải. Mô hình vẫn 23 bảng/175 cột/35 FK; DDL, dictionary và ERD đã đồng bộ.
4. Giữ schema chính và schema kiểm thử tách riêng; chưa tạo tài khoản/role vận hành. Không thay THACSI.

Package điều phối calculation run đã hoàn tất ở [docs/09](09_TINH_VA_LUU_CHI_SO_ORACLE.md). Tiếp theo: view đọc, roles ETL/app và kiểm tra quyền thực tế. Audit database, tối ưu, backup/restore, dữ liệu giá, mở rộng 10 mã và API/UI còn triển khai. PowerPoint hiện có là ảnh chụp tiến độ trước đợt nhập này, chưa cập nhật theo kết quả mới.
