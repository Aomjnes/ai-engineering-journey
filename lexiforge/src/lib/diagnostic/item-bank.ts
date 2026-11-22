/**
 * Placement item bank. Difficulties `b` are on the shared 0–100 level scale (12.5 per sub-band).
 * Passage difficulty is anchored by its measured readability profile; question `b` adds an offset for
 * inference/nuance load. Answer keys never leave the server (see diagnostic/service.ts → publicItem()).
 */

export interface ReadingQuestion {
  id: string;
  type: "inference" | "nuance" | "paraphrase" | "detail";
  prompt: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  difficulty: number;
}

export interface ReadingPassage {
  id: string;
  band: string;
  difficulty: number;
  title: string;
  text: string;
  questions: [ReadingQuestion, ReadingQuestion];
}

export const READING_PASSAGES: readonly ReadingPassage[] = [
  {
    id: "r-a2-1",
    band: "A2.1",
    difficulty: 6,
    title: "A new bus stop",
    text: "Last month the town opened a new bus stop near the school. Before, children walked twenty minutes to the main road. Now they wait in front of the school gate. Some parents are happy, but the shop owner next to the stop is not. He says the buses are loud and stop in front of his door.",
    questions: [
      { id: "r-a2-1-q1", type: "detail", prompt: "Where is the new bus stop?", options: ["On the main road", "Near the school", "Inside the shop", "Behind the town hall"], answer: 1, difficulty: 2 },
      { id: "r-a2-1-q2", type: "inference", prompt: "Why is the shop owner unhappy?", options: ["He has to walk farther", "His shop must close", "The buses make noise at his door", "Children break his window"], answer: 2, difficulty: 9 },
    ],
  },
  {
    id: "r-a2-2",
    band: "A2.2",
    difficulty: 18,
    title: "Learning to swim at forty",
    text: "Lan never learned to swim as a child because her village was far from any pool. At forty, she finally signed up for lessons. The first week was difficult: she was afraid to put her face in the water. Her teacher did not push her. Instead, he asked her to practise breathing at the side of the pool. By the end of the month, she could swim one full length without stopping.",
    questions: [
      { id: "r-a2-2-q1", type: "detail", prompt: "Why didn't Lan learn to swim when she was young?", options: ["She was afraid of water", "There was no pool near her village", "Her parents did not allow it", "She was too busy at school"], answer: 1, difficulty: 13 },
      { id: "r-a2-2-q2", type: "inference", prompt: "What does the text suggest about the teacher's method?", options: ["He was strict and fast", "He let her progress at her own pace", "He forced her to swim on day one", "He only taught advanced swimmers"], answer: 1, difficulty: 22 },
    ],
  },
  {
    id: "r-b1-1",
    band: "B1.1",
    difficulty: 31,
    title: "Second-hand clothes go mainstream",
    text: "Buying second-hand clothes used to be something people did quietly, mainly to save money. That has changed. Online platforms now let users sell a jacket in minutes, and many young shoppers say they prefer used items because they want to reduce waste. Critics point out, however, that cheap resale can also encourage people to buy more than they need, simply because they know they can sell it again later.",
    questions: [
      { id: "r-b1-1-q1", type: "paraphrase", prompt: "According to the text, why do many young shoppers choose used clothes?", options: ["Used clothes are always cheaper", "They want to produce less waste", "Online shops sell only used items", "Their parents prefer it"], answer: 1, difficulty: 26 },
      { id: "r-b1-1-q2", type: "nuance", prompt: "What concern do the critics raise?", options: ["Resale sites are unsafe", "Used clothes are low quality", "Easy resale may lead people to buy more", "Second-hand shopping is embarrassing"], answer: 2, difficulty: 36 },
    ],
  },
  {
    id: "r-b1-2",
    band: "B1.2",
    difficulty: 44,
    title: "The four-day week trial",
    text: "When a software company in Lisbon moved its staff to a four-day week, managers expected productivity to fall. Six months later, output had remained roughly the same, and sick days had dropped by a third. Not every team adapted equally well, though. Customer-support staff, who must answer calls during fixed hours, reported more pressure on the days they did work. The company has decided to keep the scheme but to hire two additional support agents.",
    questions: [
      { id: "r-b1-2-q1", type: "detail", prompt: "What happened to productivity during the trial?", options: ["It fell sharply", "It stayed about the same", "It doubled", "It was not measured"], answer: 1, difficulty: 38 },
      { id: "r-b1-2-q2", type: "inference", prompt: "Why is the company hiring two more support agents?", options: ["Support staff felt more pressure under the new schedule", "Sick days increased", "The trial failed", "Managers want a five-day week again"], answer: 0, difficulty: 49 },
    ],
  },
  {
    id: "r-b2-1",
    band: "B2.1",
    difficulty: 56,
    title: "Why cities are painting roofs white",
    text: "Dark rooftops absorb sunlight and radiate heat long after sunset, which is one reason dense neighbourhoods can be several degrees warmer than surrounding countryside. Coating roofs with reflective white paint is a cheap fix, and early studies are encouraging: indoor temperatures in treated buildings fell noticeably during heatwaves. Yet researchers caution against treating paint as a cure-all. In colder months, the same roofs can raise heating bills, and the benefit shrinks if streets themselves remain covered in heat-trapping asphalt.",
    questions: [
      { id: "r-b2-1-q1", type: "paraphrase", prompt: "Which statement best paraphrases the researchers' position?", options: ["White roofs solve urban heat on their own", "White roofs help but have limits and trade-offs", "White roofs are too expensive to be useful", "White roofs only work in winter"], answer: 1, difficulty: 53 },
      { id: "r-b2-1-q2", type: "inference", prompt: "What can be inferred about asphalt streets?", options: ["They reflect most sunlight", "They contribute to keeping neighbourhoods hot", "They lower heating bills", "They are being replaced by white paint"], answer: 1, difficulty: 61 },
    ],
  },
  {
    id: "r-b2-2",
    band: "B2.2",
    difficulty: 68,
    title: "The quiet decline of the handwritten note",
    text: "Few people mourn the disappearance of cheques or fax machines, but the fading of handwriting provokes a surprisingly emotional response. Part of this is nostalgia; part of it is evidence. Several studies suggest that students who take notes by hand recall concepts better than those who type, apparently because the slower pace forces them to summarise rather than transcribe. Whether this justifies compulsory handwriting lessons is another matter. Sceptics argue that the cognitive benefit comes from summarising, not from the pen, and that well-designed digital habits could deliver the same result.",
    questions: [
      { id: "r-b2-2-q1", type: "nuance", prompt: "What do the sceptics claim is the real source of the benefit?", options: ["The physical act of holding a pen", "The habit of summarising ideas", "Typing faster than writing", "Emotional attachment to paper"], answer: 1, difficulty: 64 },
      { id: "r-b2-2-q2", type: "inference", prompt: "What is the writer's attitude to compulsory handwriting lessons?", options: ["Strongly in favour", "Strongly opposed", "Undecided; the evidence does not settle it", "Uninterested in the topic"], answer: 2, difficulty: 73 },
    ],
  },
  {
    id: "r-c1-1",
    band: "C1.1",
    difficulty: 81,
    title: "Measuring what matters",
    text: "Once a metric becomes a target, institutions acquire a powerful incentive to improve the number rather than the underlying reality it was meant to capture. Hospitals judged on waiting times have been known to reclassify patients; schools assessed on pass rates may quietly discourage weaker pupils from sitting exams. None of this implies that measurement is futile. It implies that indicators must be rotated, triangulated and, above all, interpreted by people who understand what the figures cannot show.",
    questions: [
      { id: "r-c1-1-q1", type: "paraphrase", prompt: "Which idea does the passage illustrate with hospitals and schools?", options: ["Measurement always fails", "Targets can distort the behaviour they were meant to monitor", "Hospitals are worse than schools", "Pass rates are the best indicator"], answer: 1, difficulty: 78 },
      { id: "r-c1-1-q2", type: "nuance", prompt: "What does the author mean by \"what the figures cannot show\"?", options: ["Data that has been deleted", "Aspects of performance that numbers fail to capture", "Statistics that are too complex to publish", "Future results that are unknown"], answer: 1, difficulty: 86 },
    ],
  },
  {
    id: "r-c1-2",
    band: "C1.2",
    difficulty: 92,
    title: "The ambiguity of progress",
    text: "To call a technology neutral is to mistake the absence of intention for the absence of consequence. A tool designed with no particular agenda nonetheless redistributes attention, labour and power among those who use it and those who cannot. The printing press did not set out to fracture religious authority, any more than social platforms set out to reorganise political discourse; yet in each case the medium altered not merely what could be said but who could be heard. The more instructive question, then, is not whether a technology is good or bad, but whose capacities it amplifies and whose it quietly erodes.",
    questions: [
      { id: "r-c1-2-q1", type: "inference", prompt: "Why does the author reject the idea that technology is neutral?", options: ["Because inventors always have hidden agendas", "Because tools have effects regardless of their designers' intentions", "Because printing presses were political", "Because social platforms are harmful"], answer: 1, difficulty: 89 },
      { id: "r-c1-2-q2", type: "nuance", prompt: "What does \"not merely what could be said but who could be heard\" emphasise?", options: ["Changes in vocabulary", "Shifts in whose voices gained an audience", "The speed of communication", "Censorship by governments"], answer: 1, difficulty: 96 },
    ],
  },
];

