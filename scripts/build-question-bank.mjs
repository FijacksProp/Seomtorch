import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docDir = path.join(root, "doc");
const outputFile = path.join(root, "data", "questions.json");

const sources = [
  ["2019GRAMMARDAY1.txt", "english", "Grammar and usage"],
  ["2019IDIOMSDAY1.txt", "english", "Idioms and interpretation"],
  ["2019PHONOLOGYDAY1-1.txt", "english", "Oral English"],
  ["2019PUTMEGENDAY1GENERAL PAPER.txt", "general-paper", null],
  ["2019SPELLINGDAY1-1.txt", "english", "Spelling"],
  ["2019VOCABULARYDAY1-1.txt", "english", "Vocabulary"],
  ["2019_DAY3-1.txt", null, null],
];

const entityMap = {
  "&nbsp;": " ", "&amp;": "&", "&quot;": "\"", "&#39;": "'",
  "&theta;": "θ", "&isin;": "ɛ", "&rsquo;": "’", "&ldquo;": "“", "&rdquo;": "”",
};

function cleanText(value, markHighlights = false) {
  let text = String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<u>(.*?)<\/u>/gis, markHighlights ? "“$1”" : "$1")
    .replace(/<font[^>]*>(.*?)<\/font>/gis, markHighlights ? "“$1”" : "$1")
    .replace(/<[^>]+>/g, " ");
  for (const [entity, replacement] of Object.entries(entityMap)) text = text.replaceAll(entity, replacement);
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function embeddedOptions(question) {
  const lines = question.split("\n");
  const options = [];
  let firstOption = -1;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s*([A-D])(?:[.)]|\s+[–-])\s*(.+?)\s*$/i);
    if (!match) continue;
    if (firstOption < 0) firstOption = index;
    options.push({ letter: match[1].toUpperCase(), text: match[2] });
  }
  return { options, question: firstOption >= 0 ? lines.slice(0, firstOption).join("\n").trim() : question };
}

function generalTopic(question) {
  const value = question.toLowerCase();
  if (/government|president|election|minister|senate|assembly|parliament|constitution|court|politic|democra|inec|legislat|executive|citizen/.test(value)) return "Government and civics";
  if (/country|capital|continent|river|ocean|boundary|located|state of nigeria|town|mountain|lake|world|commonwealth|united nations|unesco|ecowas|africa/.test(value)) return "Geography and world affairs";
  if (/disease|protein|exercise|blood|body|animal|plant|soil|energy|chemical|planet|science|computer|internet|technology|whale|kangaroo/.test(value)) return "Science, health and technology";
  if (/econom|market|inflation|bank|currency|trade|industry|company|business|richest/.test(value)) return "Economics and commerce";
  if (/year|history|founded|independence|war|riot|centenary|anthem|invented|first/.test(value)) return "History and culture";
  return "General knowledge";
}

function day3Category(index, question) {
  if (index >= 592 && index <= 735) return ["general-paper", generalTopic(question)];
  if (index >= 736 && index <= 874) return ["english", "Spelling"];
  if (index >= 875) return ["english", "Vocabulary"];
  if (index >= 584 && index <= 591) return ["english", "Punctuation and usage"];
  if (index >= 501 && index <= 583) return ["english", "Oral English"];
  if (index >= 397 && index <= 500) return ["english", "Idioms and interpretation"];
  return ["english", "Grammar and usage"];
}

function explanationFor(question, answer, topic) {
  const q = question.toLowerCase();
  const a = answer.trim();
  const lowerAnswer = a.toLowerCase();
  if (topic === "Spelling") return `“${a}” is the standard spelling that correctly completes the item.`;
  if (topic === "Vocabulary") return `In this context, the word or expression is best understood as “${a}”.`;
  if (topic === "Idioms and interpretation") return `The expression is figurative; in this context it means “${a}”.`;
  if (topic === "Oral English") return `“${a}” matches the sound, stress or rhyme feature specified in the question.`;
  if (topic === "Punctuation and usage") return `“${a}” applies the punctuation or usage rule required by the sentence.`;
  if (topic === "Grammar and usage") {
    if (lowerAnswer.includes("simple sentence")) return "It is a simple sentence because it contains one independent clause, even if that clause contains several phrases.";
    if (lowerAnswer.includes("compound complex") || lowerAnswer.includes("compound-complex")) return "It is compound-complex because it combines at least two independent clauses with at least one dependent clause.";
    if (lowerAnswer.includes("compound sentence") || lowerAnswer === "compound") return "It is compound because it contains two independent clauses joined in one sentence.";
    if (lowerAnswer.includes("complex sentence") || lowerAnswer === "complex") return "It is complex because it contains an independent clause and at least one dependent clause.";
    if (/grammatical (name|function)|clause type|highlighted|underlined/.test(q)) return `The marked expression is correctly identified as “${a}” because that is the role or structure it has in the sentence.`;
    return `“${a}” gives the grammatically appropriate completion or analysis for the sentence.`;
  }
  if (/president of which|president of/.test(q)) return `The historical figure named in the question served as president of ${a}.`;
  if (/capital/.test(q)) return `${a} is the capital relevant to the place named in the question.`;
  if (/currency/.test(q)) return `${a} is the currency or currency fact requested in the question.`;
  if (/located|where is|which country|which state|boundary/.test(q)) return `${a} is the location or geographical relationship requested by the question.`;
  if (/year|date|when/.test(q)) return `${a} is the date recorded for the event described in the question.`;
  if (/called|known as|referred to as/.test(q)) return `The accepted term for the description in the question is “${a}”.`;
  if (topic === "Science, health and technology") return `The relevant scientific or health fact identifies “${a}” as the correct response.`;
  return `The answer key identifies “${a}” as the fact that correctly completes this General Paper item.`;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);
}

