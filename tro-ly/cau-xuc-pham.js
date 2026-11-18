// Kho câu cho giọng GIONG=xucpham (người học tự yêu cầu): xưng "mày", chửi thẳng vào tính lười,
// thói hứa suông, sự hèn trước việc khó. Kho nào không có ở đây thì dùng kho của cau-nhac.js.
// Giới hạn giữ nguyên: không đụng ngoại hình, gia đình, sức khoẻ, không bảo bỏ cuộc hay tự hại.
// Mọi tin vẫn kết bằng một việc cụ thể để làm ngay.
'use strict';

const SANG = [
  'Dậy đi, đồ lười. Ước mơ của mày không tự chạy được bằng chế độ ngủ đông đâu.',
  'Chào buổi sáng, chuyên gia hứa suông. Hôm nay định nói dối bản thân câu gì?',
  'Mày tự nhận là đang học AI. Cả cái bảng tiến độ đang cười vào mặt mày đấy.',
  'Lại một ngày mới để mày chứng minh mày chỉ giỏi nói. Hoặc lần này làm thử xem nào.',
  'Mày không thiếu thông minh. Mày thiếu xương sống. Hôm nay mọc tạm một cái đi.',
  'Dậy chưa, ông hoàng trì hoãn? Ngai vàng đó chẳng ai thèm tranh với mày đâu.',
  'Người ta 40 tuổi còn đi học lại. Mày có cả đống thời gian mà để nó mốc meo.',
  'Mày nói muốn đổi đời. Đổi đời mà dậy ra việc đầu tiên là lướt điện thoại thì đổi kiểu gì?',
  'Sáng rồi. Đứa nghiêm túc thì đang mở tài liệu. Còn mày, đoán xem mày thuộc loại nào?',
  'Thêm một buổi sáng. Thêm một cơ hội để mày khỏi phải xấu hổ tối nay. Đừng phí nó nữa.',
  'Mày là bằng chứng sống rằng mua khoá học không làm ai giỏi lên cả.',
  'Báo thức kêu rồi. Nó có kỷ luật hơn mày đấy, và nó chỉ là cái điện thoại.',
];

const TRUA = [
  'Nửa ngày rồi mà mày vẫn chưa động vào bài. Lười đến mức này thì nên ghi vào CV làm kỹ năng.',
  'Trưa rồi. Điện thoại mày chắc mòn màn hình rồi, còn tài liệu thì vẫn mới tinh.',
  'Mày tính để tối "học bù" à? Đứa nói câu đó tối nào cũng ngủ quên, và đứa đó là mày.',
  'Giờ này người khác đã viết được vài chục dòng code. Mày viết được vài chục cái lý do.',
  'Mày đang ăn bám chính thời gian của mày đấy. Nó không nuôi mày mãi được đâu.',
  'Nửa ngày trắng tay. Nếu lười là một môn thể thao, mày đã có huy chương vàng.',
  'Mày sợ bài khó à? Sợ thì cứ nói thẳng, đừng đội lốt "bận".',
  'Trưa rồi mà vẫn số 0. Mày có biết mày đang tự lừa mình trơ trẽn thế nào không?',
];

const CHIEU = [
  'Chiều rồi, vẫn chưa học. Mày định để hôm nay thành thêm một ngày vứt đi đúng không? Giỏi.',
  'Lý do hôm nay là gì? Mệt? Mày mệt vì cái gì khi mày chưa làm gì cả?',
  'Mày là kiểu người nói "tao sẽ học AI" trong bữa nhậu và không bao giờ mở laptop. Chứng minh sai đi.',
  'Mặt trời sắp lặn rồi. Cái ý chí của mày thì lặn từ sáng.',
  'Hèn thật. Có một buổi học thôi mà mày né cả ngày như né nợ.',
  'Mày có biết vì sao người ta không tin lời mày hứa không? Vì chính mày còn không tin.',
  'Chiều rồi. Đứa đi làm 9 tiếng tối về vẫn học 2 tiếng. Mày thua cả đứa mệt hơn mày.',
  'Còn vài tiếng. Ngồi xuống, hoặc thừa nhận mày chỉ thích cảm giác "đang học AI" chứ không thích học.',
];

