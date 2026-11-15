// Bot Telegram chạy trên máy tính: bạn nhắn từ điện thoại, AI trên máy (Ollama) trả lời.
// Chạy: node tro-ly/bot.js   (để cửa sổ mở; đóng cửa sổ là bot dừng)
'use strict';
const C = require('./chung');

const cfg = C.docCauHinh();
if (!cfg.telegramToken) { console.error('Thiếu telegramToken trong tro-ly/cau-hinh.json (HUONG-DAN.md, bước 5).'); process.exit(1); }
const coFirestore = !!(cfg.sa && cfg.uid);
const lt = C.docLoTrinh();

let lichSu = [];        // 12 tin gần nhất để AI nhớ mạch trò chuyện
let choLuu = null;      // kết quả chấm đang chờ /luu
let vuaDanhDau = null;  // id buổi vừa đánh dấu, để /hoantac

const HELP = [
  'Các lệnh:',
  '/homnay  việc hôm nay',
  '/tiendo  tiến độ so với lịch',
  '/xong  đánh dấu buổi kế tiếp đã xong (trang web cập nhật ngay)',
  '/hoantac  bỏ đánh dấu vừa rồi',
  '/kiemtra  AI xem code bạn sửa hôm nay và nhận xét',
  '/luu  ghi điểm vừa chấm vào nhật ký',
  '/moi  bắt đầu cuộc trò chuyện mới',
  '',
  'Dán báo cáo 5 mục (bắt đầu bằng "BÁO CÁO NGÀY") để AI chấm. Nhắn bất kỳ câu hỏi nào khác để hỏi bài.',
].join('\n');

async function docState() { return coFirestore ? await C.docDoc(cfg, 'state') : null; }
async function ghiState(s) { s.updatedAt = Date.now(); await C.ghiDoc(cfg, 'state', s); }

async function xuLy(text) {
  const lenh = text.trim().split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');
  if (lenh === '/start' || lenh === '/help') return 'Chào bạn, mình là trợ lý học AI Engineering chạy trên máy tính của bạn.\n\n' + HELP;
  if (lenh === '/moi') { lichSu = []; return 'Đã bắt đầu cuộc trò chuyện mới.'; }

  const state = await docState();
  const td = C.tienDo(state, lt);

  if (lenh === '/homnay') {
    if (!td.next) return 'Bạn đã xong toàn bộ lộ trình.';
    const w = td.next.w;
    return 'Tuần ' + w.n + ' · Buổi ' + (td.next.i + 1) + '/6: ' + td.next.t + '\nChủ đề tuần: ' + w.t + '\nTài liệu: ' + w.r.map(r => r[0] + ' ' + r[1]).join(' · ') + '\nViệc nộp cuối tuần: ' + w.out;
  }
  if (lenh === '/tiendo') {
    return 'Đã xong ' + td.soXong + '/' + td.tong + ' buổi (' + Math.round(td.soXong / td.tong * 100) + '%). Theo lịch lẽ ra ' + td.lichLe + ' buổi: ' +
      (td.chenh > 0 ? 'nhanh ' + td.chenh : td.chenh < 0 ? 'chậm ' + (-td.chenh) : 'đúng lịch') + '. Chuỗi ngày học: ' + td.chuoi + ' ngày.';
  }
  if (lenh === '/xong' || lenh === '/hoantac' || lenh === '/luu') {
    if (!coFirestore) return 'Chưa nối Firebase nên bot không sửa được tiến độ (HUONG-DAN.md, bước 4).';
    const s = state || { v: 1, start: C.homNay(), done: {}, log: [], updatedAt: 0 };
    s.done = s.done || {}; s.log = Array.isArray(s.log) ? s.log : [];
    if (lenh === '/xong') {
      if (!td.next) return 'Không còn buổi nào chưa xong.';
      s.done[td.next.id] = C.homNay(); await ghiState(s); vuaDanhDau = td.next.id;
      const sau = lt.TASKS.find(t => !s.done[t.id]);
      return 'Đã đánh dấu xong Tuần ' + td.next.w.n + ' Buổi ' + (td.next.i + 1) + '.' + (sau ? '\nBuổi kế tiếp: ' + sau.t : '') + '\nNhớ dán báo cáo để chấm điểm.';
    }
    if (lenh === '/hoantac') {
      if (!vuaDanhDau || !s.done[vuaDanhDau]) return 'Không có gì để hoàn tác.';
      delete s.done[vuaDanhDau]; await ghiState(s); const id = vuaDanhDau; vuaDanhDau = null;
      return 'Đã bỏ đánh dấu ' + id + '.';
    }
    if (!choLuu) return 'Chưa có kết quả chấm nào đang chờ. Dán báo cáo trước.';
    s.log.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: C.homNay(), week: td.next ? td.next.w.n : 52, min: choLuu.phut || 120, k: choLuu.k, c: choLuu.c, g: choLuu.g, d: choLuu.d, note: ('AI trên máy: ' + choLuu.ly_do).slice(0, 300) });
    await ghiState(s); choLuu = null;
    return 'Đã ghi điểm vào nhật ký. Trang web đã cập nhật.';
  }
  if (lenh === '/kiemtra') {
    const { execFile } = require('child_process');
    return await new Promise(res => execFile(process.execPath, [require('path').join(__dirname, 'kiem-tra.js'), '--thu'], { timeout: 300000, maxBuffer: 1 << 20 }, (err, out, errOut) => {
      if (err) return res('Kiểm tra lỗi: ' + (errOut || err.message).slice(0, 500));
      const i = out.indexOf('Nhận xét của trợ lý AI');
      res(i >= 0 ? out.slice(i).trim() : out.trim());
    }));
  }

  const ngucanh = C.moTaTienDo(state, lt);
  if (/^\s*BÁO CÁO NGÀY/i.test(text)) {
    const g = await C.chamBaoCao(cfg, text, ngucanh);
    choLuu = g;
    const tra = 'Điểm: khái niệm ' + g.k + ', code ' + g.c + ', gỡ lỗi ' + g.g + ', kỷ luật ' + g.d + '.\n\n' + g.ly_do +
      '\n\nSửa chỗ hiểu sai: ' + g.sua + '\n\n3 câu kiểm tra nhanh (trả lời ngay ở đây):\n' + g.cau_hoi.map((q, i) => (i + 1) + '. ' + q).join('\n') +
      '\n\nViệc ngày mai: ' + g.mai + '\n\nGõ /luu để ghi điểm này lên trang theo dõi.';
    lichSu.push({ role: 'user', content: text }, { role: 'assistant', content: tra });
    return tra;
  }
  lichSu.push({ role: 'user', content: text });
  const tra = await C.ollama(cfg, [{ role: 'system', content: C.AI_RULES + '\n\nTÌNH HÌNH HỌC HIỆN TẠI:\n' + ngucanh }, ...lichSu.slice(-12)]);
  lichSu.push({ role: 'assistant', content: tra });
  lichSu = lichSu.slice(-12);
  return tra;
}

