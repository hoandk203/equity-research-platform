# Phân tích ứng dụng web

Phiên bản 1.1 — 08/11/2026. Trạng thái: **đã duyệt** (người dùng trả lời Q1, Q2, Q4 cùng ngày; xem mục 9).

Quy trình thống nhất với người dùng:
1. **Phân tích** (tài liệu này): cần gì, vì sao, dữ liệu có gì, giới hạn ở đâu.
2. **Kế hoạch** ([docs/14](14_KE_HOACH_UNG_DUNG.md), viết sau khi tài liệu này được duyệt): kiến trúc chi tiết, API, cấu trúc thư mục, các bước triển khai, cách kiểm thử.
3. **Triển khai** theo từng bước của kế hoạch, mỗi bước có kiểm thử và cập nhật tài liệu.

Công nghệ đã chốt: **NestJS** (backend) + **Next.js** (frontend), như đặc tả ([docs/01](01_DAC_TA_MVP_ORACLE.md) mục 7). Không có hạn nộp gấp; ưu tiên chia nhỏ và tài liệu rõ ràng.

## 1. Mục đích

Ứng dụng là phần "ứng dụng chạy local để demo" của sản phẩm môn CSDL. Nhiệm vụ của nó là **làm cho những gì CSDL đã làm trở nên nhìn thấy được**: dữ liệu có nguồn, chỉ số giải thích được, sàng lọc đúng quy tắc, quá trình nhập theo dõi được. Ứng dụng không thêm nghiệp vụ mới; mọi quy tắc nằm trong Oracle.

Từ đó suy ra ba nguyên tắc:
- **Chỉ đọc.** Ứng dụng không ghi gì vào database. Việc nhập dữ liệu vẫn chạy bằng script Python với tài khoản ETL.
- **Không tính lại.** Ứng dụng không tự tính chỉ số hay tự quyết PASS/FAIL. Nó hiển thị kết quả Oracle trả về.
- **Không che giấu giới hạn.** Thiếu dữ liệu, chưa xác minh, chưa có giá đều phải hiện rõ, không được hiển thị thành 0 hay ẩn đi.

## 2. Người dùng và bối cảnh

| Người dùng | Bối cảnh | Cần gì |
|---|---|---|
| Người xem local (sinh viên, giảng viên khi demo) | Mở trình duyệt trên máy chạy Oracle | Tìm doanh nghiệp, xem báo cáo, hiểu một chỉ số đến từ đâu, lọc và so sánh |
| Người vận hành ETL | Chạy script Python, sau đó mở ứng dụng | Biết đợt nhập vừa chạy kết thúc thế nào, có lỗi gì |
| Người chấm/đọc báo cáo | Xem ảnh chụp màn hình trong tiểu luận | Mỗi màn hình chứng minh được một tính năng CSDL |

Không có đăng nhập ứng dụng (đặc tả mục 2). Bảo mật dựa trên phân quyền database: ứng dụng chỉ dùng tài khoản `ERP_APP`.

## 3. Phạm vi

### Trong phạm vi

| Màn hình | Yêu cầu | Ghi chú |
|---|---|---|
| S1 Danh sách doanh nghiệp | FR-01 | |
| S2 Chi tiết doanh nghiệp | FR-02, FR-03, FR-09 (chỉ thông báo "chưa có"), FR-08 (xem hiệu chỉnh) | Gồm báo cáo, chỉ số, truy vết chỉ số, giá |
| S3 Sàng lọc | FR-04 | |
| S4 So sánh | FR-05 | |
| S5 Đợt nhập | FR-06 | |

### Ngoài phạm vi

| Nội dung | Lý do |
|---|---|
| Đăng nhập, phân quyền người dùng ứng dụng | Đặc tả không yêu cầu |
| Nhập dữ liệu, sửa số, duyệt hiệu chỉnh trên web (thao tác ghi của FR-07/FR-08) | Ứng dụng chỉ đọc; ETL chạy bằng script với tài khoản riêng |
| Giá cổ phiếu thật, biểu đồ giá | Chưa có dữ liệu (quyết định phạm vi ADR-29) |
| Chế độ "preview" cho số PROVISIONAL | Không có dữ liệu PROVISIONAL; quy tắc FR-04 chỉ cho VALID vào tập PASS |
| Lưu/chia sẻ bộ lọc, xuất file, dự báo, danh mục | Đặc tả mục 1 loại trừ |
| Mở rộng 10 mã | Phạm vi đã chốt 3 mã |
| Triển khai lên internet | Chỉ chạy local |

