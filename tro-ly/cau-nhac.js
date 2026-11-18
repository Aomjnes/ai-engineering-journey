// Kho câu cho giọng gắt của tro-ly/nhac-nho.js. Thêm câu mới thì cứ thêm vào mảng, không cần sửa chỗ khác.
// Quy ước: mỉa mai hành vi trì hoãn và lời bào chữa đến mức tối đa, nhưng không bảo người học bỏ cuộc,
// không xúc phạm ngoại hình, gia đình, sức khoẻ. Xấu hổ để ngồi vào bàn, không phải để buông.
'use strict';

// Câu mở đầu buổi sáng.
const SANG = [
  'Dậy chưa? Hôm nay cũng không có ai học hộ bạn đâu.',
  'Chào buổi sáng, chuyên gia trì hoãn. Hôm nay định phá kỷ lục nào?',
  'Lời hứa "mai học" của hôm qua đến hạn rồi. Trả nợ đi.',
  'Một ngày mới, một cơ hội mới để tiếp tục làm mình thất vọng. Hoặc không. Tuỳ bạn.',
  'Kế hoạch 52 tuần nghe hoành tráng lắm. Giờ thử làm cho đúng một ngày xem.',
  'Mở mắt ra là mở điện thoại. Thử hôm nay mở tài liệu trước xem trời có sập không.',
  'Ước mơ làm AI Engineer vẫn còn đó. Chỉ có người theo đuổi nó là hay vắng mặt.',
  'Hôm nay là ngày tốt để học. Hôm qua cũng thế. Hôm kia cũng thế. Bạn thấy vấn đề chưa?',
  'Chào buổi sáng. Thuật toán của bạn hôm nay: dậy, học, ghi điểm. Không có nhánh "để mai".',
  'Người ta học AI để máy làm thay con người. Bạn thì đang để thời gian làm thay bạn: trôi qua.',
  'Dậy đi. Mấy cái tutorial không tự chui vào đầu lúc bạn ngủ đâu.',
  'Bạn có 24 giờ. Chỉ cần 2 giờ trong đó. Toán lớp 1 thôi, chắc không khó bằng CS50 đâu.',
  'Sáng nay thử làm người giữ lời một lần xem cảm giác thế nào.',
  'Hôm nay không cần thiên tài. Chỉ cần một người chịu ngồi xuống. Đơn giản vậy mà khó với bạn nhỉ.',
  'Báo thức đã làm xong việc của nó. Đến lượt bạn.',
  'Mỗi sáng là một bản cập nhật mới. Đừng để bản hôm nay lại chỉ sửa lỗi chính tả của lời hứa hôm qua.',
];

// Giữa ngày, chưa học.
const TRUA = [
  'Nửa ngày rồi, tiến độ hôm nay vẫn là 0. Con số tròn đẹp, tiếc là không phải điểm cộng.',
  'Trưa rồi mà chưa mở bài. Lướt điện thoại thì có thời gian, học thì không. Thú vị thật.',
  'Bữa trưa ăn đủ chất chưa? Còn đầu óc thì hôm nay vẫn nhịn đói.',
  'Giờ nghỉ trưa của người chăm là 25 phút đọc tài liệu. Của bạn là 25 phút xem người khác thành công.',
  'Nửa ngày trôi qua êm đẹp. Êm vì chẳng có gì xảy ra cả.',
  'Bạn đang tối ưu một mô hình rất lạ: tối đa hoá lý do, tối thiểu hoá kết quả.',
  'Đến trưa vẫn chưa học. Chắc đang đợi cảm hứng. Cảm hứng gửi lời nhắn: nó không đến đâu.',
  'Code hôm nay bạn viết được bao nhiêu dòng? À, khỏi trả lời, bảng tiến độ trả lời rồi.',
  'Người khác đang debug. Bạn thì đang debug lý do tại sao chưa bắt đầu.',
  'Kế hoạch tối học bù? Cái kế hoạch đó thất bại bao nhiêu lần rồi, nhớ không?',
  'Trưa rồi. Nếu trì hoãn là một môn học, bạn đã tốt nghiệp loại giỏi.',
  'Hôm nay vẫn trắng. Đây là "tạm nghỉ chiến lược" hay chỉ là lười có tổ chức?',
];

