# Hướng dẫn cài đặt: đồng bộ, trợ lý AI trên máy, nhắc học

Làm lần lượt từ bước 1. Mỗi bước dùng được ngay, chưa làm bước sau cũng không sao. Tổng thời gian khoảng 1 đến 2 giờ. Kẹt ở đâu thì chép nguyên thông báo lỗi gửi Claude hoặc hỏi trợ lý AI trên trang.

## Bức tranh tổng thể

```
 Điện thoại ──┐                        ┌── GitHub Pages: trang web (index.html)
 Máy tính  ───┼── mở trang web ────────┤
              │                        └── Firebase: lưu tiến độ, đồng bộ tức thì
              │
              └── Telegram ◄── GitHub Actions: nhắc học 7:30, 20:30, tổng kết Chủ nhật (máy tắt vẫn chạy)
                     ▲
                     └──── bot.js trên máy tính ◄──► Ollama (AI chạy bằng card RTX 3070)
                           kiem-tra.js 21:45 mỗi tối: AI đọc code bạn sửa hôm nay, nhận xét
```

- **Firebase** là một cơ sở dữ liệu trên mạng của Google, miễn phí ở mức bạn dùng. Trang web ghi tiến độ vào đó; thiết bị khác đang mở trang thấy thay đổi gần như ngay lập tức.
- **Ollama** là chương trình chạy mô hình AI ngay trên máy bạn. Không cần Internet, không cần Claude, không mất tiền.
- **GitHub Actions** là máy tính của GitHub chạy script theo lịch, miễn phí với repo công khai.

---

## Bước 1. Đưa trang web lên GitHub Pages

Bước này trùng với Tuần 1, Buổi 1 và 2 của lộ trình.

1. Tạo tài khoản ở https://github.com.
2. Mở terminal trong thư mục dự án và đăng nhập GitHub CLI:

   ```bash
   gh auth login
   ```

3. Tạo repo và đẩy code lên (thay `TEN-BAN` bằng tên bạn hoặc email bạn dùng cho GitHub):

   ```bash
   git init
   ```
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Trang theo dõi học AI Engineering"
   ```
   ```bash
   gh repo create ai-engineering-journey --public --source . --push
   ```

4. Trên GitHub, mở repo → **Settings** → **Pages** → mục *Branch* chọn `main` và `/ (root)` → **Save**. Sau khoảng 1 phút, trang có ở `https://TEN-BAN.github.io/ai-engineering-journey/`.

Trước khi `git add`, chạy `git status` và chắc chắn **không** thấy `cau-hinh.json` hay `service-account.json` trong danh sách. File `.gitignore` đã chặn sẵn hai file này.

## Bước 2. Bật đồng bộ bằng Firebase

1. Vào https://console.firebase.google.com, đăng nhập bằng Gmail, bấm **Create a project**, đặt tên ví dụ `ai-eng-tracker`. Có thể tắt Google Analytics.
2. **Tạo cơ sở dữ liệu:** menu trái → *Build* → **Firestore Database** → **Create database** → chọn vùng `asia-southeast1` (Singapore, gần Việt Nam) → chọn *production mode*.
3. **Rules (quy tắc bảo vệ):** trong Firestore mở tab **Rules**, xoá hết và dán đoạn sau rồi **Publish**. Nghĩa là: chỉ chính bạn, sau khi đăng nhập, mới đọc và ghi được dữ liệu của mình.

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

4. **Đăng nhập Google:** *Build* → **Authentication** → **Get started** → *Sign-in method* → **Google** → bật → **Save**. Sang tab **Settings** → **Authorized domains** → **Add domain** → nhập `TEN-BAN.github.io`.
5. **Lấy cấu hình web:** biểu tượng bánh răng → **Project settings** → kéo xuống *Your apps* → bấm biểu tượng `</>` → đặt tên → **Register app**. Firebase hiện một đoạn `const firebaseConfig = {...}`. Chép phần trong ngoặc nhọn.
6. Mở `index.html`, tìm dòng `const FIREBASE_CONFIG=null;` và thay bằng cấu hình vừa chép, ví dụ:

   ```js
   const FIREBASE_CONFIG={apiKey:"AIza...",authDomain:"ai-eng-tracker.firebaseapp.com",projectId:"ai-eng-tracker",storageBucket:"ai-eng-tracker.firebasestorage.app",messagingSenderId:"123",appId:"1:123:web:abc"};
   ```

   Các giá trị này không phải mật khẩu, để công khai trên GitHub được. Thứ bảo vệ dữ liệu là bước Rules ở trên.