export interface ErrorDetectionItem {
  id: string;
  difficulty: number;
  segments: [string, string, string, string]; // concatenated with single spaces = the sentence
  answer: 0 | 1 | 2 | 3 | 4; // 4 = "No error"
  trap: string; // subtype the item probes
  explanation: string;
}

export const ERROR_ITEMS: readonly ErrorDetectionItem[] = [
  { id: "e-01", difficulty: 5, segments: ["I very like", "watching football", "with my brother", "on Sundays."], answer: 0, trap: "VIETLISH_CALQUE", explanation: "Adverb placement: \"I really like\" / \"I like … very much\", never \"I very like\"." },
  { id: "e-02", difficulty: 9, segments: ["She don't", "work on Saturdays", "because the office", "is closed."], answer: 0, trap: "SV_AGREEMENT", explanation: "Third person singular: \"She doesn't\"." },
  { id: "e-03", difficulty: 15, segments: ["Please open", "the light", "because the room", "is too dark."], answer: 1, trap: "VIETLISH_CALQUE", explanation: "Calque of \"mở đèn\": English says \"turn on the light\"." },
  { id: "e-04", difficulty: 20, segments: ["My teacher explained", "us the rule", "twice, but I", "still forgot it."], answer: 1, trap: "VERB_PATTERN", explanation: "\"explain something to someone\": \"explained the rule to us\"." },
  { id: "e-05", difficulty: 26, segments: ["Although it was", "raining heavily,", "but we decided", "to go out."], answer: 2, trap: "CONJUNCTION_DOUBLING", explanation: "\"Although … but\" doubles the connector (tuy … nhưng). Drop \"but\"." },
  { id: "e-06", difficulty: 30, segments: ["We discussed", "the new plan", "for almost", "two hours."], answer: 4, trap: "NO_ERROR", explanation: "Correct. (The trap would be \"discussed about\".)" },
  { id: "e-07", difficulty: 36, segments: ["If I would have", "more free time,", "I would learn", "to play the guitar."], answer: 0, trap: "TENSE_FORM", explanation: "Second conditional: \"If I had more free time\"." },
  { id: "e-08", difficulty: 41, segments: ["The number of tourists", "visiting the island", "have increased", "every year since 2015."], answer: 2, trap: "SV_AGREEMENT", explanation: "Head noun is \"The number\" (singular): \"has increased\"." },
  { id: "e-09", difficulty: 47, segments: ["She has worked", "here since", "five years,", "so she knows everyone."], answer: 2, trap: "PREPOSITION_MISUSE", explanation: "Duration takes \"for\": \"for five years\"." },
  { id: "e-10", difficulty: 53, segments: ["The government", "should take", "more strict measures", "to reduce pollution."], answer: 2, trap: "UNNATURAL_COLLOCATION", explanation: "Natural collocation: \"stricter measures\" / \"tougher measures\"." },
  { id: "e-11", difficulty: 58, segments: ["Hardly had", "the meeting started", "when the fire alarm", "went off."], answer: 4, trap: "NO_ERROR", explanation: "Correct inverted structure: \"Hardly had … when …\"." },
  { id: "e-12", difficulty: 64, segments: ["The report", "gives an information", "about the risks", "of the new policy."], answer: 1, trap: "COUNTABILITY", explanation: "\"information\" is uncountable: \"gives information\"." },
  { id: "e-13", difficulty: 71, segments: ["Not only the company", "lost money,", "but it also", "damaged its reputation."], answer: 0, trap: "WORD_ORDER", explanation: "Fronted \"Not only\" requires inversion: \"Not only did the company lose money\"." },
  { id: "e-14", difficulty: 77, segments: ["The findings", "are consistent to", "earlier research", "on sleep and memory."], answer: 1, trap: "PREPOSITION_CALQUE", explanation: "Fixed collocation: \"consistent with\"." },
  { id: "e-15", difficulty: 84, segments: ["Had the regulators", "acted sooner,", "the crisis might", "have been averted."], answer: 4, trap: "NO_ERROR", explanation: "Correct inverted third conditional." },
  { id: "e-16", difficulty: 90, segments: ["The committee's decision", "to postpone the vote", "was widely seen as", "a deliberate stalling tactics."], answer: 3, trap: "PLURAL_OMISSION", explanation: "Singular determiner \"a\" + singular noun: \"a deliberate stalling tactic\"." },
];

