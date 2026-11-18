// Nhắc học qua Telegram. Không cần AI nên chạy được trên GitHub Actions, kể cả khi máy tính tắt.
// node tro-ly/nhac-nho.js sang | trua | chieu | toi | khuya | tuan | tu-dong
// Giọng: biến môi trường GIONG=gat (mặc định, xấu tính, thẳng) hoặc GIONG=hien (nhẹ nhàng).
// Giọng gắt chê hành vi trì hoãn và lời bào chữa, không chửi bới vô cớ, không bảo người học bỏ cuộc:
// mục tiêu là xấu hổ để ngồi vào bàn, không phải để nản.
'use strict';
const C = require('./chung');

const GIONG = (process.env.GIONG || 'gat').trim();
const CAC_CHE_DO = ['sang', 'trua', 'chieu', 'toi', 'khuya', 'tuan'];

function cheDo(arg) {
  if (CAC_CHE_DO.includes(arg)) return arg;
  const d = new Date(), h = d.getHours();
  if (d.getDay() === 0) return 'tuan';
  return h < 10 ? 'sang' : h < 15 ? 'trua' : h < 19 ? 'chieu' : h < 22 ? 'toi' : 'khuya';
}

const chon = a => a[Math.floor(Math.random() * a.length)];
const buoi = t => 'Tuần ' + t.w.n + ' Buổi ' + (t.i + 1) + ': ' + t.t;

// Số ngày học (thứ hai đến thứ bảy) đã trôi qua kể từ lần cuối có học.
function ngayBo(td) {
  const ngay = new Set(Object.values(td.done)); td.log.forEach(e => ngay.add(e.date));
  const cuoi = [...ngay].sort().pop();
  const tu = C.parse(cuoi || td.start), den = C.parse(C.homNay());
  if (!cuoi) tu.setDate(tu.getDate() - 1);
  let n = 0; const d = new Date(tu); d.setDate(d.getDate() + 1);
  for (let i = 0; i < 400 && d < den; i++) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); }
  return n;
}

function chuaBatDau(td) { return C.parse(C.homNay()) < C.parse(td.start) && td.soXong === 0; }
function daHocHomNay(td) { return td.xongHomNay.length > 0 || td.logHomNay.length > 0; }

/* ---------- Giọng gắt ---------- */
function soLich(td) {
  if (chuaBatDau(td)) return 'Lịch bắt đầu ngày ' + td.start + '. Đến lúc đó đừng có kiếm cớ.';
  if (td.chenh > 0) return 'Đang nhanh ' + td.chenh + ' buổi. Đừng vội vênh mặt, nhanh 1 tuần mà bỏ 2 tuần thì vẫn là con số 0.';
  if (td.chenh === 0) return 'Đang đúng lịch. Đúng lịch là mức tối thiểu, không phải thành tích.';
  const n = -td.chenh;
  if (n <= 2) return 'Chậm ' + n + ' buổi. Mới bắt đầu tụt thôi, nhưng ai bỏ cuộc cũng bắt đầu y như vậy.';
  if (n <= 6) return 'Chậm ' + n + ' buổi, tức là ' + (n >= 6 ? 'trọn một tuần' : 'nửa tuần') + ' học vứt đi. Người khác đang đi tiếp, còn bạn thì đứng xem.';
  return 'Chậm ' + n + ' buổi. Với tốc độ này, 52 tuần thành 2 năm, và "AI Engineer" chỉ là dòng chữ đẹp trong bio.';
}

function cauBo(n) {
  if (n <= 0) return '';
  if (n === 1) return 'Hôm qua bỏ học. Một ngày thì ai cũng có lý do. Hai ngày thì đó là thói quen.';
  if (n <= 3) return 'Đã ' + n + ' ngày không đụng vào bài. Nói muốn đổi đời mà mở máy ra chỉ để lướt điện thoại.';
  if (n <= 6) return n + ' ngày không học. Đây đúng là kiểu người đăng ký khoá học rồi để đó cho có. Bạn đang đúng kiểu đó đấy.';
  return n + ' ngày không học. Lộ trình 52 tuần này không phải đồ trang trí. Hoặc ngồi vào bàn, hoặc thôi tự lừa mình.';
}