## 4. Phân tích từng màn hình

Nguồn dữ liệu và cột tham chiếu [docs/12](12_HOP_DONG_DU_LIEU_CHO_UNG_DUNG.md).

### S1 — Danh sách doanh nghiệp (FR-01)

- **Người dùng muốn:** tìm nhanh một doanh nghiệp theo mã hoặc tên, rồi mở chi tiết.
- **Dữ liệu:** `v_company_directory` (mã, tên, sàn). Có thể kèm năm báo cáo mới nhất từ `v_current_report_sets`.
- **Quy tắc:** tìm không phân biệt hoa/thường, theo mã hoặc một phần tên. Tên tiếng Việt có dấu ("Hòa Phát"): cần quyết định có tìm được khi gõ không dấu ("hoa phat") hay không. Mục 9 ghi lại điểm này.
- **Trạng thái biên:** không có kết quả → thông báo rõ "Không tìm thấy doanh nghiệp phù hợp", không để trang trống.
- **Nghiệm thu:** tìm "fpt", "FPT", "Sữa" đều ra đúng; tìm "XYZ" ra trạng thái rỗng; bấm một dòng mở S2 đúng mã.

### S2 — Chi tiết doanh nghiệp (FR-02, FR-03, FR-08, FR-09)

Màn hình quan trọng nhất cho môn CSDL vì thể hiện phiên bản, nguồn và truy vết. Chia bốn phần, dùng chung bộ chọn năm.

**S2a — Báo cáo tài chính**
- **Dữ liệu:** `v_report_lines` (11 dòng/năm: 6 BS, 4 IS, 1 CF) và `v_current_report_sets` (phiên bản, trạng thái nghiệm thu, ngày công bố).
- **Hiển thị:** tên dòng tiếng Việt theo nguồn, giá trị hiệu lực; nếu đã hiệu chỉnh thì có nhãn và xem được số gốc, lý do, trang PDF, link PDF. Có thông tin đơn vị, phạm vi hợp nhất, niên độ, phiên bản dữ liệu, mã báo cáo nguồn.
- **Trạng thái biên:** `line_status = MISSING` → hiện "Thiếu dữ liệu", không hiện 0. `open_issue_count > 0` → cảnh báo. `publication_status = UNKNOWN` → ghi chú "ngày công bố chưa xác minh, dữ liệu dùng cho phân tích hồi cứu".
- **Năm:** 2022–2025 (có báo cáo 2022 dù không có chỉ số).

**S2b — Chỉ số**
- **Dữ liệu:** `v_current_metrics` (8 chỉ số/năm 2023–2025), tên tiếng Việt lấy từ `metric_name`.
- **Hiển thị:** `display_value` + đơn vị (% hoặc lần); trạng thái; lý do nếu không VALID.
- **Trạng thái biên:** năm 2022 → "Chưa có chỉ số cho năm cơ sở 2022". Chỉ số không VALID → giá trị "—" kèm trạng thái, không hiện 0.

**S2c — Truy vết một chỉ số (FR-03)**
- **Người dùng muốn:** biết ROE 2025 của VNM tính từ những số nào, số nào đã hiệu chỉnh, lấy ở trang nào của báo cáo kiểm toán.
- **Dữ liệu:** `v_metric_lineage` lọc **theo `result_id`** (lọc theo mã/năm chậm hơn khoảng 160 lần, docs/11).
- **Hiển thị:** công thức (`formula_text`), mỗi đầu vào gồm vị trí, năm (t hoặc t−1), chỉ tiêu, giá trị hiệu lực, số gốc nếu khác, mã hiệu chỉnh, hash và trang PDF.
- **Nghiệm thu:** ROE VNM 2025 có 3 đầu vào; đầu vào vốn chủ sở hữu 2025 hiện là số đã hiệu chỉnh, có trang PDF.

**S2d — Giá ngày (FR-09)**
- Bảng giá trống → hiện thông báo "Chưa có dữ liệu giá đã nghiệm thu". Không vẽ biểu đồ giả, không dùng dữ liệu mẫu.
- Hiện chưa có view giá cho APP. Vì chỉ hiển thị thông báo, ứng dụng chưa cần truy vấn giá; khi có dữ liệu sẽ bổ sung view riêng.

### S3 — Sàng lọc (FR-04)

