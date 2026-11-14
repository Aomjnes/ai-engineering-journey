// Phần dùng chung cho các script trợ lý: đọc cấu hình, đọc/ghi Firestore, gửi Telegram, gọi Ollama.
// Chỉ dùng thư viện có sẵn của Node (từ bản 18 trở lên), không cần "npm install".
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const GOC = path.resolve(__dirname, '..'); // thư mục dự án

/* ---------- Cấu hình ----------
   Trên máy: đọc tro-ly/cau-hinh.json (chép từ cau-hinh.mau.json).
   Trên GitHub Actions: đọc biến môi trường lấy từ Secrets. */
function docCauHinh() {
  let f = {};
  const p = path.join(__dirname, 'cau-hinh.json');
  if (fs.existsSync(p)) f = JSON.parse(fs.readFileSync(p, 'utf8'));
  const env = process.env;
  let sa = null;
  if (env.FIREBASE_SERVICE_ACCOUNT) sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  else if (f.serviceAccountFile) {
    const sp = path.resolve(GOC, f.serviceAccountFile);
    if (fs.existsSync(sp)) sa = JSON.parse(fs.readFileSync(sp, 'utf8'));
  }
  return {
    sa,
    uid: env.FIREBASE_UID || f.uid || '',
    telegramToken: env.TELEGRAM_TOKEN || f.telegramToken || '',
    telegramChatId: String(env.TELEGRAM_CHAT_ID || f.telegramChatId || ''),
    ollamaUrl: (env.OLLAMA_URL || f.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, ''),
    ollamaModel: env.OLLAMA_MODEL || f.ollamaModel || 'qwen3:8b',
    thuMucBaiTap: path.resolve(GOC, f.thuMucBaiTap || '.'),
  };
}

/* ---------- Lộ trình: lấy thẳng từ index.html để chỉ có một nguồn ---------- */
function docLoTrinh() {
  const html = fs.readFileSync(path.join(GOC, 'index.html'), 'utf8');
  const a = html.indexOf('/* ---------- Curriculum ---------- */');
  const b = html.indexOf('/* ---------- State ---------- */');
  if (a < 0 || b < 0) throw new Error('Không tìm thấy phần Curriculum trong index.html');
  return vm.runInNewContext(html.slice(a, b) + '\n;({P, W, TASKS})', {});
}

