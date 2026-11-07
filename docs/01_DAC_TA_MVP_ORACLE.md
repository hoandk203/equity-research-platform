# Đặc tả MVP Oracle — Equity Research Platform

Phiên bản 1.0 — 07/11/2026. Trạng thái: đặc tả triển khai; chưa phải bằng chứng đã cài Oracle hay chạy ứng dụng. Người dùng đã đồng ý bộ 8 chỉ số ngày 07/11/2026.

## 1. Mục tiêu và ranh giới

Thiết kế và quản trị CSDL tài chính trên Oracle, phục vụ xem báo cáo, sàng lọc và so sánh doanh nghiệp. Có ứng dụng local và bằng chứng thực nghiệm để viết tiểu luận khoảng 50 trang. Oracle 26ai Free là lựa chọn đã ghi nhận trong hồ sơ; image, môi trường và khả năng tính năng cần xác minh ở bước cài đặt.

MVP: FPT, HPG, VNM, MWG, PNJ, REE, GAS, DGC, VHC, GMD; doanh nghiệp phi tài chính; BCTC năm 2022–2025, ưu tiên hợp nhất; chỉ số đầu ra 2023–2025; giá/khối lượng ngày 2023–2025. Pilot dùng FPT–HPG–VNM trước khi mở rộng. Giá vẫn thuộc phạm vi nhưng chưa có dataset nghiệm thu; không đưa dữ liệu giả vào màn hình như giá thực.

Không thuộc nghiệm thu cốt lõi: dự báo giá, giao dịch, danh mục, backtest, chỉ báo kỹ thuật chuyên sâu, thanh toán, lưu/chia sẻ bộ lọc, huấn luyện MLP. Phần Học sâu dùng chung nguồn và công thức sau này, không làm tăng quy mô MVP lên 373 doanh nghiệp.

## 2. Tác nhân

| Tác nhân | Quyền nghiệp vụ |
|---|---|
| Người xem local | Xem doanh nghiệp, nguồn, báo cáo, chỉ số, lọc và so sánh |
| Người vận hành ETL | Nạp staging, chạy kiểm tra/nhập qua package được cấp quyền, xem lỗi |
| Người quản trị | Dựng schema/user/role, giám sát, audit, sao lưu/phục hồi trong môi trường thử nghiệm |

Chưa yêu cầu đăng nhập ứng dụng. Tách quyền database vẫn bắt buộc; API không dùng tài khoản DBA hoặc schema owner.

## 3. Yêu cầu chức năng và tiêu chí nghiệm thu

| ID | Chức năng | Điều kiện nghiệm thu |
|---|---|---|
| FR-01 | Danh sách doanh nghiệp | Tìm theo mã/tên; không có kết quả thì hiển thị trạng thái rỗng; mã chứng khoán liên kết doanh nghiệp |
| FR-02 | Chi tiết doanh nghiệp | Chọn năm; xem ba BCTC, đơn vị, phạm vi, phiên bản, nguồn và trạng thái chất lượng; thiếu dữ liệu hiển thị rõ |
| FR-03 | Chỉ số | Đúng 8 công thức phiên bản 1.0.0; truy được các fact đầu vào; NULL không biến thành 0; Oracle tính bằng SQL/PLSQL |
| FR-04 | Sàng lọc nhiều điều kiện AND | Chọn rõ năm 2023/2024/2025; điều kiện có mã chỉ số, toán tử và ngưỡng; chỉ tính PASS nếu mọi điều kiện đạt; hiển thị PASS/FAIL/UNKNOWN |
| FR-05 | So sánh | Chọn 2–3 mã, cùng năm và phiên bản công thức; không lùi riêng từng mã sang năm khác; thiếu hoặc lỗi hiển thị UNKNOWN |
| FR-06 | Theo dõi đợt nhập | Xem batch ID, trạng thái, số dòng nhận/nhập/từ chối/bỏ qua do trùng và lỗi có mã, đối tượng, nguyên nhân |
| FR-07 | Nhập có kiểm định | Raw → staging → kiểm tra → bảng nghiệp vụ; khóa sai/thiếu bắt buộc/xung đột phiên bản được phát hiện; không ghi đè bản cũ |
| FR-08 | Hiệu chỉnh | Mỗi sửa số có giá trị cũ/mới, lý do, bằng chứng/hash/trang, trạng thái review và phiên bản; tái tính chỉ số bị ảnh hưởng |
| FR-09 | Giá ngày | Xem ngày, OHLC/khối lượng, đơn vị, basis điều chỉnh và nguồn; dữ liệu chưa có thì thông báo chưa có; chỉ nghiệm thu sau bổ sung |