const CHIEU = [
  'Chiều rồi, hôm nay vẫn trắng. Lý do lần này là gì: mệt, bận, hay "chưa có hứng"? Đoán trúng có thưởng không?',
  'Còn vài tiếng nữa là hết ngày. Hết ngày mà vẫn chưa học thì đừng tự gọi mình là người đang học AI.',
  'Ngày hôm nay sắp thành thêm một ngày "để mai". Bộ sưu tập này của bạn to lắm rồi.',
  'Mặt trời sắp lặn. Động lực của bạn thì chưa từng mọc.',
  'Chiều nay mà vẫn chưa ngồi vào bàn, tối nay bạn lại sẽ nói "mai nhất định". Câu đó cũ quá rồi.',
  'Lúc này một người nghiêm túc đã xong buổi học. Còn bạn đã xong được... việc đọc tin nhắn này.',
  'Bạn bảo muốn đổi nghề. Nghề hiện tại của bạn có vẻ là "người hay hứa".',
  'Hôm nay có 6 buổi trong tuần thì bạn đang tự tặng mình ngày nghỉ thứ hai. Hào phóng thật.',
  'Trì hoãn đến chiều là kỹ năng. Đáng tiếc là không ai tuyển kỹ năng này.',
  'Thời gian trôi đều với mọi người. Chỉ có kết quả là không chia đều.',
  'Chiều rồi. Bảng tiến độ đang nhìn bạn đấy. Nó không giận, nó chỉ thất vọng.',
  'Người ta đi làm cả ngày vẫn học được 2 tiếng buổi tối. Bạn rảnh hơn họ mà còn chưa bắt đầu.',
];

// Tối, cả ngày chưa học.
const TOI_CHUA = [
  'Hôm nay bạn chưa học buổi nào. Không một buổi nào. Ấn tượng thật, theo nghĩa xấu.',
  'Cả ngày trôi qua, bảng tiến độ vẫn y nguyên. Nhìn có thấy ngại không?',
  'Lại một ngày trắng. Đây là lúc biết xấu hổ một chút đấy.',
  'Chúc mừng, bạn vừa hoàn thành thêm một ngày không làm gì. Chuỗi này thì giữ giỏi ghê.',
  'Tối rồi. Lý do hôm nay là gì? Ghi lại đi, sau này in thành sách "1001 cách không học AI".',
  'Bạn không thiếu thời gian. Bạn thiếu việc ngồi xuống. Hai thứ đó khác nhau.',
  'Bạn đã dành cả ngày để chuẩn bị tinh thần. Tinh thần chuẩn bị xong chưa, hay cần thêm một tuần?',
  'Nếu mỗi lần trì hoãn được trả lương, bạn đã giàu. Tiếc là thị trường trả tiền cho người làm.',
  'Cả ngày nay bạn bận gì mà không có nổi 25 phút? Kể ra nghe xem có thuyết phục nổi chính bạn không.',
  'AI không thay thế được bạn đâu. Vì bạn có làm gì đâu mà thay.',
  'Hôm nay lại là ngày nghỉ không phép. Sếp duy nhất của bạn là chính bạn, và sếp đang rất thất vọng.',
  'Một ngày nữa trôi qua. Giấc mơ vẫn ở đó, đứng chờ, mỏi chân lắm rồi.',
];

const KHUYA = [
  'Gần nửa đêm rồi mà vẫn trắng. Mai thức dậy, nhớ rằng hôm nay bạn đã chọn trì hoãn. Tự chọn đấy nhé.',
  'Ngày hôm nay coi như mất. Không học bù gấp đôi, nhưng mai còn trắng nữa thì nghiêm túc xem lại bản thân đi.',
  'Đi ngủ với con số 0. Lần tới ai hỏi "học tới đâu rồi", trả lời thật cho họ nghe.',
  'Hết ngày. Kết quả: 0 buổi, 0 phút, 100% lý do. Hiệu suất tuyệt đối, chỉ là sai hướng.',
  'Ngủ ngon nhé. Lương tâm chắc không làm phiền đâu, nó quen rồi.',
  'Hôm nay kết thúc như nhiều hôm khác: với một lời hứa mới. Lời hứa thì bạn sản xuất hàng loạt.',
  'Muộn rồi, đừng học nữa, đi ngủ. Nhưng mai mà còn thế này thì đừng nói với ai là bạn đang học AI.',
  'Ngày hôm nay của bạn có thể tóm gọn trong một dòng commit: "chưa làm gì".',
  'Tắt điện thoại đi ngủ. Mai 7:30 bot lại gọi. Bot thì không bao giờ trì hoãn, khác bạn.',
  'Lại một đêm đi ngủ mà chưa học. Ước mơ cũng đi ngủ, nhưng nó bắt đầu ngủ say hơn rồi đấy.',
];

