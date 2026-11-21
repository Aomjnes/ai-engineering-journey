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

export const WRITING_PROMPTS: readonly string[] = [
  "Many cities are considering banning cars from their centres. Write 80–120 words explaining whether you would support such a ban in your city and why. Give one concrete example.",
  "Describe a skill you learned outside school and explain how it changed the way you work or study. Write 80–120 words with at least one specific example.",
  "Some people believe that working from home is better for productivity; others disagree. Write 80–120 words giving your opinion, with one reason and one example.",
];

export const READING_PASSAGES_SERVED = 4;
export const ERROR_ITEMS_SERVED = 8;
export const WRITING_MIN_WORDS = 80;
export const WRITING_MAX_WORDS = 140;