7. Commit và push, đợi 1 phút, mở trang, bấm **Đăng nhập Google để đồng bộ** ở góc trên. Chấm xanh "Đã lưu, đồng bộ mọi thiết bị" là xong. Tiến độ đã có trên trình duyệt đó được tự đẩy lên.
8. Mở cùng địa chỉ trên điện thoại, đăng nhập cùng tài khoản Google. Đánh dấu một ô trên điện thoại và xem máy tính đổi theo.

## Bước 3. Cài trợ lý AI trên máy (Ollama)

1. Tải và cài Ollama từ https://ollama.com/download (bản Windows). Cài xong, Ollama chạy ngầm, có biểu tượng con lạc đà ở khay hệ thống.
2. Tải mô hình (khoảng 5 GB, một lần):

   ```bash
   ollama pull qwen3:8b
   ```

   Qwen3 8B nói tiếng Việt tốt và vừa với card RTX 3070 8 GB. Thử nhanh: `ollama run qwen3:8b "Biến trong lập trình là gì?"`.
3. Cho phép trang web gọi Ollama (thay `TEN-BAN`):

   ```bash
   setx OLLAMA_ORIGINS "https://TEN-BAN.github.io,http://localhost:8000"
   ```

   Rồi bấm chuột phải biểu tượng Ollama ở khay → **Quit**, và mở lại Ollama từ menu Start. Không có bước này, trình duyệt sẽ chặn trang gọi Ollama.
4. Mở trang, xuống mục **Trợ lý AI**. Dòng trạng thái báo "Đã kết nối · qwen3:8b" là xong. Lần đầu mở trang GitHub Pages, Chrome hỏi quyền "truy cập thiết bị trong mạng cục bộ" (Local network access): chọn **Cho phép**. Lỡ bấm Chặn thì bấm biểu tượng bên trái thanh địa chỉ → **Cài đặt trang web** → **Truy cập mạng cục bộ** → **Cho phép**, rồi tải lại trang.

Từ giờ bạn có thể hỏi bài ngay trên trang, và bấm **Chấm bằng AI trên máy** dưới ô báo cáo ngày. AI chấm 4 tiêu chí, hỏi 3 câu kiểm tra và điền sẵn điểm vào Nhật ký chấm điểm.

## Bước 4. Cho script trên máy đọc và ghi Firebase

Script `kiem-tra.js` và `bot.js` cần một "chìa khoá máy" (service account) để đọc tiến độ của bạn.

1. Firebase → bánh răng → **Project settings** → tab **Service accounts** → **Generate new private key** → lưu file vào `tro-ly/service-account.json` trong thư mục dự án.

   File này là chìa khoá toàn quyền vào cơ sở dữ liệu. Không gửi cho ai, không đưa lên GitHub, không dán vào chat.
2. Lấy UID của bạn: Firebase → **Authentication** → tab **Users** → chép cột *User UID* của dòng email bạn.
3. Chép file mẫu thành file cấu hình thật:

   ```bash
   copy tro-ly\cau-hinh.mau.json tro-ly\cau-hinh.json
   ```

   Mở `tro-ly/cau-hinh.json`, dán UID vào `"uid"`.
4. Thử AI kiểm tra (chỉ in ra màn hình, chưa gửi đi đâu):

   ```bash
   node tro-ly/kiem-tra.js --thu
   ```

## Bước 5. Bot Telegram: nhắc học và hỏi AI từ điện thoại

1. Cài Telegram trên điện thoại. Tìm **@BotFather**, gửi `/newbot`, đặt tên, ví dụ `Trợ lý học AI` và username kết thúc bằng `bot`. BotFather trả về một **token** dạng `123456:ABC...`. Token cũng là bí mật.
2. Dán token vào `"telegramToken"` trong `tro-ly/cau-hinh.json`.
3. Chạy bot:

   ```bash
   node tro-ly/bot.js
   ```

   Mở bot của bạn trên Telegram, gửi `/start`. Bot trả lời **Chat ID**. Dán số đó vào `"telegramChatId"`, tắt bot (Ctrl+C) rồi chạy lại. Bot chỉ trả lời đúng chat ID này, người lạ nhắn sẽ bị bỏ qua.
4. Cho bot tự chạy khi bật máy, và cho AI kiểm tra lúc 21:45 mỗi tối:

   ```bash
   powershell -ExecutionPolicy Bypass -File tro-ly\cai-dat-may.ps1
   ```

   Muốn gỡ: chạy lại lệnh trên, thêm `-Go` ở cuối.

