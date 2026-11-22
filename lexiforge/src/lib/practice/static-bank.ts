/**
 * Static beginner drill banks (Pre-A1 … A1.2): dictation and pronunciation practice need ZERO LLM calls.
 * Sets are 5 consecutive items, rotated by how many sessions the learner has already done in that mode.
 */
import type { DictationSet, SpeakingSet } from "./content";
import { ITEMS_PER_SESSION } from "./content";

export const BEGINNER_DICTATION: DictationSet["items"] = [
  { text: "I live in Hanoi.", vi: "Tôi sống ở Hà Nội." },
  { text: "My brother is a doctor.", vi: "Anh trai tôi là bác sĩ." },
  { text: "She drinks coffee every morning.", vi: "Cô ấy uống cà phê mỗi sáng." },
  { text: "The shop opens at eight.", vi: "Cửa hàng mở cửa lúc tám giờ." },
  { text: "We go to school by bus.", vi: "Chúng tôi đi học bằng xe buýt." },
  { text: "It is very hot today.", vi: "Hôm nay trời rất nóng." },
  { text: "I have two sisters.", vi: "Tôi có hai chị em gái." },
  { text: "He likes playing football.", vi: "Anh ấy thích chơi bóng đá." },
  { text: "The bank is near my house.", vi: "Ngân hàng ở gần nhà tôi." },
  { text: "Can you help me, please?", vi: "Bạn có thể giúp tôi được không?" },
  { text: "I am hungry now.", vi: "Bây giờ tôi đói." },
  { text: "They watched a film last night.", vi: "Tối qua họ đã xem một bộ phim." },
  { text: "Where is the train station?", vi: "Ga tàu ở đâu?" },
  { text: "My phone is on the table.", vi: "Điện thoại của tôi ở trên bàn." },
  { text: "She works in a big hospital.", vi: "Cô ấy làm việc ở một bệnh viện lớn." },
  { text: "We need some rice and eggs.", vi: "Chúng tôi cần một ít gạo và trứng." },
  { text: "The weather is nice today.", vi: "Hôm nay thời tiết đẹp." },
  { text: "I get up at six.", vi: "Tôi thức dậy lúc sáu giờ." },
  { text: "Do you speak English?", vi: "Bạn có nói tiếng Anh không?" },
  { text: "This book is very interesting.", vi: "Cuốn sách này rất thú vị." },
];

export const BEGINNER_SPEAKING: SpeakingSet["items"] = [
  { text: "Thank you very much.", ipa: "/θæŋk ju ˈvɛri mʌtʃ/", tipVi: "Âm /θ/: đặt đầu lưỡi giữa hai răng rồi thổi hơi, không đọc thành “t”.", tipEn: "For /θ/, put your tongue between your teeth and blow; don't say “t”." },
  { text: "What's your name?", ipa: "/wʌts jʊr neɪm/", tipVi: "Đọc rõ đuôi /ts/ trong “what's”, khép môi ở /m/ cuối “name”.", tipEn: "Say the final /ts/ in “what's” and close your lips on the final /m/." },
  { text: "I like this book.", ipa: "/aɪ laɪk ðɪs bʊk/", tipVi: "Bật nhẹ âm /k/ cuối “like” và “book”, đừng bỏ âm cuối.", tipEn: "Release the final /k/ in “like” and “book”; don't drop it." },
  { text: "She works in a bank.", ipa: "/ʃi wɝks ɪn ə bæŋk/", tipVi: "“works” kết thúc bằng /ks/: nói cả /k/ lẫn /s/.", tipEn: "“works” ends in /ks/: say both /k/ and /s/." },
  { text: "I lived here last year.", ipa: "/aɪ lɪvd hɪr læst jɪr/", tipVi: "Đuôi -ed sau âm /v/ đọc là /d/: “lived” = /lɪvd/, không thêm âm “ét”.", tipEn: "-ed after /v/ sounds /d/: “lived” is one syllable." },
  { text: "Can I have some water?", ipa: "/kən aɪ hæv səm ˈwɔtər/", tipVi: "Âm /v/ cuối “have”: răng trên chạm môi dưới, rung cổ họng.", tipEn: "For final /v/, touch your top teeth to your lower lip and voice it." },
  { text: "The bus stops here.", ipa: "/ðə bʌs stɑps hɪr/", tipVi: "“the” bắt đầu bằng /ð/ (lưỡi giữa răng, có rung); “stops” kết thúc /ps/.", tipEn: "“the” starts with voiced /ð/; “stops” ends in /ps/." },
  { text: "I need three tickets.", ipa: "/aɪ nid θri ˈtɪkɪts/", tipVi: "“three” là /θri/ chứ không phải “tri”; nhớ đuôi /ts/ của “tickets”.", tipEn: "“three” is /θri/, not “tree”; keep the final /ts/ in “tickets”." },
  { text: "He watched TV last night.", ipa: "/hi wɑtʃt ˌtiˈvi læst naɪt/", tipVi: "Đuôi -ed sau /tʃ/ đọc là /t/: “watched” = /wɑtʃt/, một âm tiết.", tipEn: "-ed after /tʃ/ sounds /t/: “watched” is one syllable." },
  { text: "Where is the station?", ipa: "/wɛr ɪz ðə ˈsteɪʃən/", tipVi: "“station” có âm /ʃ/ (như “s” nặng, tròn môi), không đọc thành “s”.", tipEn: "“station” has /ʃ/ (rounded lips), not /s/." },
  { text: "My mother cooks dinner.", ipa: "/maɪ ˈmʌðər kʊks ˈdɪnər/", tipVi: "“mother” có /ð/ ở giữa: đưa lưỡi ra giữa răng và rung.", tipEn: "“mother” has voiced /ð/ in the middle." },
  { text: "It's cold today.", ipa: "/ɪts koʊld təˈdeɪ/", tipVi: "“cold” kết thúc bằng cụm /ld/: nói cả /l/ và /d/.", tipEn: "“cold” ends in /ld/: say both sounds." },
  { text: "I want a glass of milk.", ipa: "/aɪ wɑnt ə ɡlæs əv mɪlk/", tipVi: "“milk” kết thúc /lk/; nối “want a” thành /wɑntə/.", tipEn: "“milk” ends in /lk/; link “want a” smoothly." },
  { text: "We played football yesterday.", ipa: "/wi pleɪd ˈfʊtbɔl ˈjɛstərdeɪ/", tipVi: "“played” chỉ một âm tiết, kết thúc bằng /d/.", tipEn: "“played” is one syllable ending in /d/." },
  { text: "How much is this shirt?", ipa: "/haʊ mʌtʃ ɪz ðɪs ʃɝt/", tipVi: "Phân biệt /s/ trong “this” và /ʃ/ trong “shirt”.", tipEn: "Contrast /s/ in “this” with /ʃ/ in “shirt”." },
  { text: "I think so.", ipa: "/aɪ θɪŋk soʊ/", tipVi: "“think” bắt đầu bằng /θ/, không đọc thành “tink” hay “sink”.", tipEn: "“think” starts with /θ/, not “t” or “s”." },
];

/** Five consecutive items starting at `variant * 5` (wraps around). */
export function rotatingSet<T>(bank: readonly T[], variant: number): T[] {
  const start = (variant * ITEMS_PER_SESSION) % bank.length;
  return Array.from({ length: ITEMS_PER_SESSION }, (_, i) => bank[(start + i) % bank.length] as T);
}
