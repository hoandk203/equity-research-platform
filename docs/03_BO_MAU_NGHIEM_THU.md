# Bộ mẫu nghiệm thu Oracle — FPT, HPG, VNM

Phiên bản `oracle-pilot/1.0.0`, tạo ngày 07/11/2026 từ snapshot Học sâu ngày 05/11/2026. Bộ mẫu là fixture để triển khai/đối chiếu Oracle, không phải xác nhận toàn bộ số liệu đã được nghiệm thu tài chính.

> **Lịch sử v1:** giữ nguyên dữ liệu/checklist ở acceptance_v1. Bản mới [acceptance_v2](../data/acceptance_v2/README.md) đã đối chiếu VNM, có 72 kết quả provisional; xem [quyết định review](06_QUYET_DINH_CAN_REVIEW.md). Các số 67/5 bên dưới mô tả v1.

## 1. Kết quả thực hiện

| Nội dung | Kết quả |
|---|---|
| Phạm vi | FPT, HPG, VNM × 2022–2025: 12 khóa duy nhất |
| BCTC JSON được truy vết | 9 artifact: 3 mã × IS/BS/CF; hash khớp log thu thập |
| Facts mỗi lớp gốc/hiệu lực | 192 hàng: 16 trường × 12 kỳ, gồm 12 giá trị chi phí lãi vay đang thiếu theo mapping |
| Đối chiếu raw JSON–panel | 180 giá trị có số khớp chính xác; không xác nhận tính đúng của nguồn |
| Giá trị tham chiếu chỉ số | 72 hàng: 3 mã × 3 năm × 8 chỉ số |
| Tính được tạm thời | 67 hàng CALCULATED_PROVISIONAL |
| Chặn do chất lượng đầu vào | 5 hàng BLOCKED_INPUT_QUALITY, đều thuộc VNM 2025 |
| Được dùng lọc chính thức | 0; chưa hoàn tất G2 |
| Đối chiếu doanh nghiệp đã có từ snapshot | 20 giá trị: 19 khớp, 1 cần correction; không phải đối chiếu mới toàn bộ mẫu |
| Checklist review chỉ tiêu | 132 hàng: 11 chỉ tiêu × 12 kỳ; 112 chưa có đối chiếu trong bảng bằng chứng hiện có |
| Kết quả tự động | 6 test methods PASS; gồm toàn bộ 67 kết quả tính bằng Fraction độc lập, kiểm tra 5 kết quả bị chặn, biên công thức và tái lập |
| Oracle/PLSQL | Chưa thực thi; baseline Python không thay thế kiểm chứng Oracle |

## 2. Ma trận theo kỳ

| Mã | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|
| FPT | Có dữ liệu cơ sở, chờ review | 8 chỉ số provisional | 8 chỉ số provisional | 8 chỉ số provisional |
| HPG | Có dữ liệu cơ sở, chờ review | 8 chỉ số provisional | 8 chỉ số provisional; CFO dùng correction | 8 chỉ số provisional |
| VNM | Có dữ liệu cơ sở, chờ review | 8 chỉ số provisional | 8 chỉ số provisional | 3 provisional, 5 blocked |

Mọi kỳ vẫn chờ xác minh canonical scope, niên độ và đơn vị; ngày công bố UNKNOWN. Mã nguồn HK và nhãn “Đã kiểm toán” được bảo tồn, không tự nâng thành kết quả review của dự án.

## 3. Hai vấn đề chất lượng trọng yếu

### HPG 2024 CFO

Raw/panel ghi 0 và có cờ phần hoạt động kinh doanh toàn 0. Bảng đối chiếu đã lưu ghi số so sánh trong báo cáo kiểm toán HPG 2025, trang 11: **6.608.320.655.215**. Bộ mẫu giữ fact gốc BLOCKED và tạo fact hiệu lực có `CORR-HPG-2024-CFO-001`, trạng thái APPLIED_PROVISIONAL, hash PDF và trang nguồn. Người/thời điểm review để trống vì chưa có lần review bổ sung trong đợt này.

Correction chỉ tồn tại ở `Quan_Tri_CSDL/data/acceptance_v1/`; không sửa JSON, panel, corrections_not_applied hoặc tập ML trong Hoc_Sau. Số so sánh ở báo cáo 2025 không thay bằng chứng công bố tại thời điểm lịch sử.

### VNM 2025 bảng cân đối

JSON gốc và panel cùng có:

- Tổng tài sản: `53312340717301`.
- Nợ phải trả: `18829355431194`.
- Vốn chủ sở hữu: `30685382906886`.
- Tổng nguồn vốn: `49514738338080`.
- A − L − E = A − funding_total = `3797602379221` đơn vị số nguồn. Đơn vị chưa được xác minh đầy đủ trong bộ mẫu; không tự coi chênh lệch là VND đã nghiệm thu.

