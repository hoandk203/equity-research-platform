# Các quyết định quan trọng để review

Ngày 07/11/2026. Người dùng đã cho phép tự quyết định và làm tiếp; các quyết định dưới đây **đã được áp dụng trong nhánh triển khai/thử nghiệm**, chưa ghi nhận phê duyệt riêng của người dùng. Có thể điều chỉnh bằng phiên bản/migration mới; không cần dừng công việc chỉ để xin xác nhận lại.

| ID | Quyết định đã áp dụng | Lý do/ảnh hưởng | Bạn nên review gì? |
|---|---|---|---|
| ADR-01 | Mô hình 23 bảng, 3 nhóm nghiệp vụ chính và bảng hỗ trợ | Giữ nguồn, phiên bản và lineage; chi tiết ở ERD. Dễ mở rộng ML mà chưa phải xây ML | Mức chi tiết có phù hợp bài tiểu luận và khả năng nhóm? |
| ADR-02 | BCTC/fact/correction bất biến; report set khóa cả report và correction | Cùng một nguồn có thể đổi số; kết quả cũ phải tái lập được. Review/sửa metadata tạo report_version/successor, không update đè | Chấp nhận tăng số phiên bản để đổi lấy khả năng truy vết? |
| ADR-03 | Dùng report_set_facts làm snapshot đầu vào; chỉ có một report head theo công ty/năm/scope | Tránh “lấy correction mới nhất” âm thầm làm đổi chỉ số cũ. Con trỏ hiện hành đổi có history/version | Cách chọn phiên bản được dùng trên màn hình có rõ ràng? |
| ADR-04 | Phân tích hồi cứu, không cam kết point-in-time; publication_at có thể NULL | Các ngày công bố chưa có bằng chứng đầy đủ. Không lấy ngày ký PDF hoặc ngày tải thay ngày công bố | Phạm vi hồi cứu có đáp ứng kỳ vọng demo hiện tại? |
| ADR-05 | VNM 2025: sửa assets, equity và funding_total theo PDF kiểm toán VAS; tạo dataset v2 | Assets +30 triệu VND; equity và funding_total bổ sung phần thiếu tương ứng NCI. Giữ nguyên v1/raw/ML | Review ba dòng correction và trang 8–9 PDF; không chọn số IFRS để trộn với VAS |
| ADR-06 | Review bằng AI ghi AUTO_REVIEWED, không giả là human approval; cả 72 chỉ số v2 vẫn provisional | 22 giá trị được đọc trực tiếp từ PDF; checklist còn 110 hàng pending và metadata chưa đủ. Không đưa vào lọc chính thức | Khi nào/ai sẽ làm human sign-off cho bộ mẫu? Không phải điều kiện ngăn tiếp tục ERD/ETL thử |
| ADR-07 | Dùng container Oracle có sẵn, tạo schema-only ERP_DESIGN_V1, quota 64 MB; không đổi THACSI | Không cần tải/cài lại; kiểm tra được trên Oracle thật. Schema không có đăng nhập ứng dụng, chưa phải môi trường vận hành hoàn chỉnh | Tên schema thử và việc tách khỏi THACSI có phù hợp tổ chức môn học? |
| ADR-08 | Số tiền nguồn và VND chuẩn hóa lưu riêng; chỉ normalize khi có bằng chứng đơn vị | Tránh đơn vị giả và mất độ chính xác. Ratio vẫn tính preview khi đồng scale nhưng gắn provisional | Có chấp nhận giao diện phân biệt preview và số đã duyệt? |
| ADR-09 | Giữ 8 công thức v1.0.0; CFO chia tài sản bình quân; chưa đổi feature ML | Tránh vô tình đổi đề cương/dataset học sâu. Tính toán Python và PL/SQL đã khớp 72 kết quả | Khi tích hợp, thống nhất mẫu số CFO với đề cương ML hoặc tách mã công thức |
| ADR-10 | Giá ngày có schema nhưng thu thập/ETL/API chưa triển khai trong đợt ERD | Ưu tiên tính đúng của tài chính và mô hình dữ liệu; không dùng dữ liệu giả như giá thật | Giữ phạm vi giá 2023–2025 cho mốc mở rộng 10 mã |