Màn hình: danh sách, chi tiết, sàng lọc, so sánh, đợt nhập. Giá nằm trong chi tiết. Risk Card là phần mở rộng, chưa tạo điểm dự báo minh họa như kết quả mô hình thật.

Ví dụ FR-04: năm 2024, `NET_MARGIN >= 0.10 AND CURRENT_RATIO >= 1.0`. Ngưỡng lưu bằng tỷ lệ thuần; 0.10 hiển thị 10%. Một điều kiện FAIL làm kết quả chung FAIL; không có FAIL nhưng có dữ liệu chưa đủ/không hợp lệ thì UNKNOWN. Dữ liệu PROVISIONAL không tham gia tập PASS chính thức; chế độ preview phải gắn nhãn và tách riêng.

## 4. Chính sách dữ liệu và thời gian

MVP là phân tích hồi cứu trên snapshot hiện có, không chứng minh thông tin đã có tại một ngày lịch sử. Ngày kết thúc kỳ, ngày công bố, ngày thu thập và ngày nhập là bốn khái niệm riêng. Chưa có bằng chứng thì ngày công bố/niên độ thực để NULL; không tự gán 31/12 hoặc lấy ngày tải làm ngày công bố.

Mỗi năm có một report set được chọn rõ gồm BS/IS/CF cùng phạm vi và mapping version. `HK` chỉ là mã nguồn cho đến khi xác minh. Công thức cần t−1 phải liên kết đúng bản đầu vào; không dùng `LAG` xuyên khoảng trống hoặc trộn hợp nhất/riêng lẻ. Phiên bản hiệu chỉnh là phiên bản dữ liệu nội bộ, không mặc nhiên là báo cáo điều chỉnh do doanh nghiệp phát hành.

Nguồn hiện có: Vnstock cho danh sách mã; CafeF cho BCTC JSON và hồ sơ; TCBS cho PDF bổ sung. Báo cáo doanh nghiệp là bằng chứng đối chiếu. Không tiếp tục mô tả Vnstock là nguồn đã cung cấp giá trị BCTC của snapshot này.

## 5. Transaction và nhập lặp

- Tạo batch và lưu staging trước. Kiểm tra toàn bộ đơn vị báo cáo trước khi promotion.
- Đơn vị transaction promotion: một doanh nghiệp–năm–phạm vi–phiên bản report set. Nếu một phần bắt buộc lỗi, không nhập dở một trong ba báo cáo vào tập được chọn; rollback đơn vị đó. Có thể tiếp tục các đơn vị khác, batch kết thúc PARTIAL nếu có cả thành công và từ chối.
- Trạng thái batch: CREATED → STAGED → VALIDATED → IMPORTING → COMPLETED/PARTIAL/FAILED. Log lỗi và bộ đếm phải tồn tại sau rollback nghiệp vụ; thiết kế lưu log bằng transaction điều phối riêng, không commit tùy tiện bên trong function tính chỉ số.
- Cùng source artifact hash + mapping version + khóa fact: bỏ qua có ghi nhận; nội dung mới khác hash tạo phiên bản mới, không update mất bản trước. Cùng business version nhưng khác giá trị là xung đột, cần review.
- Hai session chọn phiên bản hiện hành phải khóa cùng report set hoặc kiểm tra version token; chỉ một lựa chọn hiện hành cho một khóa nghiệp vụ.

