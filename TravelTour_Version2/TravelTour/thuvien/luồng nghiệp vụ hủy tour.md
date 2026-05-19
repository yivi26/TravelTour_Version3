┌──────────┐                                          
│ HDV gặp │                                          
│ sự cố   │                                          
└────┬─────┘                                          
     │  1. Mở "Tour đang dẫn" → bấm "Báo bận khẩn cấp"
     │     • Form: lý do (≥10 ký tự) + ảnh xác minh
     │     • POST /api/guide/absences
     ▼
┌──────────────────────────┐                          
│ guide_absence_requests  │                          
│ status = 'pending'      │                          
│ urgency =                │                          
│  ≤48h:urgent             │                          
│  ≤7d :medium             │                          
│  > 7d:low                │                          
└─────────┬────────────────┘                          
          │  2. Hệ thống tự bắn:
          │     • Notification provider (badge chuông + danh sách)
          ▼
┌────────────────────────────────┐                    
│ Provider mở "Yêu cầu HDV xin   │                    
│ nghỉ" (sidebar)                │                    
│ • Filter: pending/approved/    │                    
│   rejected/all                 │                    
│ • Detail panel: lý do,         │                    
│   evidence, urgency, người gọi │                    
└─────┬──────────────────────────┘                    
      │                                               
      ▼                                               
┌────────────────────────────────────────────┐        
│ Provider chọn hướng xử lý                  │        
└─┬──────────────┬─────────────────┬─────────┘        
  │              │                 │                  
  ▼              ▼                 ▼                  
DUYỆT         TỪ CHỐI            HUỶ TOUR             
+ Chọn HDV   + Ghi chú           (không có HDV thay)
  thay thế   • Yêu cầu chuyển     • Huỷ mọi booking
• Hệ thống     status=rejected,     đang active
  call         tour vẫn giữ HDV   • Tour status=paused
  assignGuide  cũ                 • Notify khách:
  → validate                       "Tour bị huỷ"
  trùng lịch                      • Hoàn tiền theo
  + đủ ngày                         chính sách
  rảnh                                                  
                                                       
       ↓                                              
+ Cập nhật                                            
  tour.guide_id                                       
+ Notify HDV mới                                      
  (chuông HDV)                                        
+ Notify khách                                        
  tour này:                                           
  "Tour đổi HDV"                                      
+ Log lịch sử                                         
  (replaced)                                          


  Ràng buộc & nghiệp vụ đã có
1. HDV chỉ được tạo 1 yêu cầu pending / 1 tour (chặn spam).
2. Tour completed → không cho tạo yêu cầu.
3. HDV thay thế phải: cùng provider, không trùng lịch tour khác, đủ ngày rảnh — tái dùng assertGuideHasFullAvailabilityForTour và assertGuideTourScheduleNoConflict.
4. Cancel-tour chỉ áp dụng cho booking có status: pending / pending_payment / confirmed / paid / in_progress. Các booking đã cancelled / refunded / completed không bị tác động.
5. Audit: mỗi lần đổi HDV đều có 1 row tour_guide_history với previous_guide_id / guide_id / reason / by_user_id.