/* ---------- Tính tiến độ (giống index.html) ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = s => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
const homNay = () => iso(new Date());
const THU = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

function tienDo(state, lt) {
  state = state || {};
  const done = state.done || {}, log = Array.isArray(state.log) ? state.log : [];
  const start = state.start || homNay();
  const next = lt.TASKS.find(t => !done[t.id]) || null;
  const soXong = lt.TASKS.filter(t => done[t.id]).length;
  let lichLe = 0; const d = parse(start), end = parse(homNay());
  for (let i = 0; i < 500 && d < end; i++) { if (d.getDay() !== 0) lichLe++; d.setDate(d.getDate() + 1); }
  lichLe = Math.min(lichLe, lt.TASKS.length);
  const ngay = new Set(Object.values(done)); log.forEach(e => ngay.add(e.date));
  const c = new Date(); if (!ngay.has(iso(c))) c.setDate(c.getDate() - 1);
  let chuoi = 0;
  for (let i = 0; i < 800; i++) { const k = iso(c); if (ngay.has(k)) chuoi++; else if (c.getDay() !== 0) break; c.setDate(c.getDate() - 1); }
  const xongHomNay = lt.TASKS.filter(t => done[t.id] === homNay());
  const logHomNay = log.filter(e => e.date === homNay());
  return { next, soXong, tong: lt.TASKS.length, lichLe, chenh: soXong - lichLe, chuoi, xongHomNay, logHomNay, log, done, start };
}

function moTaTienDo(state, lt) {
  const t = tienDo(state, lt), L = [];
  L.push('Hôm nay: ' + homNay() + ' (' + THU[new Date().getDay()] + '). Ngày bắt đầu học: ' + t.start + '.');
  L.push('Đã xong ' + t.soXong + '/' + t.tong + ' buổi; theo lịch lẽ ra ' + t.lichLe + ' buổi. Chuỗi ngày học: ' + t.chuoi + ' ngày.');
  if (t.next) {
    const w = t.next.w;
    L.push('Buổi kế tiếp chưa xong: Tuần ' + w.n + ', Buổi ' + (t.next.i + 1) + ': ' + t.next.t + '.');
    L.push('Giai đoạn ' + w.p + ': ' + lt.P[w.p].name + '. Chủ đề tuần: ' + w.t + '. Việc nộp cuối tuần: ' + w.out + '.');
    L.push('Các buổi tuần này: ' + w.d.map((x, i) => (i + 1) + '. ' + x + (t.done['w' + w.n + 'd' + (i + 1)] ? ' (xong)' : '')).join(' | '));
    L.push('Tài liệu: ' + w.r.map(r => r[0] + ' ' + r[1]).join('; '));
  } else L.push('Đã hoàn thành toàn bộ lộ trình.');
  if (t.xongHomNay.length) L.push('Hôm nay đã đánh dấu xong: ' + t.xongHomNay.map(x => 'Tuần ' + x.w.n + ' Buổi ' + (x.i + 1)).join(', ') + '.');
  const lg = t.log.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  if (lg.length) L.push('Điểm 5 buổi gần nhất (khái niệm/code/gỡ lỗi/kỷ luật): ' + lg.map(e => e.date + ' tuần ' + e.week + ': ' + e.k + '/' + e.c + '/' + e.g + '/' + e.d + ', ' + e.min + ' phút' + (e.note ? ' (' + e.note + ')' : '')).join(' || '));
  return L.join('\n');
}

/* ---------- Quy tắc cho AI (giữ giống AI_RULES trong index.html) ---------- */
const AI_RULES = [
  'Bạn là trợ lý học tập cho một người Việt mới hoàn toàn về lập trình, đang theo lộ trình AI Engineering 52 tuần (6 buổi mỗi tuần, 2 đến 3 giờ mỗi buổi, Chủ nhật nghỉ).',
  'Luôn trả lời bằng tiếng Việt, câu ngắn, giải thích từ gốc, không giả định kiến thức có sẵn. Thuật ngữ tiếng Anh giữ nguyên và giải thích nghĩa.',
  'Giai đoạn 1 đến 4: chỉ giải thích, gợi ý từng bước và hỏi ngược để người học tự nghĩ. Không viết hộ bài tập, không đưa code hoàn chỉnh cho bài được giao. Được đưa ví dụ nhỏ minh hoạ khái niệm, khác đề bài.',
  'Với khoá CS50x: tôn trọng quy định trung thực học thuật, tuyệt đối không đưa lời giải hay code của problem set.',
  'Khi người học dán code: chỉ ra dòng có vấn đề và vì sao, để họ tự sửa.',
  'Nếu không chắc, nói thẳng là không chắc và chỉ chỗ tra cứu trong tài liệu của buổi học.',
  'Nếu người học nản hoặc bỏ buổi: động viên ngắn, nhắc học tiếp từ chỗ dừng, không học bù gấp đôi.',
  'Đây là tin nhắn văn bản thường: không dùng bảng, hạn chế ký hiệu markdown.',
].join('\n');