## Cập nhật sau ủy quyền tự review/chốt dữ liệu

Người dùng đã yêu cầu agent tự đối chiếu toàn bộ và chốt hợp lý. Đã hoàn tất 132/132 giá trị, xác nhận metadata cho 12 kỳ và ghi 9 correction; **không còn cổng chờ human sign-off cho bộ pilot này**. Review mode ghi rõ tự động/AI, không phải phê duyệt của người dùng hoặc ý kiến kiểm toán độc lập. 132 fact và 72 metric được chấp nhận cho hồi cứu local theo policy; 60 fact khác và point-in-time ngoài phạm vi. Xem [biên bản hiện hành](07_KET_QUA_DOI_CHIEU_VA_CHOT_DU_LIEU.md). Các ADR về nguồn và phiên bản vẫn áp dụng.

## Bằng chứng cho ADR-05

[PDF do Vinamilk lập, lưu tại HOSE](https://staticfile.hsx.vn/Uploads/UploadDocuments/2440890/20260227%20-%20VNM%20-%20BCTC%20HOP%20NHAT%202025%20-%20DA%20KIEM%20TOAN.pdf), [bản local](../evidence/issuer_reports/VNM_2025_audited.pdf), PDF trang 8–9 (số in 7–8), cột 31/12/2025, đơn vị VND, hợp nhất VAS. Ngày ký 27/02/2026 **không được lưu làm ngày công bố**.

| Trường | CafeF/raw giữ nguyên | Giá trị hiệu lực v2 | Chênh lệch |
|---|---:|---:|---:|
| assets | 53.312.340.717.301 | 53.312.370.717.301 | +30.000.000 |
| equity | 30.685.382.906.886 | 34.483.015.286.107 | +3.797.632.379.221 |
| funding_total | 49.514.738.338.080 | 53.312.370.717.301 | +3.797.632.379.221 |

PDF ghi lợi ích cổ đông không kiểm soát 3.797.632.379.221. Chênh lệch equity đúng bằng khoản này; đây là bằng chứng số học cho sai khác khái niệm ở nguồn, không phải lý do để tự cộng NCI cho mọi doanh nghiệp. Phải đối chiếu riêng từng report. Sau sửa, assets = liabilities + equity = funding_total.

Chi tiết 22 quan sát và trang/hash nằm trong [issuer_reconciliation_v2.csv](../data/acceptance_v2/issuer_reconciliation_v2.csv). Báo cáo thường niên Vinamilk có cả VAS và IFRS; bản annual mirror đã lưu để khảo sát, **không dùng bảng IFRS làm correction cho bộ VAS**.

## Giới hạn của kiểm chứng Oracle

Đã chạy DDL, 14 trigger, package số học, 72 đối chiếu và 21 smoke checks ở đợt thiết kế. Đợt tiếp theo đã nhập 132 số/9 correction/12 kỳ bằng package, kiểm chứng 31 tình huống gồm hai session, đọc lại 132 số và tính 72 kết quả từ DB. Chưa có coordinator lưu chỉ số/lineage, vai trò vận hành, audit database hoặc phục hồi backup; chi tiết [docs/08](08_NHAP_DU_LIEU_ORACLE.md).

## Quyết định bổ sung khi nhập thật

| ID | Quyết định đã áp dụng | Ảnh hưởng để review |
|---|---|---|
| ADR-11 | Lưu 132 số provider và 9 correction riêng; snapshot chọn số hiệu lực issuer | Giữ số gốc, đúng cùng 132 số đã chốt; provenance số khớp nằm trong staging/checklist/PDF |
| ADR-12 | Transaction theo doanh nghiệp–năm, batch có thể PARTIAL; staging/log giữ sau rollback | Không để một kỳ nhập dở; kỳ khác hợp lệ vẫn nhập được. Batch gián đoạn không tự resume |
| ADR-13 | Cho phép ngày tải artifact NULL khi thiếu bằng chứng | Không bịa timestamp của FPT/HPG 2025; vẫn giữ hash/path, ngày nhập và ngày công bố riêng |
| ADR-14 | Test tích hợp trong ERP_IMPORT_TEST; dữ liệu chuẩn trong ERP_DESIGN_V1 | Giữ fixture giả lập và log lỗi kiểm thử ngoài schema nguồn ứng dụng; THACSI giữ nguyên |

## Quyết định bổ sung khi tính và lưu chỉ số

| ID | Quyết định đã áp dụng | Ảnh hưởng để review |
|---|---|---|
| ADR-15 | Calculation khóa snapshot t/t−1 và từng selection_fact_id; lưu đúng fact/correction được dùng | 9 run, 72 kết quả và 171 lineage; head/correction mới không làm đổi kết quả cũ |
| ADR-16 | Hoàn tất 8 kết quả/run kể cả trạng thái thiếu/bị chặn; VALID kiểm tra theo đúng dependency | COMPLETED không đồng nghĩa mọi số VALID; thiếu năm trước chỉ ảnh hưởng 4 công thức liên quan |
| ADR-17 | Transaction độc lập theo run, runtime lỗi rollback kết quả nhưng giữ FAILED/log; khóa mới cho retry | Không có một phần kết quả bị dùng dở; replay cùng khóa không nhân bản, không ghi đè run thất bại |
| ADR-18 | Guard result/input khóa parent run; current-head API khóa company và head | Hai session đã kiểm chứng writer chờ finalize rồi bị từ chối; không đổi số bảng/cột/trigger |

Đã áp dụng và kiểm chứng: **39 ca calculation, 21 smoke checks cấu trúc và 13 Python tests PASS**, 72/72 số và 171/171 đầu vào khớp. Nguồn: [docs/09](09_TINH_VA_LUU_CHI_SO_ORACLE.md). Quyền vận hành/view/API/UI và backup/restore còn triển khai.

## Quyết định bổ sung khi làm view và phân quyền

| ID | Quyết định đã áp dụng | Ảnh hưởng để review |
|---|---|---|
| ADR-19 | Ứng dụng chỉ đọc qua view `WITH READ ONLY`; cấp `READ` (không phải `SELECT`) cho role; không cấp quyền trên bảng; chủ schema không đăng nhập được | APP không khóa được bảng hay đọc payload staging; muốn thêm dữ liệu cho màn hình thì phải thêm view, không cấp bảng |
| ADR-20 | ETL chỉ EXECUTE một facade `pkg_etl_api` (definer rights), có danh sách nguồn và phạm vi cho phép; package nội bộ và `install_catalog` không mở | Giảm bề mặt tấn công; mở rộng 10 mã cần phiên bản facade mới |
| ADR-21 | "Hiện hành" = run COMPLETED mới nhất khớp head năm t (và t−1 cho 4 công thức); issue OPEN HIGH/CRITICAL hoặc thiếu lineage chặn ngay lúc đọc; không lùi về VALID cũ | Màn hình không bao giờ hiện số đã lỗi thời hoặc bị nghi vấn; đổi head thì phải tính lại trước khi số hiện lại |
| ADR-22 | Tài khoản dịch vụ thật đăng nhập bằng mật khẩu ngẫu nhiên lưu local 0600; bộ tài khoản riêng cho schema kiểm thử; 3 view vận hành chỉ cấp cho ETL | Kiểm chứng quyền bằng đăng nhập thật thay vì giả lập; màn hình Đợt nhập (FR-06) còn chờ chọn cách cấp quyền |

Đã áp dụng và kiểm chứng: **38 ca phân quyền PASS**, ERP_APP đọc khớp 72/72 chỉ số và 171/171 đầu vào. Nguồn: [docs/10](10_VIEW_VA_PHAN_QUYEN_ORACLE.md).

## Quyết định bổ sung khi quản trị vận hành

| ID | Quyết định đã áp dụng | Ảnh hưởng để review |
|---|---|---|
| ADR-23 | Tablespace `ERP_DATA` riêng (trần 512 MB) cho schema chính, quota USERS = 0; `ERP_PERF_DATA` riêng cho schema không phục vụ ứng dụng; schema test giữ ở USERS | ERP tách khỏi THACSI và backup/phục hồi nhắm riêng ERP được; trần dung lượng có thể cần nâng khi mở rộng 10 mã và giá ngày |
| ADR-24 | Bốn policy unified audit (thay đổi bảng, gọi ETL API, phiên dịch vụ, hành động bị từ chối); không audit SELECT của ứng dụng | Đủ truy vết ai sửa/ai bị từ chối mà không phình audit theo lượt đọc; theo dõi truy vấn đọc bằng `v$sql` |
| ADR-25 | Tài khoản thứ tư `ERP_MONITOR`: đọc audit/session/khóa/SQL/dung lượng, không đọc dữ liệu ERP, không sửa audit | Người giám sát tách khỏi người vận hành; backend nên đặt `client_identifier` để audit truy được từng request |
| ADR-26 | Đo tối ưu trên dữ liệu pilot nhân bản 200× trong schema riêng; chỉ áp thay đổi giữ nguyên kết quả (so hash) | Có số đo trước/sau có ý nghĩa mà không bịa dữ liệu tài chính; số tuyệt đối không phải cam kết độ trễ |
| ADR-27 | Thêm `symbol, company_key` vào `PARTITION BY` của `v_current_metrics` và index `staging_facts_ix3`; API lấy lineage theo `result_id` | Q1/Q4 nhanh ~25 lần; lineage theo `result_id` nhanh hơn lọc theo mã ~160 lần buffer gets |
| ADR-28 | Phục hồi hai lớp: Data Pump vào schema tách biệt và RMAN restore/recover tablespace tại chỗ; backup đặt trong volume oradata | Chứng minh được cả khôi phục logic lẫn vật lý trong giới hạn đĩa; chưa phục hồi toàn instance sang container khác và backup chưa nằm ngoài đĩa |

Đã áp dụng và kiểm chứng: 10/10 kiểm tra audit/giám sát, 23/23 bảng khớp sau phục hồi logic, giao dịch sau backup còn nguyên sau phục hồi vật lý, 38/38 ca phân quyền sau tối ưu. Nguồn: [docs/11](11_QUAN_TRI_VAN_HANH_ORACLE.md).

## Quyết định bổ sung khi chuẩn bị dữ liệu cho ứng dụng

| ID | Quyết định đã áp dụng | Ảnh hưởng để review |
|---|---|---|
| ADR-29 | Theo yêu cầu người dùng ngày 08/11/2026 ("đủ dữ liệu để triển khai là được"): bộ pilot FPT–HPG–VNM là dữ liệu chính thức của ứng dụng; giá ngày hiển thị "chưa có dữ liệu" | Không cần thu thập/đối chiếu thêm 7 mã và giá ngày để làm ứng dụng; sàng lọc chỉ có 3 doanh nghiệp. Mở rộng sau vẫn theo quy trình docs/07–09 |
| ADR-30 | Màn hình Đợt nhập dùng view riêng `v_import_batches`/`v_import_errors` cấp cho APP; ba view vận hành của ETL giữ nguyên | APP thấy trạng thái nhập mà không thấy chi tiết snapshot/run nội bộ |
| ADR-31 | Sàng lọc PASS/FAIL/UNKNOWN chạy trong database (`pkg_screening`, điều kiện JSON, không SQL động); APP được EXECUTE gói này | Một nguồn quy tắc cho mọi client; backend không ghép SQL từ đầu vào người dùng |

Đã kiểm chứng: 15/15 ca API ứng dụng và 38/38 ca phân quyền. Nguồn: [docs/12](12_HOP_DONG_DU_LIEU_CHO_UNG_DUNG.md).