- **Người dùng muốn:** tìm doanh nghiệp thỏa nhiều điều kiện cùng lúc trong một năm.
- **Dữ liệu:** `pkg_screening.screen(năm, điều_kiện_JSON)`.
- **Nhập liệu:** chọn năm (2023/2024/2025), 1–10 điều kiện, mỗi điều kiện gồm chỉ số, toán tử (≥, >, ≤, <, =) và ngưỡng. Người dùng nhập ngưỡng theo đơn vị hiển thị (10 cho 10%); ứng dụng đổi sang tỷ lệ thuần (0.10) trước khi gửi.
- **Kết quả:** chia nhóm PASS / UNKNOWN / FAIL; mỗi doanh nghiệp xem được từng điều kiện đạt hay không và giá trị thực tế.
- **Trạng thái biên:** lỗi đầu vào (ORA-20401…20405) → thông báo dễ hiểu ngay tại form. Không doanh nghiệp nào PASS → vẫn hiển thị nhóm UNKNOWN/FAIL kèm lý do.
- **Nghiệm thu:** năm 2024, biên lãi ròng ≥ 10% và hệ số thanh toán ≥ 1 → FPT, VNM PASS; HPG FAIL (8,66%).

### S4 — So sánh (FR-05)

- **Người dùng muốn:** đặt 2–3 doanh nghiệp cạnh nhau, cùng một năm.
- **Dữ liệu:** `v_current_metrics` lọc theo các mã và một năm.
- **Quy tắc:** cùng năm, cùng phiên bản công thức cho tất cả; **không** tự lùi một mã sang năm khác khi thiếu. Thiếu hoặc không VALID → "UNKNOWN".
- **Nghiệm thu:** chọn ít hơn 2 hoặc nhiều hơn 3 mã bị chặn ngay ở giao diện; bảng 8 chỉ số × 2–3 mã; năm 2022 → toàn bộ UNKNOWN kèm lý do.

### S5 — Đợt nhập (FR-06)

- **Người dùng muốn:** biết mỗi lần nhập nhận bao nhiêu dòng, nhập được bao nhiêu, bỏ qua do trùng bao nhiêu, lỗi gì.
- **Dữ liệu:** `v_import_batches`, `v_import_errors`.
- **Hiển thị:** danh sách batch mới nhất trước; mỗi batch gồm trạng thái và bốn bộ đếm; xem lỗi gồm mã lỗi, dòng, mã chứng khoán/năm/chỉ tiêu, nguyên nhân.
- **Trạng thái biên:** batch không có lỗi → "Không có lỗi".

## 5. Quy tắc hiển thị chung

| Chủ đề | Quy tắc |
|---|---|
| Ngôn ngữ | Toàn bộ giao diện tiếng Việt; giữ mã kỹ thuật (ROE, VND) khi cần |
| Số tiền | Số gốc là VND nguyên, khoảng 10¹³. Hiển thị theo **tỷ đồng**, 2 chữ số thập phân, dấu phẩy thập phân kiểu Việt Nam; xem được số VND đầy đủ khi cần. Ghi rõ đơn vị ở tiêu đề bảng |
| Tỷ lệ | Dùng `display_value` do Oracle trả (đã nhân 100 nếu là %); không tự làm tròn lại |
| Giá trị không có | Luôn hiện "—" kèm lý do/trạng thái. **Không bao giờ hiện 0 thay cho NULL** |
| Trạng thái | Dùng một bộ nhãn tiếng Việt thống nhất cho mọi màn hình (mục 7) |
| Nguồn | Mọi số liệu báo cáo cho biết nguồn (CafeF), và nếu đã hiệu chỉnh thì kèm PDF kiểm toán và trang |
| Giới hạn chung | Có dòng ghi chú cố định: "Phân tích hồi cứu; ngày công bố báo cáo chưa xác minh; chưa có dữ liệu giá" |

## 6. Yêu cầu phi chức năng cho ứng dụng