const MO_SANG = [
  'Dậy chưa? Hôm nay không có ai học hộ bạn đâu.',
  'Sáng rồi. Hôm qua hứa gì với bản thân thì hôm nay trả.',
  'Một ngày mới, cơ hội mới để không trì hoãn. Thử một lần xem sao.',
  'Lời hứa "mai học" của hôm qua đến hạn rồi đấy.',
];
const TRUA = [
  'Nửa ngày trôi qua rồi, số buổi đã xong vẫn là 0. Định để tối "học bù" rồi lại ngủ quên như mọi khi à?',
  'Trưa rồi mà chưa mở bài. Lướt điện thoại thì có thời gian, học thì không.',
  'Giờ nghỉ trưa của người chăm là 25 phút đọc tài liệu. Còn của bạn là gì?',
];
const CHIEU = [
  'Chiều rồi, hôm nay vẫn trắng. Lý do lần này là gì: mệt, bận, hay "chưa có hứng"?',
  'Còn vài tiếng nữa là hết ngày. Đến tối mà vẫn chưa học thì đừng tự gọi mình là người đang học AI.',
  'Ngày hôm nay sắp thành thêm một ngày "để mai". Bạn đã có quá nhiều ngày như vậy rồi.',
];
const TOI_CHUA = [
  'Hôm nay bạn chưa học buổi nào. Không một buổi nào.',
  'Cả ngày trôi qua và bảng tiến độ vẫn y nguyên. Bạn tự nhìn có thấy ngại không?',
  'Lại một ngày trắng. Đây là lúc biết xấu hổ một chút đấy.',
];
const KHUYA = [
  'Gần nửa đêm rồi mà vẫn trắng. Mai thức dậy nhớ rằng hôm nay bạn đã chọn trì hoãn.',
  'Ngày hôm nay coi như mất. Không học bù gấp đôi, nhưng mai mà còn trắng nữa thì nghiêm túc xem lại bản thân đi.',
  'Đi ngủ với con số 0. Lần sau ai hỏi "học tới đâu rồi", trả lời thật cho họ nghe.',
];