## 6. Yêu cầu phi chức năng và quản trị

| ID | Yêu cầu | Bằng chứng phải có khi triển khai |
|---|---|---|
| NFR-01 | Dựng lại local | Hướng dẫn, cấu hình không chứa mật khẩu thật, script có thứ tự; data volume bền vững |
| NFR-02 | Toàn vẹn/3NF | ERD, từ điển dữ liệu, PK/FK/UNIQUE/CHECK/NOT NULL; giải thích bảng kết quả tính lưu sẵn |
| NFR-03 | PL/SQL thực dụng | Package nhập, package chỉ số, procedure/function và trigger lịch sử có use case thật |
| NFR-04 | Phân quyền | Owner, ETL và app reader tách biệt; thử cả lệnh được phép và bị từ chối; tablespace/quota |
| NFR-05 | Audit/giám sát | Audit database tách lịch sử nghiệp vụ; ghi nhận session, truy vấn hoặc lock; xác minh trên bản cài |
| NFR-06 | Tối ưu | SQL/plan/thời gian trước–sau trên cùng dữ liệu, tham số và môi trường; chưa cam kết độ trễ khi chưa đo |
| NFR-07 | Đồng thời | Hai session, trạng thái chờ/khóa, commit/rollback, kết quả cuối không mất cập nhật |
| NFR-08 | Khôi phục | Thực hiện phục hồi trên môi trường tách biệt và kiểm tra dữ liệu; không đồng nhất Data Pump với khôi phục vật lý |
| NFR-09 | Tái lập | Snapshot/hash, mapping và formula version, lineage, seed dữ liệu; số decimal thống nhất Python–Oracle |

## 7. Kiến trúc và trách nhiệm

Python thu thập/đọc file, chuẩn hóa, staging và tạo baseline đối chiếu. Oracle quản lý ràng buộc, transaction, phiên bản, SQL/PLSQL tính chỉ số, audit và quyền. NestJS API điều phối/truy vấn; Next.js/React hiển thị năm màn hình. Các lựa chọn API/UI là kiến trúc dự kiến, chưa cài trong đợt này.

Python trong bộ mẫu chỉ là kết quả tham chiếu; không thay thế việc triển khai và kiểm chứng package Oracle.

## 8. Cổng nghiệm thu

| Cổng | Điều kiện |
|---|---|
| G0 — đặc tả | Phạm vi, use case, công thức, contract v1 và chính sách lỗi có tài liệu |
| G1 — kỹ thuật bộ mẫu | Đúng 12 khóa, có lineage/hash, đối chiếu raw–panel, lỗi đã được phát hiện, 72 hàng chỉ số có trạng thái, chạy lại tái lập |
| G2 — dữ liệu được duyệt | Xác minh phạm vi/niên độ/đơn vị, đối chiếu đủ trường đầu vào của 12 kỳ, xử lý VNM và review correction HPG; publication date vẫn có thể UNKNOWN với phân tích hồi cứu nhưng phải công bố giới hạn |
| G3 — Oracle | DDL/PLSQL chạy thật, kết quả khớp baseline trong dung sai, ràng buộc/transaction/quyền/audit có bằng chứng |
| G4 — MVP hoàn chỉnh | Mở rộng 10 mã, giá ngày đã nghiệm thu, năm màn hình và thực nghiệm quản trị, báo cáo/demo |

G1 PASS không suy ra G2 PASS. Đợt hiện tại thực hiện G0 và chuẩn bị/kiểm tra G1; trạng thái thực tế xem `../PROJECT_MEMORY.md` và bộ mẫu.

## 9. Phụ thuộc còn mở

Thành viên, hạn nộp và rubric chính thức chưa có; không ngăn viết đặc tả. Chưa có giá ngày; chưa chọn image/digest; chưa đo phần cứng; chưa xác minh ngày công bố/niên độ/phạm vi toàn bộ mẫu. Không đặt các phần này thành đã hoàn tất.
