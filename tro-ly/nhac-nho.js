// Nhắc học qua Telegram. Không cần AI nên chạy được trên GitHub Actions, kể cả khi máy tính tắt.
// node tro-ly/nhac-nho.js sang | toi | tuan | tu-dong   (tu-dong: chọn theo giờ Việt Nam)
'use strict';
const C = require('./chung');

function cheDo(arg) {
  if (['sang', 'toi', 'tuan'].includes(arg)) return arg;
  const d = new Date();
  if (d.getDay() === 0) return 'tuan';
  return d.getHours() < 12 ? 'sang' : 'toi';
}

function soVoiLich(td) {
  if (C.parse(C.homNay()) < C.parse(td.start) && td.soXong === 0) return 'Lịch bắt đầu ngày ' + td.start + '.';
  if (td.chenh > 0) return 'Bạn đang nhanh ' + td.chenh + ' buổi so với lịch.';
  if (td.chenh < 0) return 'Bạn đang chậm ' + (-td.chenh) + ' buổi. Cứ học tiếp từ chỗ dừng, không cần học bù gấp đôi.';
  return 'Bạn đang đúng lịch.';
}

function tinSang(td) {
  if (!td.next) return 'Bạn đã xong cả 52 tuần. Hôm nay hãy làm đẹp portfolio nhé.';
  const w = td.next.w;
  return [
    'Chào buổi sáng. Hôm nay (' + C.THU[new Date().getDay()] + '):',
    'Tuần ' + w.n + ' · Buổi ' + (td.next.i + 1) + '/6: ' + td.next.t,
    'Chủ đề tuần: ' + w.t,
    'Tài liệu: ' + w.r.map(r => r[0] + ' ' + r[1]).join(' · '),
    '',
    soVoiLich(td) + ' Chuỗi ngày học: ' + td.chuoi + ' ngày.',
    'Học xong nhớ điền báo cáo 5 mục trên trang và bấm chấm điểm.',
  ].join('\n');
}

function tinToi(td) {
  if (td.xongHomNay.length || td.logHomNay.length) {
    const L = ['Hôm nay bạn đã học. Chuỗi ngày học: ' + td.chuoi + ' ngày.'];
    if (td.xongHomNay.length) L.push('Đã xong: ' + td.xongHomNay.map(t => 'Tuần ' + t.w.n + ' Buổi ' + (t.i + 1)).join(', ') + '.');
    if (!td.logHomNay.length) L.push('Còn thiếu báo cáo và điểm hôm nay: điền 5 mục, bấm "Chấm bằng AI trên máy" (hoặc gửi Claude), rồi ghi điểm.');
    else L.push('Đã ghi điểm hôm nay. Nghỉ ngơi tốt nhé.');
    if (td.next) L.push('Ngày mai: Tuần ' + td.next.w.n + ' Buổi ' + (td.next.i + 1) + ': ' + td.next.t);
    return L.join('\n');
  }
  if (!td.next) return 'Bạn đã xong toàn bộ lộ trình.';
  return [
    'Hôm nay bạn chưa đánh dấu buổi học nào.',
    'Nếu còn sức, chỉ cần 25 phút: mở tài liệu và làm phần đầu của ' + td.next.t,
    'Nếu hôm nay không học được, không sao: mai học tiếp từ chỗ dừng.',
    soVoiLich(td),
  ].join('\n');
}

function tinTuan(td) {
  const tu = new Date(); tu.setDate(tu.getDate() - 6);
  const moc = C.iso(tu);
  const xong = Object.values(td.done).filter(d => d >= moc).length;
  const log = td.log.filter(e => e.date >= moc);
  const phut = log.reduce((a, e) => a + (Number(e.min) || 0), 0);
  const L = ['Tổng kết tuần (' + moc + ' đến ' + C.homNay() + '):', 'Buổi đã xong: ' + xong + '/6. Thời gian đã ghi: ' + (phut / 60).toFixed(1) + ' giờ.'];
  if (log.length) {
    const tb = k => log.reduce((a, e) => a + (Number(e[k]) || 0), 0) / log.length;
    const k = tb('k'), c = tb('c'), g = tb('g'), d = tb('d'), all = (k + c + g + d) / 4;
    L.push('Điểm trung bình: khái niệm ' + k.toFixed(1) + ', code ' + c.toFixed(1) + ', gỡ lỗi ' + g.toFixed(1) + ', kỷ luật ' + d.toFixed(1) + ' (chung ' + all.toFixed(1) + ').');
    L.push(all < 3 ? 'Trung bình dưới 3: theo quy tắc, tuần sau học lại tuần này. Không sao, hiểu chắc quan trọng hơn đi nhanh.' : 'Đạt. Tuần sau đi tiếp.');
  } else L.push('Tuần này chưa có điểm nào được ghi.');
  L.push('Hôm nay Chủ nhật: nghỉ ngơi. Nếu muốn, làm bài kiểm tra cuối tuần 10 câu với Claude hoặc trợ lý AI trên máy.');
  if (td.next) L.push('Thứ hai bắt đầu: Tuần ' + td.next.w.n + ' Buổi ' + (td.next.i + 1) + ': ' + td.next.t);
  return L.join('\n');
}

(async () => {
  const cfg = C.docCauHinh(), lt = C.docLoTrinh();
  if (!cfg.telegramToken || !cfg.telegramChatId) console.log('Cảnh báo: chưa có TELEGRAM_TOKEN hoặc TELEGRAM_CHAT_ID, tin nhắn chỉ được in ra.');
  const state = await C.docDoc(cfg, 'state');
  const td = C.tienDo(state, lt), mode = cheDo(process.argv[2]);
  const text = mode === 'sang' ? tinSang(td) : mode === 'tuan' ? tinTuan(td) : tinToi(td);
  await C.guiTin(cfg, text);
  console.log('Đã gửi lời nhắc "' + mode + '".');
})().catch(e => { console.error('Lỗi: ' + e.message); process.exit(1); });