Sai lệch nằm ngay trong dữ liệu nguồn đã lưu, không phát sinh do export pilot. Chưa có bằng chứng để chọn số đúng nên không tự sửa. Chặn ROA, ROE, LIABILITIES_ASSETS, CURRENT_RATIO và CFO_AVG_ASSETS năm 2025. REVENUE_GROWTH/GROSS_MARGIN/NET_MARGIN chỉ dùng IS nên vẫn tính provisional. Nếu sau này tính năm 2026, số đầu kỳ 2025 chưa giải quyết vẫn phải làm chặn các công thức bình quân tương ứng.

## 4. Tệp bàn giao

Trong `../data/acceptance_v1/`:

| Tệp | Công dụng |
|---|---|
| panel_original.csv | 12 dòng lấy nguyên từ panel nguồn |
| facts_original.csv | 192 fact có mã, giá trị, selector và hash nguồn; giữ 0/NULL khác nhau |
| facts_effective.csv | Lớp hiệu lực, chỉ CFO HPG 2024 đổi giá trị bằng correction có ID |
| source_artifacts.csv | 9 JSON, URL, hash, collected_at; không suy ra publication_at |
| corrections.csv | Correction HPG, old/new, hash PDF, trang, trạng thái và giới hạn thời gian |
| quality_issues.csv | VNM OPEN; HPG MITIGATED_PROVISIONAL |
| metrics_reference.csv | Giá trị decimal 12 chữ số hoặc rỗng kèm status, formula version |
| metric_inputs.csv | Liên kết từng kết quả đến fact t/t−1, giá trị và correction ID |
| issuer_reconciliation_existing.csv | Bản trích 20 đối chiếu đã có, không gắn là mới thực hiện |
| review_checklist.csv | Danh sách 132 quan sát phải review; có đối chiếu trước đó vẫn cần review metadata |
| validation.json | Tóm tắt cổng kỹ thuật và cổng nghiệm thu còn pending |
| manifest.json | Hash mọi input đã dùng và output CSV/JSON để kiểm tra tái lập |

Manifest không hash chính nó; README và tài liệu diễn giải không nằm trong manifest dữ liệu. Hash input ghi script builder và script mapping dùng để tái lập. Test script được bàn giao riêng; không coi số test là thước đo độ chính xác tài chính.

## 5. Chạy lại và kiểm tra

Từ thư mục gốc `CSDL_HocSau`:

```bash
python3 Quan_Tri_CSDL/scripts/build_acceptance_sample.py
python3 -m unittest discover -s Quan_Tri_CSDL/tests -v
```

Chỉ dùng Python standard library, không gọi mạng hoặc Oracle. Builder ghi lại CSV/JSON trong bộ mẫu v1; giữ phiên bản khác bằng `--output /duong/dan/bo_mau_moi` nếu thay đổi có chủ đích. Builder từ chối output dưới Hoc_Sau. Test tái tạo vào thư mục tạm và kiểm tra hash input trước/sau; không tái chạy script profile ghi đè processed của Học sâu.

Test kiểm tra: ví dụ số học dễ tính cho đủ 8 công thức; NULL/0/mẫu số âm và VCSH đổi dấu; làm tròn dương/âm; kết quả thực bằng số hữu tỷ độc lập; correction chỉ thay đúng một giá trị và lineage không mồ côi; hash/tái lập. Các kịch bản transaction/role/concurrency/recovery cần chạy thật ở Oracle trong bước sau.

## 6. Điều kiện hoàn tất nghiệm thu dữ liệu

1. Bổ sung báo cáo gốc phù hợp cho 12 kỳ hoặc số so sánh có ghi rõ phiên bản; hoàn thành 132 hàng checklist với nguồn/trang/đơn vị.
2. Xác nhận HK thực sự tương ứng phạm vi hợp nhất của từng report set, niên độ và đơn vị từng báo cáo; không chỉ dựa tên mã.
3. Đối chiếu VNM 2025, tạo correction mới nếu có bằng chứng; review correction HPG và giữ bản gốc.
4. Chạy lại với dataset/mapping version phù hợp sau thay đổi; không chuyển PROVISIONAL sang VALID bằng cách sửa nhãn thủ công trên CSV kết quả.
5. Khi có Oracle, tính lại bằng SQL/PLSQL; so sánh từng result/status/input version với baseline trong dung sai contract.

Ngày công bố có thể tiếp tục UNKNOWN cho demo hồi cứu có ghi giới hạn; muốn mô phỏng dự báo lịch sử phải làm bước bằng chứng thời điểm riêng. Chưa thu thêm dữ liệu diện rộng, giá ngày hoặc huấn luyện mô hình trong đợt này.