/**
 * Legacy difficulties above were authored on the earlier 8-band scale (A2.1 = 0 … C1.2 = 87.5).
 * Map them onto the current 11-band level scale (A2.1 = 34 … C1.2 = 90) by matching band lower bounds.
 */
const LEGACY_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 34], [12.5, 44], [25, 53], [37.5, 61], [50, 69], [62.5, 76], [75, 83], [87.5, 90], [100, 100],
];

export function legacyToLevel(old: number): number {
  for (let i = 1; i < LEGACY_ANCHORS.length; i++) {
    const [x0, y0] = LEGACY_ANCHORS[i - 1] as readonly [number, number];
    const [x1, y1] = LEGACY_ANCHORS[i] as readonly [number, number];
    if (old <= x1) return Math.round((y0 + ((old - x0) / (x1 - x0)) * (y1 - y0)) * 10) / 10;
  }
  return 100;
}

// ───────────────────────────── Tier 0 · Pre-A1 (absolute beginners) ─────────────────────────────

export interface AudioMeaningItem {
  id: string;
  kind: "AUDIO_MEANING";
  difficulty: number;
  /** English stimulus read aloud by the browser (TTS). Not the answer. */
  say: string;
  options: [string, string, string, string]; // Vietnamese meanings
  answer: 0 | 1 | 2 | 3;
}

