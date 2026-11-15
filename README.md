# Sổ theo dõi học AI Engineering

Trang web một file để theo dõi lộ trình học AI Engineering 52 tuần: 312 buổi học, mỗi buổi một ô đánh dấu, kèm tài liệu miễn phí, việc nộp hằng tuần, cổng qua giai đoạn và nhật ký chấm điểm.

## Chạy

Mở `index.html` bằng trình duyệt. Không cần cài gì.

Muốn chạy qua máy chủ cục bộ:

```bash
python3 -m http.server 8000
```

rồi mở http://localhost:8000.

## Dữ liệu lưu ở đâu

- Khi mở file trên máy: tiến độ lưu trong `localStorage` của trình duyệt đó (khoá `ai-eng-tracker-v1`). Đổi trình duyệt hoặc xoá dữ liệu trình duyệt thì mất.
- Bản đã xuất bản trên claude.ai (https://claude.ai/artifact/SLMEqrXQ9c9UP4fbCMggC9) lưu thêm lên cơ sở dữ liệu của trang, document `tracker/state`, nên đồng bộ giữa các thiết bị. Hai bản không tự đồng bộ với nhau.

- Bản trên GitHub Pages có `FIREBASE_CONFIG` trong `index.html`: đăng nhập Google, lưu ở Firestore `users/{uid}/tracker/state`, đồng bộ tức thì và vẫn chạy khi mất mạng. Nhận xét của AI nằm ở `users/{uid}/tracker/ai`.

## Giao diện

Một file `index.html`, 6 màn hình theo hash route: `#/hom-nay` (mặc định), `#/tro-ly`, `#/lo-trinh`, `#/nhat-ky`, `#/nhanh`, `#/cai-dat`. Kiểu khung: thanh bên và thanh trên trên nền xanh-xám, nội dung trên một tấm trắng. Phông Be Vietnam Pro (giao diện) và JetBrains Mono (con số), bản cục bộ và giấy phép nằm ở `assets/fonts/`.

Thêm `?mau=1` vào địa chỉ để xem giao diện với dữ liệu mẫu (khối "Dữ liệu mẫu" trong `index.html`). Chế độ này không ghi gì vào trình duyệt hay Firebase.

## Trợ lý AI và nhắc học

Cài theo `HUONG-DAN.md`. Tóm tắt:

- Khung "Trợ lý AI" trên trang gọi Ollama ở `http://localhost:11434` (mặc định model `qwen3:8b`).
- `tro-ly/bot.js`: bot Telegram chạy trên máy, trả lời bằng Ollama, đánh dấu buổi học, chấm báo cáo.
- `tro-ly/kiem-tra.js`: AI đọc code mới sửa và tiến độ, ghi nhận xét lên trang và Telegram (21:45 mỗi tối).
- `tro-ly/nhac-nho.js` + `.github/workflows/nhac-nho.yml`: nhắc học qua Telegram trên GitHub Actions.
- Cấu hình bí mật nằm trong `tro-ly/cau-hinh.json` và `tro-ly/service-account.json`, đã có trong `.gitignore`.
- `du-lieu/cham-diem.jsonl`: các lần Claude chấm, dùng để tự fine-tune sau này.

## Cấu trúc

Tất cả nằm trong `index.html`:

- `P`: 7 giai đoạn và cổng qua giai đoạn.
- `W`: 52 tuần; mỗi tuần có chủ đề `t`, tài liệu `r`, việc nộp `out`, 6 buổi `d`.
- `B`: 3 nhánh mở rộng (Data, Web, Software Engineering).
- `L`: danh mục link tài liệu dùng chung.
- `state`: `{start, done, log, updatedAt}`. `done` ánh xạ id việc sang ngày hoàn thành: `w{tuần}d{buổi}`, `g{giai đoạn}`, `b-{nhánh}-{i}`.

Sửa nội dung lộ trình thì sửa `W`. Không đổi id của việc đã có, nếu không các ô đã đánh dấu sẽ mất liên kết.
