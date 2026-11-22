/**
 * Fixed curriculum for every sub-band step (Pre-A1 → C1.2). Deterministic content: the roadmap generator
 * only selects and orders these steps. Hours follow guided-learning-hour norms split per sub-band.
 */
import type { SubBand } from "@/lib/metrics/scoring";

export interface CoreTopics {
  pronunciation: string[];
  chunks: string[];
  grammar: string[];
  reading: string;
  /** Foundation decks that train this step (see practice/foundation-decks.ts). */
  decks: string[];
  /** Practice Studio modes recommended for this step. */
  practice: Array<"DICTATION" | "SPEAKING" | "SENTENCE" | "ROLEPLAY" | "FOUNDATION">;
}

export interface CurriculumStep {
  toBand: SubBand;
  titleVi: string;
  titleEn: string;
  outcomeVi: string;
  outcomeEn: string;
  topics: { vi: CoreTopics; en: CoreTopics };
  requiredGai: number;
  requiredLri: number;
  requiredRss: number;
  hours: number;
}

const t = (vi: CoreTopics, en: Omit<CoreTopics, "decks" | "practice">): { vi: CoreTopics; en: CoreTopics } => ({ vi, en: { ...en, decks: vi.decks, practice: vi.practice } });

export const CURRICULUM: Record<Exclude<SubBand, "PRE_A1">, CurriculumStep> = {
  A1_1: {
    toBand: "A1_1",
    titleVi: "Âm thanh & câu chào sinh tồn",
    titleEn: "Sounds & survival greetings",
    outcomeVi: "Chào hỏi, giới thiệu tên, hỏi giá và cảm ơn bằng câu ngắn; nghe hiểu các từ quen thuộc khi nói chậm.",
    outcomeEn: "Greet, introduce yourself, ask prices and say thanks in short sentences; catch familiar words spoken slowly.",
    topics: t(
      { pronunciation: ["Phát âm 44 âm IPA nền tảng", "Âm cuối /s/, /t/, /d/ — không nuốt âm"], chunks: ["Nắm 50 cụm từ sinh tồn (chào, cảm ơn, xin lỗi, bao nhiêu tiền)"], grammar: ["Câu với 'I am / You are / It is'"], reading: "Đọc biển báo, thực đơn, tin nhắn 1–2 câu", decks: ["ipa-basics", "everyday-chunks"], practice: ["FOUNDATION", "SPEAKING", "DICTATION"] },
      { pronunciation: ["The 44 core IPA sounds", "Final /s/, /t/, /d/ — never drop endings"], chunks: ["50 survival chunks (greetings, thanks, sorry, how much)"], grammar: ["Sentences with 'I am / You are / It is'"], reading: "Signs, menus, 1–2 sentence messages" },
    ),
    requiredGai: 40, requiredLri: 30, requiredRss: 50, hours: 40,
  },
  A1_2: {
    toBand: "A1_2",
    titleVi: "100 động từ hành động & câu khẳng định/phủ định/hỏi",
    titleEn: "100 action verbs & yes/no/negative sentences",
    outcomeVi: "Kể việc hằng ngày bằng 3–5 câu đơn; đặt câu hỏi Yes/No và câu phủ định đúng trật tự từ.",
    outcomeEn: "Describe your day in 3–5 simple sentences; ask yes/no questions and make negatives in the right order.",
    topics: t(
      { pronunciation: ["Đuôi -s/-es: /s/, /z/, /ɪz/", "Nối âm cơ bản (an apple, get up)"], chunks: ["Cụm hằng ngày: get up, go to work, have lunch"], grammar: ["Ghép đúng câu Khẳng định / Phủ định / Hỏi với do/does", "Thì hiện tại đơn"], reading: "Đoạn văn 3–4 câu về sinh hoạt hằng ngày", decks: ["action-verbs", "sentence-patterns"], practice: ["SENTENCE", "FOUNDATION", "DICTATION"] },
      { pronunciation: ["-s/-es endings: /s/, /z/, /ɪz/", "Basic linking (an apple, get up)"], chunks: ["Daily chunks: get up, go to work, have lunch"], grammar: ["Affirmative / negative / question with do/does", "Present simple"], reading: "3–4 sentence daily-life paragraphs" },
    ),
    requiredGai: 48, requiredLri: 36, requiredRss: 55, hours: 40,
  },
  A2_1: {
    toBand: "A2_1",
    titleVi: "Quá khứ & tình huống thường ngày",
    titleEn: "The past & everyday situations",
    outcomeVi: "Kể lại cuối tuần, gọi đồ ăn, hỏi đường, mua sắm trong hội thoại ngắn.",
    outcomeEn: "Tell what you did at the weekend, order food, ask directions and shop in short conversations.",
    topics: t(
      { pronunciation: ["Đuôi -ed: /t/, /d/, /ɪd/", "Trọng âm từ 2 âm tiết"], chunks: ["Cụm nhà hàng, mua sắm, chỉ đường"], grammar: ["Quá khứ đơn (động từ có quy tắc & bất quy tắc thường gặp)", "Mạo từ a/an/the"], reading: "Truyện vi mô 50–90 từ từ tin tức hôm nay", decks: ["everyday-chunks", "sentence-patterns"], practice: ["ROLEPLAY", "SENTENCE", "DICTATION"] },
      { pronunciation: ["-ed endings: /t/, /d/, /ɪd/", "Two-syllable word stress"], chunks: ["Restaurant, shopping and directions chunks"], grammar: ["Past simple (regular + common irregular)", "Articles a/an/the"], reading: "50–90 word micro stories from today's news" },
    ),
    requiredGai: 55, requiredLri: 42, requiredRss: 58, hours: 50,
  },
  A2_2: {
    toBand: "A2_2",
    titleVi: "Giao tiếp đời sống cơ bản",
    titleEn: "Everyday communication",
    outcomeVi: "Tự xoay xở khi du lịch, kể kế hoạch tương lai, so sánh hai lựa chọn; đọc bản tin đã đơn giản hoá.",
    outcomeEn: "Handle travel situations, talk about plans, compare two options; read simplified news.",
    topics: t(
      { pronunciation: ["Ngữ điệu câu hỏi lên/xuống", "Âm /θ/ /ð/"], chunks: ["Cụm kế hoạch: be going to, I'd like to, how about"], grammar: ["Tương lai be going to / will", "So sánh hơn & nhất"], reading: "Bản tin cầu nối (graded) + đoạn gốc ngắn", decks: ["sentence-patterns"], practice: ["ROLEPLAY", "SPEAKING", "SENTENCE"] },
      { pronunciation: ["Rising/falling question intonation", "/θ/ and /ð/"], chunks: ["Planning chunks: be going to, I'd like to, how about"], grammar: ["Future be going to / will", "Comparatives & superlatives"], reading: "Graded bridge news + short original excerpt" },
    ),
    requiredGai: 62, requiredLri: 48, requiredRss: 60, hours: 50,
  },
  B1_1: {
    toBand: "B1_1",
    titleVi: "Đọc hiểu tin tức có hỗ trợ",
    titleEn: "Supported news reading",
    outcomeVi: "Hiểu ý chính bản tin cầu nối, viết email 80–100 từ có lý do và ví dụ.",
    outcomeEn: "Grasp the main points of bridged news; write 80–100 word emails with a reason and an example.",
    topics: t(
      { pronunciation: ["Trọng âm câu & từ chức năng yếu", "Nhại câu dài 12–18 từ"], chunks: ["Cụm ý kiến: in my view, as a result, on the other hand"], grammar: ["Hiện tại hoàn thành vs quá khứ đơn", "Mệnh đề quan hệ who/which/that"], reading: "Bản tin cầu nối B1", decks: [], practice: ["DICTATION", "SENTENCE", "ROLEPLAY"] },
      { pronunciation: ["Sentence stress & weak forms", "Shadow 12–18 word sentences"], chunks: ["Opinion chunks: in my view, as a result, on the other hand"], grammar: ["Present perfect vs past simple", "Relative clauses who/which/that"], reading: "B1 bridged news" },
    ),
    requiredGai: 68, requiredLri: 54, requiredRss: 62, hours: 90,
  },
  B1_2: {
    toBand: "B1_2",
    titleVi: "Tin tức thật & công việc (IELTS ~5.5)",
    titleEn: "Real news & work English (IELTS ~5.5)",
    outcomeVi: "Đọc tin tức gốc chủ đề quen thuộc, tham gia họp ngắn, viết đoạn lập luận 120 từ.",
    outcomeEn: "Read original news on familiar topics, join short meetings, write 120-word argued paragraphs.",
    topics: t(
      { pronunciation: ["Nối âm & nuốt âm tự nhiên"], chunks: ["Cụm công việc: follow up on, be in charge of"], grammar: ["Câu điều kiện loại 1–2", "Bị động thường gặp"], reading: "Bài báo gốc gần trình độ (i+1)", decks: [], practice: ["ROLEPLAY", "DICTATION", "SENTENCE"] },
      { pronunciation: ["Natural linking & elision"], chunks: ["Work chunks: follow up on, be in charge of"], grammar: ["Conditionals type 1–2", "Common passives"], reading: "Near-level original articles (i+1)" },
    ),
    requiredGai: 73, requiredLri: 60, requiredRss: 64, hours: 90,
  },
  B2_1: {
    toBand: "B2_1",
    titleVi: "Lập luận & sắc thái",
    titleEn: "Argument & nuance",
    outcomeVi: "Bảo vệ quan điểm có phản biện, hiểu sắc thái giọng văn báo chí.",
    outcomeEn: "Defend a view with counter-arguments; read the tone of journalism.",
    topics: t(
      { pronunciation: ["Ngữ điệu nhấn ý tương phản"], chunks: ["Collocation học thuật: raise concerns, draw attention to"], grammar: ["Đảo ngữ cơ bản", "Mệnh đề rút gọn"], reading: "Bài báo gốc B2", decks: [], practice: ["ROLEPLAY", "SENTENCE"] },
      { pronunciation: ["Contrastive stress"], chunks: ["Academic collocations: raise concerns, draw attention to"], grammar: ["Basic inversion", "Reduced clauses"], reading: "Original B2 articles" },
    ),
    requiredGai: 78, requiredLri: 66, requiredRss: 66, hours: 100,
  },
  B2_2: {
    toBand: "B2_2",
    titleVi: "Làm việc tự tin (IELTS ~6.5)",
    titleEn: "Confident professional English (IELTS ~6.5)",
    outcomeVi: "Đàm phán, thuyết trình, viết báo cáo ngắn mạch lạc với ít lỗi.",
    outcomeEn: "Negotiate, present and write short coherent reports with few errors.",
    topics: t(
      { pronunciation: ["Nhịp & nhấn câu khi thuyết trình"], chunks: ["Cụm đàm phán & rào đón: to be fair, it could be argued"], grammar: ["Câu phức nhiều mệnh đề", "Modal suy đoán"], reading: "Bài phân tích, xã luận", decks: [], practice: ["ROLEPLAY", "DICTATION"] },
      { pronunciation: ["Presentation rhythm & stress"], chunks: ["Negotiation & hedging chunks: to be fair, it could be argued"], grammar: ["Multi-clause sentences", "Modals of speculation"], reading: "Analyses and editorials" },
    ),
    requiredGai: 82, requiredLri: 71, requiredRss: 68, hours: 100,
  },
  C1_1: {
    toBand: "C1_1",
    titleVi: "Sử dụng chuyên sâu (IELTS ~7.5)",
    titleEn: "Advanced fluency (IELTS ~7.5)",
    outcomeVi: "Đọc tiểu luận dài, viết lập luận tinh tế, chọn từ đúng sắc thái và văn phong.",
    outcomeEn: "Read long essays, argue with subtlety, choose words with the right nuance and register.",
    topics: t(
      { pronunciation: ["Ngữ điệu biểu cảm & thái độ"], chunks: ["Cụm diễn đạt hàm ý, rào đón tinh tế"], grammar: ["Cấu trúc nhấn mạnh (cleft)", "Danh từ hoá"], reading: "Tiểu luận Aeon, Quanta", decks: [], practice: ["ROLEPLAY", "SENTENCE"] },
      { pronunciation: ["Attitudinal intonation"], chunks: ["Implication and subtle hedging chunks"], grammar: ["Cleft sentences", "Nominalisation"], reading: "Aeon / Quanta essays" },
    ),
    requiredGai: 86, requiredLri: 76, requiredRss: 70, hours: 110,
  },
  C1_2: {
    toBand: "C1_2",
    titleVi: "Gần như người bản xứ",
    titleEn: "Near-native precision",
    outcomeVi: "Viết và tranh luận chính xác, tự nhiên ở mọi văn phong.",
    outcomeEn: "Write and debate precisely and naturally in any register.",
    topics: t(
      { pronunciation: ["Nhại tốc độ tự nhiên"], chunks: ["Thành ngữ & collocation hiếm"], grammar: ["Biến thể văn phong trang trọng/thân mật"], reading: "Mọi nguồn gốc không chỉnh sửa", decks: [], practice: ["ROLEPLAY"] },
      { pronunciation: ["Shadow natural-speed speech"], chunks: ["Idioms & rare collocations"], grammar: ["Formal/informal register shifts"], reading: "Any unedited source" },
    ),
    requiredGai: 90, requiredLri: 80, requiredRss: 72, hours: 110,
  },
};
