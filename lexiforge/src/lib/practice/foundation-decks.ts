/**
 * Foundation Core Decks — curated beginner content. Every item is trained by active recall
 * (listen-and-type or Vietnamese → English) and pushed into the FSRS deck once mastered.
 */

export interface FoundationItem {
  key: string;
  /** What the learner must produce (typed). */
  answer: string;
  /** Recall cue shown to the learner. */
  cueVi: string;
  cueEn: string;
  /** Extra study info revealed after answering (IPA, tip, example). */
  ipa?: string;
  noteVi?: string;
  /** "listen": the browser reads `answer` aloud and the learner types it; "translate": cue → type English. */
  mode: "listen" | "translate";
}

export interface FoundationDeck {
  id: string;
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
  items: FoundationItem[];
}

export const MASTERY_STREAK = 2; // correct recalls (not necessarily consecutive) before an item enters the SRS deck

// 44 English phonemes: 12 monophthongs, 8 diphthongs, 24 consonants. [ipa, example word, Vietnamese tip]
const IPA: Array<[string, string, string]> = [
  ["iː", "see", "i kéo dài, môi bành sang hai bên"], ["ɪ", "sit", "i ngắn, bật nhanh"], ["ʊ", "book", "u ngắn, môi hơi tròn"], ["uː", "food", "u kéo dài, môi tròn"],
  ["e", "bed", "e ngắn như 'e' tiếng Việt"], ["ə", "about", "âm 'ơ' rất nhẹ, không nhấn"], ["ɜː", "bird", "ơ kéo dài, lưỡi giữa"], ["ɔː", "door", "o kéo dài, môi tròn"],
  ["æ", "cat", "giữa 'a' và 'e', mở miệng rộng"], ["ʌ", "cup", "â ngắn, dứt khoát"], ["ɑː", "car", "a kéo dài, miệng mở to"], ["ɒ", "hot", "o ngắn, miệng tròn"],
  ["ɪə", "near", "i trượt sang ơ"], ["eɪ", "day", "ê trượt sang i"], ["ʊə", "tour", "u trượt sang ơ"], ["ɔɪ", "boy", "o trượt sang i"],
  ["əʊ", "go", "ơ trượt sang u"], ["eə", "hair", "e trượt sang ơ"], ["aɪ", "my", "a trượt sang i"], ["aʊ", "now", "a trượt sang u"],
  ["p", "pen", "bật hơi mạnh, khác 'p' Việt"], ["b", "bag", "rung dây thanh"], ["t", "ten", "bật hơi; âm cuối phải nghe rõ"], ["d", "dog", "đầu lưỡi chạm lợi, rung"],
  ["k", "key", "bật hơi như 'kh' nhẹ"], ["g", "go", "rung, như 'g' Việt"], ["f", "fish", "răng trên chạm môi dưới"], ["v", "very", "như /f/ nhưng rung"],
  ["θ", "think", "đặt lưỡi giữa hai răng, thổi hơi — không đọc 'th' Việt"], ["ð", "this", "như /θ/ nhưng rung"], ["s", "sun", "âm 'x' gió; âm cuối /s/ không được bỏ"], ["z", "zoo", "như /s/ nhưng rung"],
  ["ʃ", "she", "môi tròn, 'sh' xì mạnh"], ["ʒ", "vision", "như /ʃ/ nhưng rung"], ["h", "hat", "hơi thở nhẹ"], ["m", "man", "như 'm'"],
  ["n", "nine", "như 'n'"], ["ŋ", "sing", "như 'ng' cuối từ"], ["tʃ", "chair", "'ch' bật mạnh, môi tròn"], ["dʒ", "job", "như /tʃ/ nhưng rung"],
  ["l", "light", "đầu lưỡi chạm lợi; âm cuối /l/ cong lưỡi"], ["r", "red", "cong lưỡi, không rung lưỡi"], ["w", "we", "môi tròn rồi mở"], ["j", "yes", "như 'd' miền Nam / 'gi' nhẹ"],
];