Lệnh của bot: `/homnay`, `/tiendo`, `/xong` (đánh dấu buổi kế tiếp, trang web đổi ngay), `/hoantac`, `/kiemtra`, `/luu`, `/moi`. Dán báo cáo bắt đầu bằng "BÁO CÁO NGÀY" để AI chấm. Nhắn câu hỏi bất kỳ để hỏi bài.

## Bước 6. Nhắc học kể cả khi máy tắt (GitHub Actions)

Đưa bí mật lên GitHub dưới dạng **Secrets** (GitHub mã hoá, không ai xem được, kể cả trong log):

```bash
gh secret set FIREBASE_SERVICE_ACCOUNT --body-file tro-ly/service-account.json
```
```bash
gh secret set FIREBASE_UID
```
```bash
gh secret set TELEGRAM_TOKEN
```
```bash
gh secret set TELEGRAM_CHAT_ID
```

Ba lệnh sau sẽ hỏi giá trị: dán UID, token, chat ID tương ứng rồi Enter.

Chạy thử ngay:

```bash
gh workflow run nhac-nho.yml -f mode=sang
```

Telegram nhận tin "Chào buổi sáng..." là xong. Lịch tự chạy: 7:30 sáng và 20:30 tối thứ hai đến thứ bảy, 20:00 Chủ nhật tổng kết tuần. Muốn đổi giờ, sửa `.github/workflows/nhac-nho.yml` (giờ trong đó là giờ UTC, tức giờ Việt Nam trừ 7).

---

## Mỗi ngày dùng thế nào

1. 7:30 Telegram báo việc hôm nay.
2. Học. Kẹt thì hỏi trợ lý trên trang hoặc nhắn bot.
3. Học xong: bấm **Đánh dấu buổi này đã xong**, điền báo cáo 5 mục, bấm **Chấm bằng AI trên máy** (hoặc dán cho Claude nếu còn dùng Claude), trả lời 3 câu hỏi, bấm **Thêm buổi học**.
4. 20:30 Telegram nhắc nếu bạn chưa học hoặc chưa ghi điểm. 21:45 AI xem code bạn sửa hôm nay và gửi nhận xét, hiện cả trên trang.

AI chỉ đọc được code nằm trong thư mục dự án này. Khi làm bài CS50 trên cs50.dev, tải file về một thư mục con (ví dụ `cs50/week1/`) để AI xem được.

## Giới hạn cần biết

- **AI 8B yếu hơn Claude.** Nó giải thích khái niệm và bắt lỗi cơ bản tốt, nhưng có lúc sai hoặc chấm dễ dãi. Điều nó nói về code, hãy chạy thử để kiểm chứng. Cổng qua giai đoạn nên do Claude hoặc một người có kinh nghiệm chấm nếu được.
- **Trợ lý trên trang chỉ chạy trên máy tính có Ollama.** Trên điện thoại, hỏi AI qua bot Telegram; bot cần máy tính đang bật.
- **Lời nhắc của GitHub có thể trễ** vài phút đến một giờ khi GitHub đông. Repo không có commit nào trong 60 ngày thì GitHub tự tắt lịch; commit đều mỗi ngày là không bị.
- Bản cũ trên claude.ai vẫn đồng bộ theo cách cũ và không tự chuyển dữ liệu sang Firebase.

## Tự huấn luyện AI của bạn (Giai đoạn 4 đến 5)

Bây giờ dùng mô hình có sẵn là hợp lý: chưa có dữ liệu chấm bài thật thì huấn luyện không làm nó tốt hơn. Từ hôm nay, mỗi lần Claude chấm, báo cáo và lời chấm được lưu vào `du-lieu/cham-diem.jsonl` (xem `CLAUDE.md`). Đến Tuần 33 đến 36, khi học Hugging Face, bạn sẽ có vài trăm cặp ví dụ để:

1. Fine-tune LoRA một mô hình nhỏ (Qwen3 4B) trên RTX 3070 bằng Unsloth.
2. Chuyển sang định dạng GGUF, nạp vào Ollama bằng một `Modelfile`.
3. Viết bộ eval: so điểm mô hình của bạn chấm với điểm Claude đã chấm.
4. Đổi `ollamaModel` trong cấu hình và ô "Tên model" trên trang sang mô hình mới.

Đó cũng là một dự án portfolio thật cho Giai đoạn 5.