const TOI_CHUA = [
  'Cả ngày không học một buổi nào. Đồ ăn hại thời gian.',
  'Lại một ngày trắng. Mày có xấu hổ không, hay da mặt mày dày quá rồi?',
  'Hôm nay mày làm được đúng một việc: làm mình thất vọng. Làm rất xuất sắc.',
  'Mày là đứa đăng ký lộ trình 52 tuần rồi để nó nằm đó như cái máy chạy bộ phơi quần áo.',
  'Mày không thiếu thời gian. Mày thiếu liêm sỉ với chính lời hứa của mày.',
  'Người ta trả tiền cho kết quả. Với cái đà này mày chỉ đáng được trả bằng lời an ủi.',
  'Ngày hôm nay tóm lại: mày nói nhiều hơn mày làm. Như mọi ngày.',
  'Một ngày nữa trôi qua và mày vẫn là đứa "sắp bắt đầu". Mày định "sắp" đến bao giờ?',
  'Lười, hứa suông, rồi tự thấy mình đáng thương. Combo quen thuộc của mày đấy.',
  'Mày nhìn bảng tiến độ đi. Nó trống y như cái mức cố gắng của mày hôm nay.',
];

const KHUYA = [
  'Hết ngày rồi, đồ lười. 0 buổi. Đi ngủ với cái số 0 đó đi, ôm nó cho chặt.',
  'Mày lại thua chính mày thêm một ngày. Đối thủ yếu thế mà cũng không thắng nổi.',
  'Ngủ đi. Mai dậy nhớ rằng hôm nay mày đã chọn làm kẻ hứa suông.',
  'Một ngày bỏ đi. Mày phung phí thời gian như thể mày sống được 300 năm.',
  'Đi ngủ đi, đồ "mai học". Mai bot lại gọi, và mai mà còn thế này thì mày tự biết mày là ai.',
  'Hôm nay mày đã hoàn thành xuất sắc vai trò: kẻ đứng xem cuộc đời mình trôi qua.',
  'Muộn rồi, đừng cố học nữa. Nhưng nhớ cảm giác nhục này, mai dùng nó làm nhiên liệu.',
];

const CHUA_GHI = [
  'Học rồi mà lười ghi 5 dòng báo cáo. Mày lười đến cả việc khoe mình chăm.',
  'Không ghi điểm thì coi như chưa học. Đừng mong bot tin lời mày nói miệng.',
  '5 phút ghi báo cáo mà cũng trốn. Thứ gì mày cũng làm một nửa à?',
];

const HOC_IT = [
  '{phut} phút. Mày gọi cái đó là học à? Đi vệ sinh còn lâu hơn.',
  '{phut} phút rồi nghỉ. Mày học kiểu chấm công, còn não thì vẫn ở nhà.',
  '{phut} phút mà dám ghi điểm. Mặt dày thật đấy. Mai 120 phút, không mặc cả.',
  'Chỉ {phut} phút. Cố gắng kiểu này thì đến năm 2030 mày vẫn ở Tuần 3.',
];

const DA_HOC_TOI = [
  'Hôm nay mày có học. Đừng mong được khen, chó còn biết đi đúng giờ ăn.',
  'Có học. Lạ đấy. Bot suýt không nhận ra mày.',
  'Hôm nay mày làm đúng việc của mày. Cái mức tối thiểu đó mà mày còn phải cố, nghĩ mà buồn.',
];

const HOC_DU = [
  'Đủ giờ, có ghi điểm. Mai làm lại y vậy, đừng có sinh tật.',
  'Tạm được. Một ngày tử tế không xoá được cả tuần lười của mày đâu.',
  'Đạt. Giữ được 7 ngày liền thì bot mới bắt đầu tin mày.',
];