/* ---------- Firestore qua REST, đăng nhập bằng service account ---------- */
let token = null;
async function layToken(sa) {
  if (token && token.het > Date.now() + 60000) return token.val;
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + sig }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Không lấy được quyền Firestore: ' + JSON.stringify(j));
  token = { val: j.access_token, het: Date.now() + j.expires_in * 1000 };
  return token.val;
}
// Firestore lưu mỗi giá trị kèm kiểu ({stringValue: "..."}); hai hàm sau đổi qua lại với JSON thường.
function tuFs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(tuFs);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = tuFs(x); return o; }
  return null;
}
function sangFs(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'string') return { stringValue: x };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isSafeInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(sangFs) } };
  const fields = {}; for (const [k, v] of Object.entries(x)) fields[k] = sangFs(v);
  return { mapValue: { fields } };
}
function urlDoc(cfg, ten) {
  return 'https://firestore.googleapis.com/v1/projects/' + cfg.sa.project_id + '/databases/(default)/documents/users/' + encodeURIComponent(cfg.uid) + '/tracker/' + ten;
}
function canFirestore(cfg) {
  if (!cfg.sa) throw new Error('Thiếu service account Firebase (HUONG-DAN.md, bước 4).');
  if (!cfg.uid) throw new Error('Thiếu uid (HUONG-DAN.md, bước 4).');
}
async function docDoc(cfg, ten) {
  canFirestore(cfg);
  const r = await fetch(urlDoc(cfg, ten), { headers: { Authorization: 'Bearer ' + await layToken(cfg.sa) } });
  if (r.status === 404) return null;
  const j = await r.json();
  if (!r.ok) throw new Error('Đọc Firestore lỗi: ' + JSON.stringify(j.error || j));
  return tuFs({ mapValue: { fields: j.fields || {} } });
}
async function ghiDoc(cfg, ten, data) {
  canFirestore(cfg);
  const r = await fetch(urlDoc(cfg, ten), {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await layToken(cfg.sa), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: sangFs(data).mapValue.fields }),
  });
  if (!r.ok) throw new Error('Ghi Firestore lỗi: ' + await r.text());
}
// Thêm một nhận xét vào document "ai"; trang web hiện 3 nhận xét mới nhất.
async function themNhanXet(cfg, kind, text) {
  const cu = (await docDoc(cfg, 'ai')) || {};
  const items = [{ at: Date.now(), kind, text: String(text).slice(0, 3000) }, ...(Array.isArray(cu.items) ? cu.items : [])].slice(0, 20);
  await ghiDoc(cfg, 'ai', { items });
}

/* ---------- Telegram ---------- */
async function telegram(cfg, method, params) {
  const r = await fetch('https://api.telegram.org/bot' + cfg.telegramToken + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}),
  });
  const j = await r.json();
  if (!j.ok) throw new Error('Telegram ' + method + ' lỗi: ' + (j.description || r.status));
  return j.result;
}
async function guiTin(cfg, text, chatId) {
  if (!cfg.telegramToken || !(chatId || cfg.telegramChatId)) { console.log('(Chưa cấu hình Telegram, chỉ in ra)\n' + text); return; }
  const s = String(text);
  for (let i = 0; i < s.length; i += 4000) await telegram(cfg, 'sendMessage', { chat_id: chatId || cfg.telegramChatId, text: s.slice(i, i + 4000) });
}