// Có học nhưng chưa ghi điểm (khuya).
const CHUA_GHI = [
  'Học rồi mà chưa ghi điểm. Lười đến mức 5 dòng báo cáo cũng không viết à? Ghi đi rồi ngủ.',
  'Học xong không ghi lại là học cho vui. Mai quên sạch thì đừng ngạc nhiên. Ghi điểm ngay.',
  'Báo cáo 5 mục mất 5 phút. Bạn vừa dành 5 phút đó để lướt cái gì vậy?',
  'Không có báo cáo thì không có bằng chứng. Không có bằng chứng thì coi như chưa học.',
];

// Tối, có học nhưng dưới 90 phút.
const HOC_IT = [
  'Mới {phut} phút. Lộ trình cần 120 phút. Đây là học hay là điểm danh?',
  '{phut} phút. Đủ để nói là có học, không đủ để học được gì. Bạn tự biết mà.',
  '{phut} phút mà cũng ghi điểm. Dũng cảm đấy. Mai gấp đôi lên.',
  '{phut} phút. Xem một tập phim còn lâu hơn thế.',
];

// Tối, đã học đủ.
const HOC_DU = [
  'Đã ghi điểm. Được. Đừng đòi khen vì làm đúng việc của mình.',
  'Hôm nay đạt. Mai giữ nhịp, đừng để hôm nay thành ngày "ăn may".',
  'Có học, có ghi. Đây mới là mức tối thiểu, chưa phải thành tích.',
  'Tốt. Giờ thì đừng tự thưởng bằng cách nghỉ luôn ngày mai.',
];

const DA_HOC_TOI = [
  'Hôm nay có học. Không có gì để vỗ tay, đây là việc bạn tự đăng ký.',
  'Hôm nay có học. Hiếm đấy, nên bot ghi nhận. Đừng để nó hiếm nữa.',
  'Có học. Bot hơi bất ngờ. Đừng để bot bất ngờ nữa, cứ thế mà làm đều đi.',
];

// Số ngày học đã bỏ liên tiếp.
const BO_1 = [
  'Hôm qua bỏ học. Một ngày thì ai cũng có lý do. Hai ngày thì đó là tính cách.',
  'Hôm qua trắng. Hôm nay mà trắng nữa là thành thói quen, và thói quen thì khó bỏ hơn lý do nhiều.',
  'Hôm qua nghỉ. Hôm nay cũng định "nghỉ một chút" à?',
];
const BO_2_3 = [
  'Đã {n} ngày không đụng vào bài. Nói muốn đổi đời mà mở máy ra chỉ để lướt điện thoại.',
  '{n} ngày không học. Kiến thức tuần trước đang lặng lẽ rời khỏi đầu bạn, không cần chào.',
  '{n} ngày liền. Bot bắt đầu nghi ngờ bạn chỉ thích ý tưởng học AI, không thích việc học AI.',
  '{n} ngày nghỉ. Kỳ nghỉ này ai duyệt cho bạn vậy?',
];
const BO_4_6 = [
  '{n} ngày không học. Đây đúng là kiểu người đăng ký khoá học rồi để đó cho có. Bạn đang đúng kiểu đó đấy.',
  '{n} ngày. Gần một tuần. Ai nhìn vào cũng nghĩ bạn bỏ rồi. Chứng minh họ sai đi, hôm nay.',
  '{n} ngày trắng. Repo GitHub của bạn trông như một bảo tàng: đẹp, im lặng, không ai đụng vào.',
];
const BO_NHIEU = [
  '{n} ngày không học. Lộ trình 52 tuần này không phải đồ trang trí. Ngồi vào bàn, hoặc thôi tự lừa mình.',
  '{n} ngày. Đây không còn là trì hoãn nữa, đây là bỏ cuộc mà không dám nói ra. Nếu chưa bỏ thì làm một buổi hôm nay để chứng minh.',
  '{n} ngày. Bạn của {n} ngày trước chắc sẽ rất buồn khi thấy bạn bây giờ. Làm lại từ buổi kế tiếp, ngay hôm nay.',
];