export interface PhraseMatchItem {
  id: string;
  kind: "PHRASE_MATCH";
  difficulty: number;
  situationVi: string;
  situationEn: string;
  options: [string, string, string, string]; // English phrases
  answer: 0 | 1 | 2 | 3;
}

export interface WordOrderItem {
  id: string;
  kind: "WORD_ORDER";
  difficulty: number;
  hintVi: string;
  hintEn: string;
  /** The correct sentence; chips are its words shown in a fixed scrambled order. */
  sentence: string;
  scrambled: string[];
}

export type Tier0Item = AudioMeaningItem | PhraseMatchItem | WordOrderItem;

export const TIER0_ITEMS: readonly Tier0Item[] = [
  { id: "t0-a1", kind: "AUDIO_MEANING", difficulty: 2, say: "Hello", options: ["Tạm biệt", "Xin chào", "Cảm ơn", "Xin lỗi"], answer: 1 },
  { id: "t0-p1", kind: "PHRASE_MATCH", difficulty: 4, situationVi: "Bạn muốn cảm ơn người phục vụ.", situationEn: "You want to thank the waiter.", options: ["Thank you.", "Excuse me.", "Goodbye.", "I'm sorry."], answer: 0 },
  { id: "t0-a2", kind: "AUDIO_MEANING", difficulty: 6, say: "water", options: ["cơm", "nước", "bánh mì", "cà phê"], answer: 1 },
  { id: "t0-p2", kind: "PHRASE_MATCH", difficulty: 9, situationVi: "Bạn muốn hỏi tên một người mới gặp.", situationEn: "You want to ask a new person's name.", options: ["How old are you?", "Where are you?", "What is your name?", "How are you?"], answer: 2 },
  { id: "t0-a3", kind: "AUDIO_MEANING", difficulty: 12, say: "How much is it?", options: ["Mấy giờ rồi?", "Nó ở đâu?", "Cái này bao nhiêu tiền?", "Bạn có khỏe không?"], answer: 2 },
  { id: "t0-o1", kind: "WORD_ORDER", difficulty: 14, hintVi: "Tôi là sinh viên.", hintEn: "I am a student.", sentence: "I am a student", scrambled: ["student", "am", "I", "a"] },
  { id: "t0-p3", kind: "PHRASE_MATCH", difficulty: 17, situationVi: "Bạn bị lạc và muốn hỏi đường tới nhà ga.", situationEn: "You are lost and need the train station.", options: ["I like the train station.", "Where is the train station?", "The train station is big.", "I am the train station."], answer: 1 },
  { id: "t0-o2", kind: "WORD_ORDER", difficulty: 22, hintVi: "Cô ấy không thích cà phê.", hintEn: "She does not like coffee.", sentence: "She does not like coffee", scrambled: ["like", "coffee", "She", "not", "does"] },
];