// 100 essential action verbs: [verb, Vietnamese meaning]
const VERBS: Array<[string, string]> = [
  ["be", "thì, là, ở"], ["have", "có"], ["do", "làm"], ["say", "nói"], ["go", "đi"], ["get", "nhận, lấy"], ["make", "tạo ra, làm"], ["know", "biết"], ["think", "nghĩ"], ["take", "cầm, lấy"],
  ["see", "nhìn thấy"], ["come", "đến"], ["want", "muốn"], ["look", "nhìn"], ["use", "sử dụng"], ["find", "tìm thấy"], ["give", "đưa, cho"], ["tell", "kể, bảo"], ["work", "làm việc"], ["call", "gọi"],
  ["try", "thử, cố gắng"], ["ask", "hỏi"], ["need", "cần"], ["feel", "cảm thấy"], ["become", "trở thành"], ["leave", "rời đi"], ["put", "đặt, để"], ["mean", "có nghĩa là"], ["keep", "giữ"], ["let", "để cho"],
  ["begin", "bắt đầu"], ["help", "giúp đỡ"], ["talk", "nói chuyện"], ["turn", "xoay, rẽ"], ["start", "bắt đầu"], ["show", "cho xem"], ["hear", "nghe thấy"], ["play", "chơi"], ["run", "chạy"], ["move", "di chuyển"],
  ["like", "thích"], ["live", "sống"], ["believe", "tin"], ["bring", "mang đến"], ["write", "viết"], ["sit", "ngồi"], ["stand", "đứng"], ["lose", "mất, thua"], ["pay", "trả tiền"], ["meet", "gặp"],
  ["learn", "học"], ["change", "thay đổi"], ["understand", "hiểu"], ["watch", "xem"], ["follow", "đi theo"], ["stop", "dừng"], ["read", "đọc"], ["speak", "nói (một ngôn ngữ)"], ["open", "mở"], ["close", "đóng"],
  ["walk", "đi bộ"], ["win", "thắng"], ["teach", "dạy"], ["buy", "mua"], ["sell", "bán"], ["wait", "chờ"], ["send", "gửi"], ["build", "xây dựng"], ["stay", "ở lại"], ["fall", "rơi, ngã"],
  ["cut", "cắt"], ["reach", "đạt tới, với tới"], ["remember", "nhớ"], ["forget", "quên"], ["love", "yêu"], ["eat", "ăn"], ["drink", "uống"], ["sleep", "ngủ"], ["cook", "nấu ăn"], ["clean", "dọn dẹp"],
  ["wash", "rửa, giặt"], ["drive", "lái xe"], ["ride", "đi (xe đạp, xe máy)"], ["carry", "mang, vác"], ["choose", "chọn"], ["finish", "hoàn thành"], ["listen", "lắng nghe"], ["answer", "trả lời"], ["visit", "thăm"], ["travel", "du lịch, di chuyển"],
  ["spend", "tiêu (tiền, thời gian)"], ["save", "tiết kiệm, cứu"], ["plan", "lên kế hoạch"], ["agree", "đồng ý"], ["explain", "giải thích"], ["borrow", "mượn"], ["lend", "cho mượn"], ["arrive", "đến nơi"], ["return", "trở về, trả lại"], ["smile", "mỉm cười"],
];

// Core everyday chunks: [chunk, Vietnamese meaning]
const CHUNKS: Array<[string, string]> = [
  ["nice to meet you", "rất vui được gặp bạn"], ["how are you", "bạn có khỏe không"], ["thank you very much", "cảm ơn rất nhiều"], ["excuse me", "xin lỗi (cho tôi hỏi)"], ["I'm sorry", "tôi xin lỗi"],
  ["how much is it", "cái này bao nhiêu tiền"], ["where is the toilet", "nhà vệ sinh ở đâu"], ["can you help me", "bạn giúp tôi được không"], ["I don't understand", "tôi không hiểu"], ["could you say that again", "bạn nói lại được không"],
  ["speak more slowly", "nói chậm hơn"], ["I would like a coffee", "tôi muốn một ly cà phê"], ["the bill, please", "làm ơn cho xin hóa đơn"], ["see you later", "hẹn gặp lại"], ["have a nice day", "chúc một ngày tốt lành"],
  ["what time is it", "mấy giờ rồi"], ["turn left", "rẽ trái"], ["turn right", "rẽ phải"], ["go straight", "đi thẳng"], ["next to", "bên cạnh"],
  ["in front of", "phía trước"], ["at the moment", "hiện tại, lúc này"], ["of course", "tất nhiên"], ["no problem", "không sao"], ["I'm looking for", "tôi đang tìm"],
  ["get up", "thức dậy"], ["go to work", "đi làm"], ["have lunch", "ăn trưa"], ["take a shower", "tắm vòi sen"], ["go to bed", "đi ngủ"],
  ["make a mistake", "mắc lỗi"], ["take a photo", "chụp ảnh"], ["pay by card", "thanh toán bằng thẻ"], ["book a table", "đặt bàn"], ["catch the bus", "bắt xe buýt"],
  ["on the weekend", "vào cuối tuần"], ["a lot of", "nhiều"], ["a little bit", "một chút"], ["by the way", "nhân tiện"], ["it depends", "còn tùy"],
  ["I think so", "tôi nghĩ vậy"], ["I agree with you", "tôi đồng ý với bạn"], ["what do you mean", "ý bạn là gì"], ["let me know", "hãy cho tôi biết"], ["take care", "giữ gìn sức khỏe"],
  ["look forward to", "mong đợi"], ["be good at", "giỏi về"], ["be interested in", "quan tâm đến"], ["pay attention to", "chú ý đến"], ["on time", "đúng giờ"],
];