| ID | Yêu cầu | Cách kiểm chứng dự kiến |
|---|---|---|
| A-NFR-01 Quyền tối thiểu | Backend chỉ kết nối bằng `ERP_APP`; không bao giờ dùng SYS, chủ schema hay `ERP_ETL` | Cấu hình chỉ có một tài khoản; audit trail chỉ thấy `ERP_APP` |
| A-NFR-02 Bí mật | Mật khẩu đọc từ biến môi trường; không nằm trong mã nguồn, log hay phản hồi API; có `.env.example` không chứa mật khẩu | Quét mã nguồn và log |
| A-NFR-03 Chống SQL injection | Mọi tham số qua bind variable; câu SQL cố định trong mã; không ghép chuỗi từ đầu vào | Review mã + kiểm thử đầu vào độc hại |
| A-NFR-04 Kiểm tra đầu vào | Backend kiểm tra kiểu và phạm vi (mã, năm, danh sách mã) trước khi gọi Oracle; Oracle vẫn kiểm tra lần nữa với sàng lọc | Kiểm thử API với đầu vào sai |
| A-NFR-05 Lỗi | Lỗi nghiệp vụ → HTTP 400 với thông điệp tiếng Việt; lỗi hệ thống → 500 không lộ chi tiết Oracle/stack trace | Kiểm thử API |
| A-NFR-06 Truy vết audit | Mỗi request gắn mã định danh (`client_identifier`) để đối chiếu với audit trail | Gọi API rồi tìm mã trong `unified_audit_trail` (cho lệnh bị từ chối) hoặc `v$session` |
| A-NFR-07 Hiệu năng | Dữ liệu nhỏ. Mục tiêu cảm nhận: mỗi màn hình phản hồi dưới 1 giây trên máy local. Không cam kết như SLA | Đo thời gian API trong kiểm thử |
| A-NFR-08 Tái lập | Phiên bản thư viện cố định (lockfile); có hướng dẫn chạy từ đầu; lệnh khởi động rõ ràng | Cài lại từ thư mục sạch |
| A-NFR-09 Khả dụng | Ưu tiên màn hình máy tính (demo, chụp ảnh); không vỡ bố cục ở màn hình hẹp; tương phản đủ đọc; dùng được bằng bàn phím | Kiểm tra thủ công + ảnh chụp |
| A-NFR-10 Kiểm thử được | Có kiểm thử tự động cho API (trên database thật) và kiểm tra các màn hình chính | Lệnh kiểm thử chạy được và đạt |

## 7. Bộ nhãn trạng thái

| Giá trị trong Oracle | Nhãn hiển thị | Ý nghĩa cho người xem |
|---|---|---|
| `VALID` | Hợp lệ | Đã nghiệm thu, dùng cho sàng lọc |
| `CALCULATED_PROVISIONAL` | Tạm tính | Tính được nhưng đầu vào chưa nghiệm thu đủ |
| `MISSING_INPUT` | Thiếu dữ liệu | Thiếu số đầu vào hoặc năm trước |
| `INVALID_DENOMINATOR` | Mẫu số không hợp lệ | Mẫu số bằng 0 hoặc âm |
| `BLOCKED_INPUT_QUALITY` | Bị chặn do chất lượng | Đầu vào có vấn đề chất lượng đang mở |
| `NOT_AVAILABLE` (sàng lọc) | Không có chỉ số | Năm/doanh nghiệp không có kết quả |
| `PASS` / `FAIL` / `UNKNOWN` | Đạt / Không đạt / Chưa xác định | Kết quả sàng lọc |
| `VERIFIED` / `MISSING` (dòng báo cáo) | Đã xác minh / Thiếu | Trạng thái từng dòng báo cáo |
| `COMPLETED` / `PARTIAL` / `FAILED` … (batch) | Hoàn tất / Một phần / Thất bại … | Trạng thái đợt nhập |

## 8. Dữ liệu thực tế và hệ quả

Kiểm tra trực tiếp trên `ERP_DESIGN_V1` ngày 08/11/2026:

| Phát hiện | Hệ quả cho ứng dụng |
|---|---|
| 3 doanh nghiệp, đều niêm yết HOSE | Danh sách ngắn; tìm kiếm vẫn cần vì là yêu cầu FR-01 |
| **Cả 72 chỉ số đều VALID** (lý do `RETROSPECTIVE_VERIFIED_INPUTS`) | Các trạng thái Thiếu/Bị chặn/Tạm tính **không tự xuất hiện** trên dữ liệu chính. Muốn demo và kiểm thử chúng phải dùng năm 2022 (không có chỉ số) hoặc schema kiểm thử `ERP_IMPORT_TEST` |
| 12 bộ báo cáo đều VERIFIED, ngày công bố đều UNKNOWN | Ghi chú "ngày công bố chưa xác minh" luôn hiển thị |
| Mã báo cáo nguồn là `HK` | Hiển thị kèm giải thích "mã nguồn CafeF; phạm vi hợp nhất đã xác minh", không diễn giải `HK` thành tên chính thức |
| 3 batch: batch 1 nhập thật 132 dòng; batch 21 và 41 là chạy lại khi kiểm tra phân quyền và diễn tập phục hồi (132 dòng bỏ qua do trùng); 0 lỗi | S5 hiện cả ba; nên hiện `batch_key` để phân biệt. Danh sách lỗi của dữ liệu thật luôn trống |
| Bảng giá ngày có 0 dòng | S2d chỉ hiển thị thông báo |
| 9 dòng báo cáo đã hiệu chỉnh, 7 liên kết truy vết dùng số đã hiệu chỉnh | Đủ để demo hiệu chỉnh và truy vết (ví dụ VNM 2025) |