/* ---------- Ollama ---------- */
async function ollama(cfg, messages, { format, temperature } = {}) {
  const body = { model: cfg.ollamaModel, messages, stream: false, keep_alive: '15m', options: { temperature: temperature ?? 0.5, num_ctx: 8192 } };
  if (format) body.format = format;
  if (/^(qwen3|deepseek-r1|magistral)/i.test(cfg.ollamaModel)) body.think = false;
  let r;
  try { r = await fetch(cfg.ollamaUrl + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (e) { throw new Error('Không kết nối được Ollama ở ' + cfg.ollamaUrl + '. Ứng dụng Ollama đã mở chưa?'); }
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('Ollama báo lỗi: ' + (j.error || r.status));
  return (j.message && j.message.content || '').trim();
}

/* ---------- Chấm báo cáo (giống nút "Chấm bằng AI trên máy" trên web) ---------- */
const DIEM = { type: 'integer', minimum: 1, maximum: 5 };
const GRADE_SCHEMA = {
  type: 'object',
  properties: { khai_niem: DIEM, code: DIEM, go_loi: DIEM, ky_luat: DIEM, ly_do: { type: 'string' }, sua_hieu_sai: { type: 'string' }, cau_hoi: { type: 'array', items: { type: 'string' } }, viec_ngay_mai: { type: 'string' }, so_phut: { type: 'integer' } },
  required: ['khai_niem', 'code', 'go_loi', 'ky_luat', 'ly_do', 'sua_hieu_sai', 'cau_hoi', 'viec_ngay_mai', 'so_phut'],
};
const GRADE_RULES = [
  'NHIỆM VỤ: chấm báo cáo ngày, trả về JSON. Bốn tiêu chí, thang 1 đến 5 (1 gần như chưa có, 3 đạt tối thiểu, 5 rất tốt):',
  '- khai_niem: phần tự giải thích có đúng và bằng lời của chính người học không.',
  '- code: đã làm ra sản phẩm hay code cụ thể chưa, chất lượng ra sao.',
  '- go_loi: có nêu chỗ kẹt và đã tự thử cách gỡ nào chưa.',
  '- ky_luat: số phút thực tế so với 120 phút, điền đủ 5 mục. Luật cứng: dưới 90 phút hoặc không ghi số phút thì tối đa 3; từ 90 đến 119 phút tối đa 4; chỉ từ 120 phút mới được 5.',
  'Báo cáo sơ sài hoặc còn để trống thì không cho điểm cao.',
  'ly_do: 2 đến 4 câu giải thích vì sao cho từng điểm. sua_hieu_sai: sửa chỗ hiểu sai nếu có, không có thì ghi "Không thấy chỗ hiểu sai".',
  'cau_hoi: đúng 3 câu hỏi kiểm tra nhanh về nội dung hôm nay. viec_ngay_mai: buổi kế tiếp sau buổi trong báo cáo, theo lộ trình, vừa sức 2 giờ.',
  'so_phut: số phút người học ghi; không ghi thì 0.',
].join('\n');
// Tìm số phút ở mục 5 của báo cáo ("5. Thời gian học thực tế: 95 phút"); không thấy thì 0.
function phutTuBaoCao(t) {
  const m = String(t).match(/^\s*5\.[^\n]*?(\d{1,3})\s*(phút|ph\b|p\b|min)/im);
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n <= 600 ? n : 0;
}
async function chamBaoCao(cfg, baoCao, ngucanh) {
  const raw = await ollama(cfg, [
    { role: 'system', content: AI_RULES + '\n\n' + GRADE_RULES + '\n\nTÌNH HÌNH HỌC HIỆN TẠI:\n' + ngucanh },
    { role: 'user', content: baoCao },
  ], { format: GRADE_SCHEMA, temperature: 0.2 });
  const g = JSON.parse(raw);
  const cl = n => Math.max(1, Math.min(5, Math.round(Number(n) || 3)));
  // Số phút lấy thẳng từ báo cáo (model nhỏ hay đọc sai), rồi áp luật cứng cho điểm kỷ luật.
  const phut = phutTuBaoCao(baoCao) || Math.max(0, Math.min(600, Math.round(Number(g.so_phut) || 0)));
  const cap = phut >= 120 ? 5 : phut >= 90 ? 4 : 3;
  let d = cl(g.ky_luat), ly_do = String(g.ly_do || '');
  if (d > cap) { d = cap; ly_do += ' (Kỷ luật tối đa ' + cap + ' vì ' + (phut ? 'học ' + phut + ' phút, dưới 120 phút' : 'chưa ghi số phút') + '.)'; }
  return { k: cl(g.khai_niem), c: cl(g.code), g: cl(g.go_loi), d, phut, ly_do, sua: String(g.sua_hieu_sai || ''), cau_hoi: (Array.isArray(g.cau_hoi) ? g.cau_hoi : []).slice(0, 3).map(String), mai: String(g.viec_ngay_mai || '') };
}

module.exports = { GOC, docCauHinh, docLoTrinh, tienDo, moTaTienDo, homNay, iso, parse, THU, AI_RULES, docDoc, ghiDoc, themNhanXet, telegram, guiTin, ollama, chamBaoCao };
