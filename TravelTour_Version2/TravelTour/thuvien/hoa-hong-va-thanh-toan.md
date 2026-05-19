# Hoa hồng & thanh toán (Mô hình A — giai đoạn 1)

> Mô hình: **Provider trả Guide** trực tiếp; **Sàn** thu phí từ Provider trên booking và thu phí partner từ Guide trên hoa hồng đã xác nhận.

---

## 1. Công thức %

`D` = `tours.duration_days` (1..15).

```
provider_platform_fee_rate    = 10                           // cố định, không phụ thuộc số ngày tour
guide_commission_rate(D)      = min(17, 10 + max(0, D - 1))   // +1% từ D=2, cap 17% tại D=8
guide_partner_fee_rate        = 6                              // % cố định trên gross HDV
```

### Bảng tham chiếu

| D | Phí sàn NCC | Hoa hồng HDV |
|---|-------------|--------------|
| 1 | 10% | 10% |
| 2 | 10% | 11% |
| 3 | 10% | 12% |
| 4 | 10% | 13% |
| 5 | 10% | 14% |
| 6 | 10% | 15% |
| 7 | 10% | 16% |
| 8 | 10% | 17% (cap) |
| 9 | 10% | 17% |
| 10 | 10% | 17% |
| 11 | 10% | 17% |
| 12 | 10% | 17% |
| 13 | 10% | 17% |
| 14–15+ | 10% | 17% |

---

## 2. Ba mốc thời gian (state machine)

```
[Khách thanh toán] → booking.status = 'confirmed'
       │
       ▼
(A) Tạo booking_commissions (snapshot phí sàn NCC + dự kiến hoa hồng HDV)
    + cộng vào báo cáo "Sàn nhận / Provider doanh thu sau phí sàn".
       │
[Guide hoàn thành tiến độ tour] → tours.guide_completed_at
       │
       ▼
(B) Tạo guide_earnings cho HDV cuối (rule absence: cũ 0%, mới 100%).
    Gửi notify Provider: "Tour X đã hoàn thành — hãy thanh toán HDV".
       │
[Provider bấm "Đã thanh toán" trong popup tiến độ] → status = 'provider_marked_paid'
       │
       ▼
(C) Notify Guide: "Provider đã thanh toán — xác nhận đã nhận".
       │
[Guide bấm "Đã nhận"] → status = 'guide_confirmed'
       │
       ▼
(D) Khấu trừ guide_partner_fee 6% × gross → ghi net.
    Cộng vào "Tổng thu nhập" (gross) & "Thu nhập thực" (net) của Guide.
    Cộng vào "Tổng phí sàn" Admin (phí NCC + phí partner HDV).
```

### Trạng thái `guide_earnings.status`

- `pending_payout` — sau (B), chờ Provider trả  
- `provider_marked_paid` — sau (C)  
- `guide_confirmed` — sau (D), đã ghi nhận thu nhập  
- `cancelled` — báo bận HDV cũ / tour hủy

---

## 3. Áp dụng vào báo cáo

### Admin (`baocao.html`)

- **Card đỏ mới**: "Phí sàn nhận được" = SUM(`booking_commissions.platform_fee_amount`) + SUM(`guide_partner_fees.fee_amount`).  
- **Bảng chi tiết hoa hồng** (mới): mỗi dòng = 1 booking (đã `confirmed` trở lên), cột: Tour, `D`, % phí NCC, tiền phí NCC, % HDV, tiền HDV gross, 6% partner, **tổng sàn dòng này**.

### Provider (`report.html`)

- Card mới: "Doanh thu thực" = `final_price` − `platform_fee_amount` − `guide_commission_gross_amount` (đã xác nhận).  
- Card mới: "Phải trả HDV" = SUM(`guide_earnings.gross_amount`) trạng thái ≠ `guide_confirmed` ≠ `cancelled`.  
- Bảng mở rộng: thêm cột "Phí sàn", "Hoa hồng HDV", "Còn lại".

### Guide (`thunhap.html`)

- Card "Tổng thu nhập" = SUM(`gross_amount`) status = `guide_confirmed`.  
- Card "Thu nhập thực" = SUM(`net_amount`) (gross − 6%).  
- Card "Phí sàn đã trừ tháng này".  
- Bảng giao dịch từ `guide_earnings` (không từ `tours.archived` như hiện tại).

---

## 4. Báo bận / HDV thay

- Khi `guide_absence_requests` được duyệt + có HDV thay → cập nhật `tours.guide_id` (đã có).  
- `guide_earnings` sau (B) **chỉ tạo cho HDV cuối** (`tours.guide_id`).  
- HDV cũ: **không** có dòng `guide_earnings` (hoặc `cancelled`).

---

## 5. Schema tóm tắt

```sql
commission_policies (
  id, provider_id (NULL = mặc định toàn sàn), tour_id (NULL = mọi tour),
  platform_fee_rate DECIMAL(5,2), guide_commission_rate DECIMAL(5,2),
  guide_partner_fee_rate DECIMAL(5,2),
  effective_from, effective_to, created_at
)

booking_commissions (
  id, booking_id UNIQUE, tour_id, provider_id, duration_days,
  base_amount,                       -- final_price snapshot
  platform_fee_rate, platform_fee_amount,
  guide_commission_rate, guide_commission_gross_expected,
  guide_partner_fee_rate,            -- snapshot (default 6)
  status ENUM('snapshot','cancelled'),
  created_at
)

guide_earnings (
  id, booking_id, tour_id, guide_id, provider_id,
  gross_amount, partner_fee_rate, partner_fee_amount, net_amount,
  status ENUM('pending_payout','provider_marked_paid','guide_confirmed','cancelled'),
  provider_marked_paid_at, provider_payment_ref,
  guide_confirmed_at, cancelled_reason,
  created_at, updated_at
)

-- Bổ sung cho guides (thông tin ngân hàng để Provider chuyển khoản):
ALTER TABLE guides ADD COLUMN bank_name, bank_account_number, bank_account_name, bank_branch
```

---

## 6. API mới (route)

```
# Snapshot khi paid (hook trong paymentController.confirmBookingIfPendingPayment)
internal: ensureBookingCommission(bookingId)

# Khi guide complete tour: hook trong completeTourForGuide
internal: createGuideEarningsForCompletedTour(tourId)

# Admin
GET  /api/admin/commissions/overview?from&to
GET  /api/admin/commissions/breakdown?from&to&limit&offset

# Provider
GET  /api/provider/commissions/summary?months=6
GET  /api/provider/tours/:tourId/payable-guide      # info để hiện popup trả HDV
POST /api/provider/guide-earnings/:earningId/mark-paid  body: { paymentRef? }

# Guide
GET  /api/guide/earnings?range=6                    # thay/đi kèm /income
POST /api/guide/earnings/:earningId/confirm         # bấm "Đã nhận"
GET  /api/guide/bank-info                           # đọc STK của mình
PUT  /api/guide/bank-info                           # cập nhật (trong hồ sơ)
```

---

## 7. Giai đoạn (đã chốt)

- Giai đoạn 1 (đang làm): bảng + snapshot + payout flow + báo cáo cơ bản.  
- Giai đoạn 2 (sau): ví ký quỹ Provider — auto trừ ví khi complete.  
- Giai đoạn 3 (option): escrow đầy đủ / payout API.