## 9. Câu hỏi mở và rủi ro

| # | Vấn đề | Đề xuất xử lý (chốt ở kế hoạch) |
|---|---|---|
| Q1 | Tìm kiếm không dấu ("hoa phat") | **Đã chốt: có.** Xử lý ở backend; dữ liệu nhỏ nên không cần index |
| Q2 | Trình duyệt gọi thẳng NestJS hay đi qua Next.js | **Đã chốt: client dùng React Query (TanStack Query) gọi thẳng NestJS.** Next.js chỉ phục vụ giao diện; NestJS bật CORS cho địa chỉ frontend. Trình duyệt không bao giờ thấy thông tin kết nối database |
| Q3 | Cách kiểm thử các trạng thái không VALID | Kiểm thử API chạy trên cả `ERP_DESIGN_V1` (dữ liệu thật) và `ERP_IMPORT_TEST` (có trạng thái biên) |
| Q4 | Có hiện lịch sử các lần tính (`v_metric_history`) không | **Đã chốt: không** đưa vào 5 màn hình chính; có thể thêm sau như phần phụ |
| R1 | Phiên bản thư viện mới (Node 24, NestJS 12, Next.js 16, node-oracledb 26) có thể chưa ổn định với nhau | Kế hoạch chọn phiên bản cụ thể, kiểm tra kết nối Oracle sớm (bước đầu tiên của triển khai) |
| R2 | node-oracledb chế độ thin với Oracle 26ai | Thử kết nối thật bằng `ERP_APP` trước khi viết API |
| R3 | Dung lượng phân vùng `/` (còn khoảng 4 GB) | Mã và thư viện Node nằm ở `/home`; theo dõi nếu dùng Docker cho ứng dụng |
| R4 | Mật khẩu `ERP_APP` hiện ở `.local/oracle_accounts.json` | Kế hoạch mô tả cách đưa vào `.env` của backend mà không commit |

## 10. Ma trận truy vết yêu cầu

| Yêu cầu | Màn hình | Nguồn Oracle | Tiêu chí nghiệm thu chính |
|---|---|---|---|
| FR-01 | S1 | `v_company_directory` | Tìm theo mã/tên; trạng thái rỗng |
| FR-02 | S2a | `v_report_lines`, `v_current_report_sets` | 3 báo cáo, đơn vị, phạm vi, phiên bản, nguồn, chất lượng; thiếu hiện rõ |
| FR-03 | S2b, S2c | `v_current_metrics`, `v_metric_lineage` | 8 chỉ số; truy tới số đầu vào; NULL không thành 0 |
| FR-04 | S3 | `pkg_screening.screen` | Năm rõ ràng; điều kiện AND; Đạt/Không đạt/Chưa xác định |
| FR-05 | S4 | `v_current_metrics` | 2–3 mã, cùng năm; thiếu là UNKNOWN, không lùi năm |
| FR-06 | S5 | `v_import_batches`, `v_import_errors` | Bộ đếm và lỗi có mã, đối tượng, nguyên nhân |
| FR-08 (xem) | S2a, S2c | `v_report_lines`, `v_metric_lineage` | Số gốc, số sửa, lý do, PDF, trang |
| FR-09 | S2d | (chưa cần) | Thông báo chưa có dữ liệu |
| NFR-04/05 | Toàn ứng dụng | Tài khoản `ERP_APP`, audit | Chỉ đọc, chỉ dùng `ERP_APP`, truy được trong audit |

## 11. Bước tiếp theo

Đã duyệt. Bước tiếp theo là **[docs/14 — Kế hoạch ứng dụng](14_KE_HOACH_UNG_DUNG.md)**, gồm:
- kiến trúc chi tiết và lựa chọn cho Q2;
- danh sách API (đường dẫn, tham số, phản hồi, mã lỗi);
- cấu trúc thư mục, phiên bản thư viện;
- các bước triển khai nhỏ, mỗi bước có đầu ra và cách kiểm chứng;
- chiến lược kiểm thử.