function gatSang(td) {
  if (!td.next) return 'Xong cả 52 tuần rồi. Giờ đi làm portfolio đi, đừng ngồi tự hào mãi.';
  if (chuaBatDau(td)) return 'Lịch học bắt đầu ngày ' + td.start + '. Chuẩn bị máy cho xong đi, đừng để ngày đầu đã kiếm cớ.';
  const w = td.next.w;
  return [
    chon(MO_SANG), cauBo(ngayBo(td)),
    '',
    'Việc hôm nay (' + C.THU[new Date().getDay()] + '): ' + buoi(td.next),
    'Tài liệu: ' + w.r.map(r => r[0] + ' ' + r[1]).join(' · '),
    '',
    soLich(td) + ' Chuỗi ngày học: ' + td.chuoi + ' ngày.',
    'Học xong thì điền báo cáo 5 mục và chấm điểm. Không ghi lại thì coi như chưa học.',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

function gatGiuaNgay(td, kho) {
  if (!td.next || chuaBatDau(td) || daHocHomNay(td)) return null; // đã học thì im
  return [chon(kho), cauBo(ngayBo(td)), 'Việc đang chờ: ' + buoi(td.next), 'Chỉ cần 25 phút để bắt đầu. Mở tài liệu ngay bây giờ, không phải "lát nữa".']
    .filter(Boolean).join('\n');
}

function gatToi(td) {
  if (!td.next) return 'Đã xong toàn bộ lộ trình.';
  if (chuaBatDau(td)) return null;
  if (daHocHomNay(td)) {
    const L = ['Hôm nay có học. Được, nhưng đừng đòi khen vì làm đúng việc của mình. Chuỗi: ' + td.chuoi + ' ngày.'];
    if (!td.logHomNay.length) L.push('Còn thiếu báo cáo và điểm. Học mà không ghi lại thì mai quên sạch. Điền 5 mục và chấm ngay.');
    else {
      const e = td.logHomNay[td.logHomNay.length - 1];
      if (Number(e.min) < 90) L.push('Mới ' + e.min + ' phút. Lộ trình cần 120 phút một ngày. Đây là học hay là điểm danh?');
      else L.push('Đã ghi điểm. Mai giữ đúng nhịp này, đừng để hôm nay thành ngày "ăn may".');
    }
    L.push('Ngày mai: ' + buoi(td.next));
    return L.join('\n');
  }
  return [chon(TOI_CHUA), cauBo(ngayBo(td)), 'Vẫn còn kịp 25 phút cho phần đầu của ' + buoi(td.next) + '. Làm ngay, hoặc chấp nhận hôm nay là ngày bỏ.', soLich(td)]
    .filter(Boolean).join('\n');
}

function gatKhuya(td) {
  if (!td.next || chuaBatDau(td)) return null;
  if (daHocHomNay(td)) {
    if (td.logHomNay.length) return null;
    return 'Học rồi mà vẫn chưa ghi điểm. Lười đến mức ghi 5 dòng báo cáo cũng không làm à? Ghi đi rồi ngủ.';
  }
  return [chon(KHUYA), soLich(td)].join('\n');
}

function gatTuan(td) {
  if (chuaBatDau(td)) return 'Tuần sau bắt đầu học (' + td.start + '). Tối nay chuẩn bị máy, tài khoản GitHub cho xong. Ngày đầu mà còn loay hoay cài đặt thì đừng đổ tại ai.';
  const tu = new Date(); tu.setDate(tu.getDate() - 6);
  const moc = C.iso(tu);
  const xong = Object.values(td.done).filter(d => d >= moc).length;
  const log = td.log.filter(e => e.date >= moc);
  const phut = log.reduce((a, e) => a + (Number(e.min) || 0), 0);
  const L = ['Tổng kết tuần (' + moc + ' đến ' + C.homNay() + '): ' + xong + '/6 buổi, ' + (phut / 60).toFixed(1) + ' giờ đã ghi.'];
  if (xong === 0) L.push('Không một buổi nào trong cả tuần. Bạn không "đang học AI", bạn đang nghĩ về việc học AI. Hai việc đó khác nhau.');
  else if (xong < 4) L.push(xong + '/6. Chưa tới một tuần đúng nghĩa, chẳng có gì đáng tự hào. Tuần sau mà vẫn vậy thì lộ trình chỉ là giấy.');
  else if (xong < 6) L.push(xong + '/6. Gần đủ, nhưng "gần" không đưa bạn tới đích.');
  else L.push('6/6. Đúng việc phải làm. Tuần sau làm lại y như vậy, không được tụt.');
  if (phut && phut < 600) L.push('Tổng ' + (phut / 60).toFixed(1) + ' giờ trong khi cần khoảng 12 giờ một tuần. Phần còn lại đi đâu?');
  if (log.length) {
    const tb = k => log.reduce((a, e) => a + (Number(e[k]) || 0), 0) / log.length;
    const k = tb('k'), c = tb('c'), g = tb('g'), d = tb('d'), all = (k + c + g + d) / 4;
    L.push('Điểm trung bình: khái niệm ' + k.toFixed(1) + ', code ' + c.toFixed(1) + ', gỡ lỗi ' + g.toFixed(1) + ', kỷ luật ' + d.toFixed(1) + ' (chung ' + all.toFixed(1) + ').');
    L.push(all < 3 ? 'Dưới 3. Theo luật, tuần sau học lại tuần này. Tự chuốc lấy, giờ tự trả.' : 'Đạt. Tuần sau đi tiếp, đừng tự mãn.');
  } else if (xong) L.push('Học mà không ghi điểm buổi nào. Không đo thì không biết mình tệ ở đâu.');
  L.push(soLich(td));
  L.push('Hôm nay Chủ nhật: nghỉ. Nghỉ thật, đừng biến nó thành cớ nghỉ luôn thứ hai.');
  if (td.next) L.push('Thứ hai: ' + buoi(td.next));
  return L.join('\n');
}

/* ---------- Giọng hiền (như trước) ---------- */
function hienLich(td) {
  if (chuaBatDau(td)) return 'Lịch bắt đầu ngày ' + td.start + '.';
  if (td.chenh > 0) return 'Bạn đang nhanh ' + td.chenh + ' buổi so với lịch.';
  if (td.chenh < 0) return 'Bạn đang chậm ' + (-td.chenh) + ' buổi. Cứ học tiếp từ chỗ dừng, không cần học bù gấp đôi.';
  return 'Bạn đang đúng lịch.';
}
function hien(mode, td) {
  if (!td.next) return 'Bạn đã xong cả 52 tuần.';
  if (mode === 'sang') return 'Chào buổi sáng. Hôm nay: ' + buoi(td.next) + '\n' + hienLich(td) + ' Chuỗi: ' + td.chuoi + ' ngày.';
  if (mode === 'trua' || mode === 'chieu' || mode === 'khuya') return daHocHomNay(td) || chuaBatDau(td) ? null : 'Nhắc nhẹ: hôm nay chưa học. Chỉ cần 25 phút cho ' + buoi(td.next) + '.';
  if (mode === 'toi') return daHocHomNay(td) ? 'Hôm nay bạn đã học. Nhớ ghi điểm nhé.' : 'Hôm nay bạn chưa học. Nếu còn sức, 25 phút thôi. ' + hienLich(td);
  return 'Tổng kết tuần: ' + hienLich(td) + ' Chuỗi: ' + td.chuoi + ' ngày.';
}

function soanTin(mode, td) {
  if (GIONG === 'hien') return hien(mode, td);
  if (mode === 'sang') return gatSang(td);
  if (mode === 'trua') return gatGiuaNgay(td, TRUA);
  if (mode === 'chieu') return gatGiuaNgay(td, CHIEU);
  if (mode === 'toi') return gatToi(td);
  if (mode === 'khuya') return gatKhuya(td);
  return gatTuan(td);
}

module.exports = { soanTin, ngayBo };

if (require.main === module) (async () => {
  const cfg = C.docCauHinh(), lt = C.docLoTrinh();
  if (!cfg.telegramToken || !cfg.telegramChatId) console.log('Cảnh báo: chưa có TELEGRAM_TOKEN hoặc TELEGRAM_CHAT_ID, tin nhắn chỉ được in ra.');
  const state = await C.docDoc(cfg, 'state');
  const td = C.tienDo(state, lt), mode = cheDo(process.argv[2]);
  const text = soanTin(mode, td);
  if (!text) { console.log('Không cần nhắc lúc "' + mode + '" (đã học hoặc chưa tới ngày bắt đầu).'); return; }
  await C.guiTin(cfg, text);
  console.log('Đã gửi lời nhắc "' + mode + '" (giọng ' + GIONG + ').');
})().catch(e => { console.error('Lỗi: ' + e.message); process.exit(1); });
