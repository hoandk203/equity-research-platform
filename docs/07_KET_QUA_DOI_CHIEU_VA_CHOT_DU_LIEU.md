# Kết quả đối chiếu và các nội dung dữ liệu đã chốt

Ngày ghi nhận và reviewer xem `evidence/issuer_reports/pilot_full_review_event.json`. Người dùng đã ủy quyền tự đối chiếu các giá trị còn lại và chốt hợp lý; đây là review tự động/AI có bằng chứng, không phải ý kiến kiểm toán độc lập hoặc phê duyệt của con người.

## 1. Kết quả thực hiện

Đã đối chiếu **132/132 giá trị** = 3 doanh nghiệp × 4 năm 2022–2025 × 11 chỉ tiêu. Đã kiểm tra lại cả 42 giá trị từng có bằng chứng, không chỉ điền trạng thái cho 90 giá trị còn lại.

| Doanh nghiệp | Đã đối chiếu | Khớp số nguồn | Hiệu chỉnh theo báo cáo được chọn |
|---|---:|---:|---:|
| FPT | 44 | 44 | 0 |
| HPG | 44 | 38 | 6 |
| VNM | 44 | 41 | 3 |
| Tổng | **132** | **123** | **9** |

Mỗi dòng có số nhà cung cấp, số báo cáo gốc, công ty/năm/chỉ tiêu, tài liệu/hash/trang/cột, phương pháp trích xuất và reviewer/thời điểm. Bộ được chốt nằm tại [pilot_verified](../data/pilot_verified/README.md); [checklist](../data/pilot_verified/review_checklist.csv) không còn hàng pending trong phạm vi 132 giá trị này.

## 2. Các điểm đã chốt

| Nội dung | Quyết định và bằng chứng |
|---|---|
| Nguồn số được chọn | Báo cáo kiểm toán hợp nhất do doanh nghiệp lập. Nguồn trung gian được giữ để đối chiếu. Một số PDF lưu trên mirror; kiểm tra nội dung/tên doanh nghiệp/phạm vi và hash, không coi website mirror là tác giả số liệu |
| Kỳ và phiên bản tài liệu | 2022–2023 dùng báo cáo năm 2023, cột so sánh/hiện tại; 2024–2025 dùng báo cáo năm 2025, cột so sánh/hiện tại. Khóa đúng sáu PDF, không gọi đây là tập “mới nhất tuyệt đối” hoặc lịch sử biết tại từng thời điểm |
| Đơn vị | VND, hệ số sang VND = 1, cho 132 giá trị đã đối chiếu. Các bảng số đã kiểm tra ghi VND/VNĐ và thuyết minh xác nhận tiền tệ |
| Scope | CONSOLIDATED — hợp nhất; chuẩn mực VAS. Mã HK chỉ được xác nhận tương ứng cho 12 kỳ pilot bằng tài liệu, không tự áp quy tắc HK cho toàn nguồn |
| Niên độ | 01/01–31/12, đã đọc thuyết minh kỳ kế toán của sáu tài liệu; BS lấy cuối năm, IS/CF lấy cả năm. Cột 01/01/năm báo cáo trên BS là số cuối năm trước |
| Loại lợi nhuận/vốn | NI toàn doanh nghiệp và tổng VCSH cho ROA/ROE; LNST công ty mẹ giữ riêng. Tổng VCSH phải bao gồm NCI theo báo cáo được chọn |
| CFO HPG 2024 | Chốt 6.608.320.655.215 VND từ PDF 2025 trang 11, cột năm trước. Không dùng số 0 của phần CFO nguồn bị toàn 0 |
| Ngày công bố | Giữ NULL/UNKNOWN. Ngày ký, ngày tải và niên độ không thay cho ngày công bố. Không chặn sử dụng hồi cứu local vì MVP không thực hiện backtest |
| Thẩm quyền review pilot | Người dùng đã cho phép agent tự review/chốt. Chấp nhận khi có đủ bằng chứng số, metadata và kiểm tra chéo; ghi reviewer Codex, không ghi là đã có human sign-off |
| Trạng thái được dùng | 132 fact VERIFIED và 72 metric VALID **trong phạm vi demo hồi cứu local theo policy**. Không mở rộng trạng thái này sang 60 fact khác, giá ngày hoặc toàn bộ nguồn |

Policy máy đọc: [pilot_acceptance_policy.json](../config/pilot_acceptance_policy.json). Công thức 8 chỉ số không đổi.

## 3. Chín hiệu chỉnh

| Doanh nghiệp/năm | Chỉ tiêu | Số nhà cung cấp | Số được chọn từ báo cáo | Chênh lệch VND |
|---|---|---:|---:|---:|
| HPG 2022 | Tài sản ngắn hạn | 80.514.708.725.456 | 80.514.710.854.456 | +2.129.000 |
| HPG 2022 | Tổng tài sản | 170.335.519.508.132 | 170.335.521.637.132 | +2.129.000 |
| HPG 2022 | Nợ phải trả | 74.222.579.892.349 | 74.222.582.021.349 | +2.129.000 |
| HPG 2022 | Nợ ngắn hạn | 62.385.390.680.685 | 62.385.392.809.685 | +2.129.000 |
| HPG 2022 | Tổng nguồn vốn | 170.335.519.508.132 | 170.335.521.637.132 | +2.129.000 |
| HPG 2024 | CFO | 0 | 6.608.320.655.215 | +6.608.320.655.215 |
| VNM 2025 | Tổng tài sản | 53.312.340.717.301 | 53.312.370.717.301 | +30.000.000 |
| VNM 2025 | Tổng VCSH | 30.685.382.906.886 | 34.483.015.286.107 | +3.797.632.379.221 |
| VNM 2025 | Tổng nguồn vốn | 49.514.738.338.080 | 53.312.370.717.301 | +3.797.632.379.221 |

