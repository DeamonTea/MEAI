# Báo cáo rà soát bảo mật MEAI

Ngày: 2026-11-12

## Phát hiện trước khi sửa

- Gemini, Groq và Cerebras keys nằm trong hồ sơ Windows của tài khoản đang chạy ứng dụng, ở các tệp ai-keys.enc và tệp Gemini cũ gemini.enc; được mã hóa bằng Electron safeStorage. Giá trị thô không được trả về từ IPC state và ô giao diện không tự điền lại. Tuy nhiên, bất kỳ tài khoản MEAI nào đăng nhập cũng truy cập được màn hình cài đặt và các lệnh IPC đổi/thử key.
- Supabase URL và secret/service_role key nằm ở supabase.enc, cũng được safeStorage mã hóa. UI chỉ trả URL và trạng thái đã cấu hình, không trả key. Đây vẫn là một khóa quản trị dùng chung trên máy.
- RLS đã bật trên các bảng cũ nhưng policy còn thiếu cho phần lớn bảng. Policy hiện có chỉ bao phủ Unit và báo lỗi nội dung.
- Tài khoản mới không có cờ buộc đổi mật khẩu; chưa có audit log đầy đủ.
- Quét mã nguồn/cấu hình được theo dõi không phát hiện giá trị khớp mẫu API key hoặc service_role. File đóng gói hiện được cấu hình loại trừ .env, thư mục credentials/secrets và phần mở rộng file khóa phổ biến.

## Đã sửa

1. Khóa màn hình và IPC lưu/thử API key cho Admin; state thường không trả số lượng key. Giao diện không render lại nội dung key.
2. Thêm migration RLS cho users, books, units, unit_items, learning_history, reminders, vocabulary_reviews, ai_usage, content_reports và admin_audit_logs. User được giới hạn dữ liệu riêng; curriculum dùng chung để đọc, Admin ghi; Admin xem tiến trình toàn bộ. Cột password_hash không được cấp quyền đọc cho Supabase Auth clients.
3. Tạo thủ công và nhập Excel đặt must_change_password=true. Lần đăng nhập đầu chỉ cho đổi mật khẩu; các IPC khác bị khóa đến khi đổi xong. Mật khẩu mới yêu cầu ít nhất 10 ký tự. Tài khoản seed admin1/admin123 được đánh dấu buộc đổi nếu hash vẫn khớp mật khẩu mặc định.
4. Thêm bộ lọc file nhạy cảm vào lệnh đóng gói Windows.
5. Thêm admin_audit_logs, log tạo tài khoản, nhập Excel (chỉ lưu số lượng), thay provider keys (chỉ lưu tên provider/số lượng key), duyệt Unit; trigger ghi đổi quyền. Admin có thể xem 200 sự kiện mới nhất. Giá trị khóa và mật khẩu không ghi vào log.

## Giới hạn còn lại / việc cần làm sau

- Ứng dụng vẫn dùng đăng nhập riêng và gửi secret/service_role key từ desktop. Service role bỏ qua RLS, do đó policy SQL chỉ bảo vệ client dùng Supabase Auth; kiểm tra quyền trong Electron không phải ranh giới an toàn trước người kiểm soát máy. Cần chuyển xác thực sang Supabase Auth và thao tác quản trị/AI sang backend hoặc Edge Function trước khi phân phối cho người dùng không tin cậy.
- Trigger đổi quyền ghi auth.uid(); với thay đổi đi qua service_role hoặc SQL Editor giá trị actor có thể rỗng. Cần actor identity đáng tin cậy từ backend khi chuyển kiến trúc.
- Mật khẩu hiện vẫn dùng SHA-256 không salt. Nâng cấp sang Argon2id/bcrypt cần migration hash và xử lý tương thích đăng nhập.
- Tài khoản hiện có (ngoài mật khẩu seed mặc định) không bị buộc đổi tự động. User tạo mới sau migration mới bị buộc đổi.
- Mã hóa safeStorage bảo vệ file lưu khi ứng dụng chạy dưới Windows account khác; người có quyền đăng nhập cùng Windows account vẫn có thể dùng ứng dụng với quyền đó. Tất cả MEAI users trên cùng máy có thể tiêu thụ API qua tính năng AI, dù không xem được key.
- Migration cần được chạy trên Supabase thật. Chưa kiểm chứng RLS qua Supabase Auth/JWT hoặc chạy ứng dụng với project live trong lượt rà soát này.