export const TIER0_EARLY_STOP_MISSES = 4; // 4 misses/skips among the first 5 items end Tier 0 early

// ───────────────────────────── Tier 1 · A1–A2 short everyday passages ─────────────────────────────

export const TIER1_PASSAGES: readonly ReadingPassage[] = [
  {
    id: "t1-r1",
    band: "A1.2",
    difficulty: 27,
    title: "My morning",
    text: "Every morning, Minh gets up at six o'clock. He drinks a glass of water and eats bread with eggs. Then he takes the bus to work because he does not have a car.",
    questions: [
      { id: "t1-r1-q1", type: "detail", prompt: "What does Minh eat for breakfast?", options: ["Rice and fish", "Bread with eggs", "Noodles", "Nothing"], answer: 1, difficulty: 24 },
      { id: "t1-r1-q2", type: "inference", prompt: "Why does Minh take the bus?", options: ["He likes buses", "His office is far", "He has no car", "The bus is free"], answer: 2, difficulty: 31 },
    ],
  },
  {
    id: "t1-r2",
    band: "A2.1",
    difficulty: 36,
    title: "A new café",
    text: "A small café opened on Lan's street last week. The coffee is cheap, but the room is often too noisy to study. Lan still goes there on Sundays because she likes the owner.",
    questions: [
      { id: "t1-r2-q1", type: "detail", prompt: "When did the café open?", options: ["Last week", "Last year", "Yesterday", "On Sunday morning"], answer: 0, difficulty: 30 },
      { id: "t1-r2-q2", type: "nuance", prompt: "What is the problem with the café?", options: ["The coffee is expensive", "It is far from Lan's house", "It is loud inside", "It closes on Sundays"], answer: 2, difficulty: 38 },
    ],
  },
];

export interface TierBlock {
  tier: 0 | 1 | 2 | 3;
  passages: readonly ReadingPassage[];
  passagesServed: number;
  errors: readonly ErrorDetectionItem[];
  errorsServed: number;
}