const BO_1 = [
  'Hôm qua mày bỏ học. Một lần thì gọi là lỡ. Hai lần là bản chất.',
  'Hôm qua trắng. Hôm nay mà trắng nữa thì đừng tự lừa là "chỉ hơi mệt".',
];
const BO_2_3 = [
  '{n} ngày không học. Kiến thức mày học được đang bỏ mày mà đi, giống như nó nên làm thế.',
  '{n} ngày liền mày không đụng vào bài. Lười có hệ thống luôn, đáng nể.',
  '{n} ngày. Mày bảo mày đang học AI à? Mày đang học cách bỏ dở thì đúng hơn.',
];
const BO_4_6 = [
  '{n} ngày không học. Đồ bỏ dở. Đây đúng là thứ mày giỏi nhất: bắt đầu rồi bỏ.',
  '{n} ngày. Repo GitHub của mày bám bụi như mấy lời hứa đầu năm.',
  '{n} ngày trắng. Mày có định thừa nhận mày bỏ rồi không, hay vẫn diễn tiếp?',
];
const BO_NHIEU = [
  '{n} ngày. Đây không còn là lười nữa, đây là hèn: bỏ mà không dám nói ra. Nếu chưa bỏ thì mở buổi kế tiếp ngay hôm nay.',
  '{n} ngày không học. Đứa mày của {n} ngày trước đã tin mày. Mày phản bội nó đấy. Làm lại từ hôm nay.',
  '{n} ngày. Mày đã biến lộ trình thành đồ trang trí. Gỡ nó xuống hoặc học, đừng đứng giữa.',
];

const CHAM_IT = [
  'Chậm {n} buổi. Bắt đầu tụt rồi đấy, đúng phong cách của mày.',
  'Chậm {n} buổi. Nhỏ thôi, nhưng với mày thì nhỏ thường thành to rất nhanh.',
];
const CHAM_VUA = [
  'Chậm {n} buổi, {tuan} học vứt sọt rác. Thứ rác đó do chính tay mày đổ.',
  'Chậm {n} buổi. Người khác đang chạy, mày đang bò, mà còn bò lùi.',
];
const CHAM_NHIEU = [
  'Chậm {n} buổi. Với cái tốc độ rùa bò này, mày học xong thì AI đã thay luôn mày.',
  'Chậm {n} buổi. "AI Engineer" trong miệng mày giờ chỉ còn là câu nói đùa.',
  'Chậm {n} buổi. Lộ trình 52 tuần thành 2 năm. Mày có xấu hổ không?',
];

const KET = [
  'Bỏ điện thoại xuống. Mở tài liệu. Ngay bây giờ, đồ lười.',
  'Đặt hẹn giờ 25 phút và ngồi đó. Không làm nổi 25 phút thì đừng mơ làm nổi 52 tuần.',
  'Không cần trả lời bot. Bot không cần lý do của mày. Bot cần mày ngồi xuống.',
  'Đóng hết mạng xã hội. Không ai trên đó học hộ mày đâu.',
  'Đứng dậy, ra bàn, mở máy. Ba việc. Đứa trẻ con cũng làm được.',
];

const TUAN_0 = [
  '0/6 buổi cả tuần. Mày không phải "người đang học AI". Mày là người nói về việc học AI. Rẻ rúng thế đấy.',
  'Cả tuần không học buổi nào. Nếu lười được trả lương, tuần này mày giàu to.',
  '0/6. Mày đã dành trọn một tuần để chứng minh mày không nghiêm túc. Chứng minh thành công.',
];
const TUAN_IT = [
  '{x}/6. Học cho có, học như trả bài. Kiểu học này ra đời chỉ đủ để đi phỏng vấn rồi trượt.',
  '{x}/6. Một nửa cũng không tới. Mày làm gì cũng nửa vời thế à?',
];
const TUAN_GAN = [
  '{x}/6. Suýt đủ. "Suýt" là chữ của kẻ thua cuộc hay dùng.',
  '{x}/6. Thiếu chút xíu, như mọi lần. Mày thiếu chút xíu cả đời đấy.',
];
const TUAN_DU = [
  '6/6. Lần này mày không làm bot xấu hổ thay. Tuần sau giữ y vậy, đừng có lên mặt.',
  '6/6. Được. Giờ chứng minh đây không phải ăn may đi.',
];
const CN = [
  'Chủ nhật nghỉ. Mày nghỉ giỏi rồi, khỏi cần ai dạy. Thứ hai mà trốn thì đừng trách bot.',
  'Nghỉ đi. Tối nay mở sẵn tài liệu thứ hai, để sáng mai mày hết đường viện cớ.',
];

module.exports = { SANG, TRUA, CHIEU, TOI_CHUA, KHUYA, CHUA_GHI, HOC_IT, HOC_DU, DA_HOC_TOI, BO_1, BO_2_3, BO_4_6, BO_NHIEU, CHAM_IT, CHAM_VUA, CHAM_NHIEU, KET, TUAN_0, TUAN_IT, TUAN_GAN, TUAN_DU, CN };