(async () => {
  console.log('Bot đang chạy với model ' + cfg.ollamaModel + (coFirestore ? ', có nối Firebase.' : ', chưa nối Firebase.') + ' Đóng cửa sổ này để dừng.');
  let offset = 0, nghi = 1000;
  for (;;) {
    let ups;
    try { ups = await C.telegram(cfg, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }); nghi = 1000; }
    catch (e) { console.error(new Date().toLocaleTimeString() + ' Mất kết nối Telegram: ' + e.message); await new Promise(r => setTimeout(r, nghi)); nghi = Math.min(nghi * 2, 60000); continue; }
    for (const u of ups) {
      offset = u.update_id + 1;
      const m = u.message; if (!m || typeof m.text !== 'string') continue;
      const chat = String(m.chat.id);
      if (!cfg.telegramChatId) {
        // Người đầu tiên nhắn bot được ghi nhận là chủ bot; từ đó bot chỉ trả lời người này.
        const p = require('path').join(__dirname, 'cau-hinh.json'), fs = require('fs');
        if (fs.existsSync(p)) {
          const f = JSON.parse(fs.readFileSync(p, 'utf8')); f.telegramChatId = chat;
          fs.writeFileSync(p, JSON.stringify(f, null, 2) + '\n');
        }
        cfg.telegramChatId = chat;
        console.log('Đã lưu Chat ID ' + chat + ' vào tro-ly/cau-hinh.json. Từ giờ bot chỉ trả lời chat này.');
        await C.guiTin(cfg, 'Đã nhận bạn là chủ bot (Chat ID ' + chat + '). Từ giờ mình chỉ trả lời bạn.\n\n' + HELP, chat).catch(() => {});
        continue;
      }
      if (chat !== cfg.telegramChatId) { console.log('Bỏ qua tin từ người lạ (chat ' + chat + ').'); continue; }
      console.log(new Date().toLocaleTimeString() + ' < ' + m.text.slice(0, 80));
      C.telegram(cfg, 'sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
      let tra;
      try { tra = await xuLy(m.text); } catch (e) { tra = 'Lỗi: ' + e.message; }
      await C.guiTin(cfg, tra, chat).catch(e => console.error('Gửi lỗi: ' + e.message));
    }
  }
})();
