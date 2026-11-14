// AI trên máy kiểm tra thành quả trong ngày: đọc tiến độ, nhật ký và code bạn vừa sửa,
// rồi viết nhận xét lên trang web (mục "Trợ lý AI") và gửi qua Telegram.
// Chạy tay:            node tro-ly/kiem-tra.js
// Chỉ in, không gửi:   node tro-ly/kiem-tra.js --thu
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./chung');

const THU = process.argv.includes('--thu');
const DUOI = new Set(['.c', '.h', '.py', '.js', '.ts', '.html', '.css', '.sql', '.md', '.ipynb', '.txt', '.json', '.sh', '.yml', '.yaml', '.toml', '.java', '.go', '.rs']);
const BO_QUA_THU_MUC = new Set(['.git', 'node_modules', 'tro-ly', '.github', '.venv', 'venv', '__pycache__', '.claude']);
const BO_QUA_FILE = new Set(['index.html', 'README.md', 'CLAUDE.md', 'HUONG-DAN.md', 'nhat-ky.md', 'package-lock.json']);

// Tìm file bài tập được sửa trong khoảng `gio` giờ qua.
function fileMoiSua(goc, gio) {
  const moc = Date.now() - gio * 3600 * 1000, out = [];
  (function di(dir, sau) {
    if (sau > 6) return;
    let ds; try { ds = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const d of ds) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { if (!BO_QUA_THU_MUC.has(d.name) && !d.name.startsWith('.')) di(p, sau + 1); continue; }
      if (!DUOI.has(path.extname(d.name).toLowerCase()) || BO_QUA_FILE.has(d.name) || d.name.startsWith('cau-hinh')) continue;
      const st = fs.statSync(p);
      if (st.mtimeMs >= moc && st.size < 200000) out.push({ p, rel: path.relative(goc, p), t: st.mtimeMs, size: st.size });
    }
  })(goc, 0);
  return out.sort((a, b) => b.t - a.t);
}

function cuoiNhatKy() {
  const p = path.join(C.GOC, 'nhat-ky.md');
  if (!fs.existsSync(p)) return '';
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  return lines.slice(0, 8).concat(['...'], lines.filter(l => l.startsWith('| 20')).slice(-5)).join('\n');
}

(async () => {
  const cfg = C.docCauHinh(), lt = C.docLoTrinh();
  let state = null;
  try { state = await C.docDoc(cfg, 'state'); } catch (e) { console.log('Không đọc được tiến độ trên Firestore (' + e.message + '). Chỉ dựa vào file trên máy.'); }
  const td = C.tienDo(state, lt);

  const files = fileMoiSua(cfg.thuMucBaiTap, 26);
  let ma = '', con = 14000;
  for (const f of files.slice(0, 6)) {
    let s = fs.readFileSync(f.p, 'utf8');
    if (f.p.endsWith('.ipynb')) { try { s = JSON.parse(s).cells.map(c => [].concat(c.source).join('')).join('\n\n# ---\n'); } catch (e) { } }
    s = s.slice(0, Math.min(4000, con)); con -= s.length;
    ma += '\n\n=== ' + f.rel + ' ===\n' + s.split('\n').map((l, i) => String(i + 1).padStart(3) + '| ' + l).join('\n');
    if (con <= 0) break;
  }

  const coHoc = td.xongHomNay.length || td.logHomNay.length || files.length;
  const yeuCau = coHoc
    ? 'Viết nhận xét cuối ngày, tối đa 180 từ, gồm 4 phần ngắn có đánh số:\n1. Hôm nay đã làm được gì (dựa trên dữ liệu, không bịa).\n2. Một lỗi hoặc một điểm nên viết tốt hơn trong code bên dưới: chỉ rõ file và số dòng, giải thích vì sao, KHÔNG viết lời giải. Không có code thì nhận xét phần báo cáo.\n3. Một câu hỏi kiểm tra nhanh để tự ôn.\n4. Nhắc buổi kế tiếp và một việc nhỏ đầu tiên nên làm.'
    : 'Hôm nay người học chưa học (chưa đánh dấu buổi nào, chưa sửa file nào). Viết lời nhắc tối đa 80 từ: thân thiện, không trách móc, gợi ý bắt đầu buổi kế tiếp chỉ với 25 phút đầu tiên và nói cụ thể việc nhỏ đầu tiên. Nếu hôm nay là Chủ nhật thì chỉ chúc nghỉ ngơi và nhắc buổi đầu tuần.';

  const msgs = [
    { role: 'system', content: C.AI_RULES + '\n\nTÌNH HÌNH HỌC HIỆN TẠI:\n' + C.moTaTienDo(state, lt) + '\n\nNHẬT KÝ CHẤM ĐIỂM (nhat-ky.md):\n' + cuoiNhatKy() },
    { role: 'user', content: yeuCau + (ma ? '\n\nCODE ĐÃ SỬA TRONG 24 GIỜ QUA:' + ma : '') },
  ];
  console.log('Đang hỏi ' + cfg.ollamaModel + ' (' + files.length + ' file mới sửa)...');
  const text = await C.ollama(cfg, msgs);
  const tin = 'Nhận xét của trợ lý AI · ' + C.homNay() + (files.length ? '\nFile đã xem: ' + files.slice(0, 6).map(f => f.rel).join(', ') : '') + '\n\n' + text;
  console.log('\n' + tin + '\n');
  if (THU) return;
  if (cfg.sa && cfg.uid) { await C.themNhanXet(cfg, 'kiem-tra', tin); console.log('Đã ghi lên trang web.'); }
  await C.guiTin(cfg, tin);
})().catch(e => { console.error('Lỗi: ' + e.message); process.exit(1); });