// Fundamental sentence patterns: [model sentence, Vietnamese meaning, pattern note]
const PATTERNS: Array<[string, string, string]> = [
  ["I am a teacher", "Tôi là giáo viên", "S + am/is/are + danh từ"], ["She is very tired", "Cô ấy rất mệt", "S + be + tính từ"], ["They are at home", "Họ đang ở nhà", "S + be + nơi chốn"],
  ["I am not hungry", "Tôi không đói", "Phủ định: be + not"], ["Are you a student", "Bạn là sinh viên phải không", "Câu hỏi: đảo 'be' lên đầu"], ["I like green tea", "Tôi thích trà xanh", "S + động từ + tân ngữ"],
  ["He works in a bank", "Anh ấy làm việc ở ngân hàng", "He/She/It + động từ thêm -s"], ["I do not eat meat", "Tôi không ăn thịt", "Phủ định: do not + động từ"], ["She does not drive", "Cô ấy không lái xe", "He/She: does not + động từ (bỏ -s)"],
  ["Do you speak English", "Bạn có nói tiếng Anh không", "Câu hỏi: Do + S + động từ"], ["Does he live here", "Anh ấy có sống ở đây không", "Câu hỏi: Does + he/she + động từ"], ["Where do you work", "Bạn làm việc ở đâu", "Từ để hỏi + do + S + động từ"],
  ["There is a cat on the table", "Có một con mèo trên bàn", "There is + danh từ số ít"], ["There are two banks near here", "Có hai ngân hàng gần đây", "There are + danh từ số nhiều"], ["I can swim", "Tôi biết bơi", "can + động từ nguyên mẫu"],
  ["I am reading a book now", "Bây giờ tôi đang đọc sách", "Hiện tại tiếp diễn: be + V-ing"], ["I went to Hanoi last week", "Tuần trước tôi đã đi Hà Nội", "Quá khứ đơn: động từ cột 2"], ["I did not see him", "Tôi đã không thấy anh ấy", "Phủ định quá khứ: did not + động từ"],
  ["Did you call her", "Bạn đã gọi cho cô ấy chưa", "Câu hỏi quá khứ: Did + S + động từ"], ["I am going to visit my parents", "Tôi sẽ đi thăm bố mẹ", "Dự định: be going to + động từ"], ["It is bigger than my room", "Nó lớn hơn phòng của tôi", "So sánh hơn: -er than"],
  ["I want to learn English", "Tôi muốn học tiếng Anh", "want to + động từ"], ["I have lived here for two years", "Tôi đã sống ở đây hai năm", "Hiện tại hoàn thành: have + V3"], ["If it rains, I will stay home", "Nếu trời mưa, tôi sẽ ở nhà", "Điều kiện loại 1"],
];

export const FOUNDATION_DECKS: readonly FoundationDeck[] = [
  {
    id: "ipa-basics",
    titleVi: "44 âm IPA nền tảng",
    titleEn: "44 core IPA sounds",
    descVi: "Nghe từ ví dụ và gõ lại. Mỗi âm kèm ký hiệu IPA và mẹo phát âm cho người Việt.",
    descEn: "Listen to the example word and type it. Each sound comes with its IPA symbol and a pronunciation tip.",
    items: IPA.map(([ipa, word, tip], i) => ({ key: `ipa-${i}`, answer: word, cueVi: `Âm /${ipa}/ — nghe và gõ từ ví dụ`, cueEn: `Sound /${ipa}/ — listen and type the example word`, ipa: `/${ipa}/`, noteVi: tip, mode: "listen" })),
  },
  {
    id: "action-verbs",
    titleVi: "100 động từ hành động thiết yếu",
    titleEn: "100 essential action verbs",
    descVi: "Nhìn nghĩa tiếng Việt, gõ động từ tiếng Anh.",
    descEn: "See the Vietnamese meaning, type the English verb.",
    items: VERBS.map(([v, vi]) => ({ key: `verb-${v}`, answer: v, cueVi: vi, cueEn: `Verb meaning “${vi}”`, mode: "translate" })),
  },
  {
    id: "everyday-chunks",
    titleVi: "Cụm từ sinh tồn hằng ngày",
    titleEn: "Core everyday chunks",
    descVi: "Học cả cụm, không học từ rời. Nhìn nghĩa, gõ cả cụm tiếng Anh.",
    descEn: "Learn whole chunks, not single words. See the meaning, type the English chunk.",
    items: CHUNKS.map(([c, vi], i) => ({ key: `chunk-${i}`, answer: c, cueVi: vi, cueEn: `Chunk meaning “${vi}”`, mode: "translate" })),
  },
  {
    id: "sentence-patterns",
    titleVi: "Mẫu câu nền tảng",
    titleEn: "Fundamental sentence patterns",
    descVi: "Khẳng định, phủ định, câu hỏi và các thì cơ bản. Dịch câu tiếng Việt sang tiếng Anh.",
    descEn: "Affirmative, negative, questions and basic tenses. Translate the Vietnamese sentence.",
    items: PATTERNS.map(([s, vi, note], i) => ({ key: `pattern-${i}`, answer: s, cueVi: vi, cueEn: `Translate: “${vi}”`, noteVi: note, mode: "translate" })),
  },
];

export function findDeck(id: string): FoundationDeck | undefined {
  return FOUNDATION_DECKS.find((d) => d.id === id);
}