function parseSource(filename, fixedSubject, fixedTopic) {
  const bytes = fs.readFileSync(path.join(docDir, filename));
  let raw = new TextDecoder("utf-8").decode(bytes);
  if (raw.includes("�")) raw = new TextDecoder("windows-1252").decode(bytes);
  const blocks = raw.split(/(?:\r?\n){2,}/).filter(block => /^question\s*:/m.test(block));
  const records = [];
  const errors = [];

  blocks.forEach((block, offset) => {
    const sourceIndex = offset + 1;
    const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const questionLine = lines.find(line => /^question\s*:/i.test(line));
    let question = cleanText(questionLine?.replace(/^question\s*:\s*/i, ""), true);
    const entries = [];
    for (const line of lines.filter(line => /^(answer|option)\s*:/i.test(line))) {
      const matches = [...line.matchAll(/(?:^|\s)(answer|option)\s*:\s*(.*?)(?=\s+(?:answer|option)\s*:|$)/gi)];
      for (const match of matches) entries.push({ type: match[1].toLowerCase(), text: cleanText(match[2]) });
    }

    let choices = entries.map(entry => entry.text);
    let correct = entries.findIndex(entry => entry.type === "answer");
    const embedded = embeddedOptions(question);
    const letterAnswer = entries.find(entry => entry.type === "answer")?.text.toUpperCase();
    const entriesAreLetters = entries.length && entries.every(entry => /^[A-D]$/i.test(entry.text));
    if (embedded.options.length === 4 && entriesAreLetters) {
      choices = embedded.options.sort((a, b) => a.letter.localeCompare(b.letter)).map(item => item.text);
      correct = "ABCD".indexOf(letterAnswer);
      question = embedded.question;
    }

    // Three source records have broken option delimiters; repair them from their visible text.
    if (filename === "2019GRAMMARDAY1.txt" && sourceIndex === 81) { choices = ["water view", "waterway", "waterfall", "water square"]; correct = 2; question = "A __________ is where a river crashes down a steep slope. Choose the word that correctly completes the sentence."; }
    if (filename === "2019GRAMMARDAY1.txt" && sourceIndex === 256) { choices = ["in", "with", "on", "for"]; correct = 1; }
    if (filename === "2019GRAMMARDAY1.txt" && sourceIndex === 313) { choices = ["were", "was", "are", "is"]; correct = 0; }
    if (filename === "2019GRAMMARDAY1.txt" && sourceIndex === 371) { choices = ["rung", "ring", "ringed", "rang"]; correct = 0; }
    if (filename === "2019_DAY3-1.txt" && sourceIndex === 307) { choices = ["more", "less", "much", "least"]; correct = 3; question = embedded.question; }
    if (filename === "2019_DAY3-1.txt" && sourceIndex === 781) { choices = ["Millons", "Milions", "Milinons", "Millions"]; correct = 3; }
    if (filename === "2019_DAY3-1.txt" && sourceIndex === 996) { choices = choices.map(choice => choice.toLowerCase() === "gaggling" ? "gagging" : choice); }

    choices = choices.map(cleanText);
    const answer = choices[correct];
    const [subject, topic] = filename === "2019_DAY3-1.txt" ? day3Category(sourceIndex, question) : [fixedSubject, fixedTopic || generalTopic(question)];
    if (!question || choices.length !== 4 || correct < 0 || correct > 3 || choices.some(choice => !choice) || choices.every(choice => /^[A-D]$/i.test(choice))) {
      errors.push({ filename, sourceIndex, question, choices, correct });
      return;
    }
    records.push({
      id: `${subject === "english" ? "eng" : "gp"}-${slug(topic)}-2019-${String(sourceIndex).padStart(4, "0")}-${slug(filename).slice(0, 10)}`,
      subject, topic, difficulty: "standard", questionYear: 2019,
      text: question.replace(/\n+/g, " "), options: choices, correct,
      explanation: explanationFor(question, answer, topic), source: filename,
    });
  });
  return { records, errors, blocks: blocks.length };
}

const existing = JSON.parse(fs.readFileSync(outputFile, "utf8"));
const mathematics = existing.questions.filter(question => question.subject === "mathematics");
const parsed = sources.map(source => ({ source: source[0], ...parseSource(...source) }));
const imported = parsed.flatMap(result => result.records);
const errors = parsed.flatMap(result => result.errors);

const seen = new Set();
const deduplicated = [];
let duplicates = 0;
for (const record of imported) {
  const key = `${record.subject}|${record.text.toLowerCase()}|${record.options.map(option => option.toLowerCase()).join("|")}`;
  if (seen.has(key)) { duplicates++; continue; }
  seen.add(key); deduplicated.push(record);
}

const questions = [...mathematics, ...deduplicated];
fs.writeFileSync(outputFile, `${JSON.stringify({ version: 2, questions }, null, 2)}\n`);

const report = {
  sources: parsed.map(result => ({ file: result.source, sourceRecords: result.blocks, imported: result.records.length, errors: result.errors.length })),
  retainedMathematics: mathematics.length,
  importedBeforeDeduplication: imported.length,
  duplicatesRemoved: duplicates,
  rejectedRecords: errors,
  finalQuestions: questions.length,
  bySubject: Object.groupBy(questions, question => question.subject),
};
report.bySubject = Object.fromEntries(Object.entries(report.bySubject).map(([key, value]) => [key, value.length]));
fs.writeFileSync(path.join(root, "data", "import-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, bySubject: report.bySubject, rejectedRecords: errors.length }, null, 2));
if (errors.length) process.exitCode = 1;