**HPG 2022:** đã xác nhận năm số so sánh trên ảnh PDF báo cáo 2023, trang 83/85/86/87. Chưa có bằng chứng riêng xác định nguyên nhân gốc của khác biệt 2.129.000; không tự gọi đó là lỗi nhập hay điều chỉnh hồi tố của doanh nghiệp. Quyết định là dùng đúng số trong tài liệu đã chọn cho snapshot này và giữ nguyên số nhà cung cấp.

**HPG 2024:** đã đọc lại ảnh PDF trang 11 và hoàn tất review correction cũ bằng bản ghi kế thừa được ghi reviewer/thời điểm. Phần so sánh BS 2024 trong báo cáo 2025 có đánh dấu trình bày lại; thuyết minh trang 20 nói phân loại lại 54 tỷ giữa hai khoản nợ dài hạn. Các tổng BS thuộc 11 chỉ tiêu đang chọn không đổi bởi việc phân loại này.

**VNM 2025:** chênh lệch equity bằng NCI ghi trong PDF. Chỉ sửa đúng các giá trị đã đối chiếu, không tự cộng NCI trên toàn bộ doanh nghiệp/năm.

## 4. Phương pháp và hồ sơ nguồn

Ba tài liệu có text layer được trích theo **trang PDF + mã dòng + đúng hai cột số**, tách số trước khi đọc giá trị nhà cung cấp. Mã dòng phải là ô mã báo cáo, không phải số nằm trong công thức hoặc phần cuối một số tiền. Khi không có duy nhất một dòng phù hợp thì script dừng. Các nguồn scan được đọc trực tiếp ảnh và nhập số vào bảng bằng chứng, rồi kiểm tra cân đối/số học. Hash PDF được khóa theo review event để không áp bản chép số lên một tệp khác.

| Tài liệu | Bằng chứng kỳ kế toán/đơn vị | Phương pháp |
|---|---|---|
| FPT báo cáo 2023 | Trang PDF 156; bảng số 145–152 | Text, mã dòng và cột; PDF doanh nghiệp trên Vietstock mirror |
| FPT báo cáo 2025 | Trang PDF 176; bảng số 165–171 | Text, mã dòng và cột; PDF local đã lưu |
| HPG báo cáo 2023 | Trang PDF 99; bảng số 83–90 | Text, mã dòng và cột; xem thêm ảnh các dòng chênh lệch |
| HPG báo cáo 2025 | Trang PDF 20; bảng số 7–11 | Đọc ảnh scan, có metadata URL issuer |
| VNM báo cáo 2023 | Trang PDF 22; bảng số 7–12 | Đọc ảnh scan; PDF doanh nghiệp trên F-Fin mirror, đã xem ý kiến KPMG trang 6 |
| VNM báo cáo 2025 | Trang PDF 22; bảng số 7–12 | Đọc ảnh scan; PDF hồ sơ HOSE |

Các URL, đường dẫn và hash đầy đủ trong [source_documents.json](../data/pilot_verified/source_documents.json). Nguồn công khai chính: [HPG báo cáo 2023](https://file.hoaphat.com.vn/hoaphat-com-vn/2025/03/bao-cao-thuong-nien-2023.pdf), [VNM hồ sơ 2025 tại HOSE](https://staticfile.hsx.vn/Uploads/UploadDocuments/2440890/20260227%20-%20VNM%20-%20BCTC%20HOP%20NHAT%202025%20-%20DA%20KIEM%20TOAN.pdf), [FPT báo cáo 2023 bản mirror](https://static2.vietstock.vn/vietstock/2024/3/27/20240327_20240326___fpt___bao_cao_thuong_nien_2023.pdf), [VNM báo cáo 2023 bản mirror](https://data.thebulltrust.com/vn30_bctc_pdfs/VNM_BCTC_2023.pdf).

## 5. Kiểm tra sau khi chốt

- 132 giá trị có đủ bằng chứng và metadata; 123 khớp, 9 hiệu chỉnh.
- 12/12 bảng cân đối đạt A = L + E = tổng nguồn vốn, sai lệch 0 VND trong tập số đã chọn.
- 36 dòng metadata BS/IS/CF và 132 fact đã chuẩn bị cho bước nhập Oracle; **chưa nhập vào schema**.
- 72 kết quả tính lại bằng Decimal và đối chiếu bằng Fraction độc lập; đã chạy PL/SQL math trên Oracle và khớp cả 72.
- Tổng 13 test methods Python đạt; 21 smoke checks Oracle đạt, fixture rollback đạt. Log Oracle mới nằm trong `evidence/oracle_verified_pilot/`; không ghi đè bằng chứng số liệu cũ.
- Raw, panel và mọi bộ mẫu trước giữ nguyên; các hash input/output được kiểm tra.

Lệnh tái lập từ thư mục gốc:

```bash
python3 Quan_Tri_CSDL/scripts/prepare_pilot_review.py
python3 Quan_Tri_CSDL/scripts/build_verified_pilot.py
python3 -m unittest discover -s Quan_Tri_CSDL/tests -v
python3 Quan_Tri_CSDL/scripts/check_oracle_design.py --dataset Quan_Tri_CSDL/data/pilot_verified --evidence-dir Quan_Tri_CSDL/evidence/oracle_verified_pilot
```

Không đồng nhất việc hoàn tất review bộ mẫu với hoàn tất toàn bộ dự án: còn package nhập/điều phối, API/UI, dữ liệu giá, quyền thực tế, đồng thời, audit database, tối ưu và backup/restore.