// So với lịch.
const NHANH = [
  'Đang nhanh {n} buổi. Đừng vội vênh mặt, nhanh 1 tuần mà bỏ 2 tuần thì vẫn là số 0.',
  'Nhanh {n} buổi. Tốt. Giờ thử giữ nó lâu hơn một tuần xem, việc đó mới khó.',
];
const DUNG = [
  'Đang đúng lịch. Đúng lịch là mức tối thiểu, không phải thành tích.',
  'Đúng lịch. Bot không khen đâu, đây là thứ bạn đã hứa.',
];
const CHAM_IT = [
  'Chậm {n} buổi. Mới bắt đầu tụt thôi, nhưng ai bỏ cuộc cũng bắt đầu y như vậy.',
  'Chậm {n} buổi. Nhỏ thôi, nhưng vết nứt nào cũng nhỏ lúc đầu.',
];
const CHAM_VUA = [
  'Chậm {n} buổi, {tuan} học vứt đi. Người khác đang đi tiếp, còn bạn đứng xem.',
  'Chậm {n} buổi. Lịch học của bạn giờ giống lịch đọc sách ngày Tết: có, nhưng chỉ để cho có.',
];
const CHAM_NHIEU = [
  'Chậm {n} buổi. Với tốc độ này, 52 tuần thành 2 năm, và "AI Engineer" chỉ là dòng chữ đẹp trong bio.',
  'Chậm {n} buổi. Đến lúc bạn học xong, AI chắc đã tự học xong luôn phần của bạn.',
  'Chậm {n} buổi. Lộ trình 52 tuần của bạn đang được gia hạn miễn phí, chẳng ai yêu cầu.',
];

// Câu kết thúc thúc hành động.
const KET = [
  'Chỉ cần 25 phút để bắt đầu. Mở tài liệu ngay bây giờ, không phải "lát nữa".',
  'Đọc xong tin này thì mở tài liệu luôn. Đừng trả lời bot, bot không cần lý do của bạn.',
  'Đặt hẹn giờ 25 phút. Nếu chừng đó cũng không làm nổi, ít nhất hãy thừa nhận là bạn không muốn.',
  'Không cần cảm hứng. Cần mở máy, mở tài liệu, đọc dòng đầu tiên. Thế thôi.',
  'Đóng hết tab mạng xã hội. Mở đúng một tab: tài liệu buổi học.',
];

// Tổng kết tuần theo số buổi.
const TUAN_0 = [
  'Không một buổi nào trong cả tuần. Bạn không "đang học AI", bạn đang nghĩ về việc học AI. Hai việc đó khác nhau.',
  '0/6. Tuần này bạn là khán giả trong chính lộ trình của mình.',
  '0 buổi. Nếu đây là một sản phẩm, nó đã bị khai tử vì không có người dùng.',
];
const TUAN_IT = [
  '{x}/6. Chưa tới một tuần đúng nghĩa, chẳng có gì đáng tự hào. Tuần sau vẫn vậy thì lộ trình chỉ là giấy.',
  '{x}/6. Đi học kiểu "có mặt cho đủ điểm danh". Thầy không chấm điểm danh, thị trường cũng không.',
];
const TUAN_GAN = [
  '{x}/6. Gần đủ. Nhưng "gần" không đưa bạn tới đích, và "gần" là chữ người ta hay dùng trước chữ "suýt".',
  '{x}/6. Thiếu chút xíu. Chút xíu mỗi tuần nhân 52 là một khoảng rất to.',
];
const TUAN_DU = [
  '6/6. Đúng việc phải làm. Tuần sau làm lại y như vậy, không được tụt.',
  '6/6. Bot không có gì để mỉa tuần này. Đừng để tuần sau bot có việc làm.',
];
const CN = [
  'Hôm nay Chủ nhật: nghỉ. Nghỉ thật, đừng biến nó thành cớ nghỉ luôn thứ hai.',
  'Chủ nhật nghỉ là luật. Thứ hai trốn học thì không có luật nào bảo vệ bạn đâu.',
  'Nghỉ đi. Nhưng tối nay mở sẵn tài liệu thứ hai, để sáng mai không còn lý do.',
];

module.exports = { SANG, TRUA, CHIEU, TOI_CHUA, KHUYA, CHUA_GHI, HOC_IT, HOC_DU, DA_HOC_TOI, BO_1, BO_2_3, BO_4_6, BO_NHIEU, NHANH, DUNG, CHAM_IT, CHAM_VUA, CHAM_NHIEU, KET, TUAN_0, TUAN_IT, TUAN_GAN, TUAN_DU, CN };