const mapPassage = (p: ReadingPassage): ReadingPassage => ({
  ...p,
  difficulty: legacyToLevel(p.difficulty),
  questions: p.questions.map((q) => ({ ...q, difficulty: legacyToLevel(q.difficulty) })) as [ReadingQuestion, ReadingQuestion],
});
const mapError = (e: ErrorDetectionItem): ErrorDetectionItem => ({ ...e, difficulty: legacyToLevel(e.difficulty) });
const byId = <T extends { id: string }>(arr: readonly T[], ids: string[]) => ids.map((id) => arr.find((x) => x.id === id) as T);

export const TIER_BLOCKS: Record<1 | 2 | 3, TierBlock> = {
  1: { tier: 1, passages: [...TIER1_PASSAGES, ...byId(READING_PASSAGES, ["r-a2-1", "r-a2-2"]).map(mapPassage)], passagesServed: 2, errors: byId(ERROR_ITEMS, ["e-01", "e-02", "e-03", "e-04"]).map(mapError), errorsServed: 3 },
  2: { tier: 2, passages: byId(READING_PASSAGES, ["r-b1-1", "r-b1-2", "r-b2-1", "r-b2-2"]).map(mapPassage), passagesServed: 2, errors: byId(ERROR_ITEMS, ["e-05", "e-06", "e-07", "e-08", "e-09", "e-10", "e-11", "e-12"]).map(mapError), errorsServed: 3 },
  3: { tier: 3, passages: byId(READING_PASSAGES, ["r-c1-1", "r-c1-2"]).map(mapPassage), passagesServed: 2, errors: byId(ERROR_ITEMS, ["e-13", "e-14", "e-15", "e-16"]).map(mapError), errorsServed: 3 },
};

// ───────────────────────────── Writing tasks per tier ─────────────────────────────

export interface WritingTask {
  tier: 1 | 2 | 3;
  promptEn: string;
  promptVi: string;
  hintsVi: string[];
  minWords: number;
  maxWords: number;
  targetLabel: string;
  /** Level range the writing sample can indicate (writing-implied level is mapped into it). */
  levelRange: [number, number];
}

export const WRITING_TASKS: Record<1 | 2 | 3, WritingTask> = {
  1: {
    tier: 1,
    promptEn: "Write 2–3 simple sentences about yourself: your name or job, where you live, and one thing you like.",
    promptVi: "Viết 2–3 câu đơn giản về bản thân: tên hoặc công việc, nơi bạn sống, và một điều bạn thích.",
    hintsVi: ["Tên tôi là… = My name is…", "Tôi sống ở… = I live in…", "Tôi thích… = I like…"],
    minWords: 8,
    maxWords: 60,
    targetLabel: "2–3 sentences",
    levelRange: [10, 50],
  },
  2: {
    tier: 2,
    promptEn: "Many cities want to ban cars from their centres. Would you support this in your city? Give one reason and one example (60–90 words).",
    promptVi: "Nhiều thành phố muốn cấm ô tô vào trung tâm. Bạn có ủng hộ điều này ở thành phố của bạn không? Nêu một lý do và một ví dụ (60–90 từ).",
    hintsVi: [],
    minWords: 50,
    maxWords: 130,
    targetLabel: "60–90 words",
    levelRange: [35, 85],
  },
  3: {
    tier: 3,
    promptEn: "“Remote work makes teams less innovative.” Argue for or against this claim, acknowledge the strongest counter-argument, and conclude (90–120 words).",
    promptVi: "“Làm việc từ xa khiến đội nhóm kém sáng tạo hơn.” Hãy lập luận ủng hộ hoặc phản đối, thừa nhận phản biện mạnh nhất và kết luận (90–120 từ).",
    hintsVi: [],
    minWords: 80,
    maxWords: 160,
    targetLabel: "90–120 words",
    levelRange: [60, 100],
  },
};

// ───────────────────────────── Goals ─────────────────────────────

export const GOAL_OPTIONS = [
  { band: "A2_2", key: "goalA2" },
  { band: "B1_2", key: "goalB1" },
  { band: "B2_2", key: "goalB2" },
  { band: "C1_1", key: "goalC1" },
] as const;

export const DAILY_MINUTES_OPTIONS = [15, 30, 45, 60] as const;
