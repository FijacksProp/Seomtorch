import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PLACEHOLDER_EXPLANATION = /^(?:no explanation available|no official explanation is available(?:\s+for this question)?(?:\s+at this time)?[.!]?)$/i;
const VISUAL_REFERENCE = /\b(?:diagram|figure|graph|illustration|waveform|circuit\s+(?:above|below)|as\s+shown|shown\s+(?:above|below|in)|arrangement\s+(?:above|below))\b/i;

function usage() {
  console.log(`
Prepare and quality-check an extracted MySchool question collection

Usage:
  node scripts/prepare-myschool-questions.mjs --input RAW_JSON [options]

Options:
  --input PATH          Raw extractor JSON (required)
  --output PATH         Prepared JSON (default: INPUT.prepared.json)
  --queue PATH          Explanation review queue (default: INPUT.explanations.todo.json)
  --explanations PATH   Reviewed explanation map to merge
  --help                Show this help

Reviewed explanation map:
  {
    "myschool-physics-295": {
      "explanation": "Clear, checked reasoning...",
      "reviewed_by": "Name",
      "reviewed_at": "2026-08-27T00:00:00Z"
    }
  }
`);
}

function parseArgs(argv) {
  const config = { input: null, output: null, queue: null, explanations: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      index += 1;
      return path.resolve(value);
    };
    if (argument === "--help") config.help = true;
    else if (argument === "--input") config.input = next();
    else if (argument === "--output") config.output = next();
    else if (argument === "--queue") config.queue = next();
    else if (argument === "--explanations") config.explanations = next();
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (config.help) return config;
  if (!config.input) throw new Error("--input is required.");
  if (!fs.existsSync(config.input)) throw new Error(`Input file was not found: ${config.input}`);
  const base = config.input.replace(/\.raw\.json$/i, "").replace(/\.json$/i, "");
  config.output ||= `${base}.prepared.json`;
  config.queue ||= `${base}.explanations.todo.json`;
  return config;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function meaningfulExplanation(value) {
  const text = cleanText(value);
  return text && !PLACEHOLDER_EXPLANATION.test(text) ? text : null;
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filename);
}

function duplicateKey(question) {
  return `${cleanText(question.question).toLowerCase()}|${(question.options || []).map(option =>
    cleanText(option.text || (option.image_urls || []).join("|")).toLowerCase()).join("|")}`;
}

function mediaFiles(question) {
  return [
    ...(question.question_image_files || []),
    ...(question.options || []).flatMap(option => option.image_files || []),
    ...(question.explanation_image_files || []),
  ].filter(Boolean);
}

function remoteMedia(question) {
  return [
    ...(question.question_image_urls || []),
    ...(question.options || []).flatMap(option => option.image_urls || []),
    ...(question.explanation_image_urls || []),
  ];
}

function validateReviewedExplanation(question, entry) {
  const value = typeof entry === "string" ? { explanation: entry } : entry;
  const explanation = meaningfulExplanation(value?.explanation);
  if (!explanation || explanation.length < 40) {
    throw new Error(`${question.id}: reviewed explanation must contain at least 40 meaningful characters.`);
  }
  if (!value.reviewed_by || !value.reviewed_at || Number.isNaN(Date.parse(value.reviewed_at))) {
    throw new Error(`${question.id}: reviewed_by and a valid reviewed_at timestamp are required.`);
  }
  let correctedIndex = question.correct_index;
  let answerChangeReason = "";
  if (value.corrected_index !== undefined && value.corrected_index !== question.correct_index) {
    correctedIndex = Number(value.corrected_index);
    answerChangeReason = cleanText(value.answer_change_reason);
    if (!Number.isInteger(correctedIndex) || correctedIndex < 0 || correctedIndex >= question.options.length) throw new Error(`${question.id}: corrected_index is outside the available options.`);
    if (answerChangeReason.length < 20) throw new Error(`${question.id}: an answer correction requires a specific reason.`);
  }
  return { explanation, reviewed_by: cleanText(value.reviewed_by), reviewed_at: new Date(value.reviewed_at).toISOString(), corrected_index: correctedIndex, answer_change_reason: answerChangeReason };
}

function prepareCollection(raw, reviewed = {}) {
  const editorialExclusions = reviewed.exclusions || {};
  reviewed = reviewed.entries || reviewed;
  const seen = new Map();
  const duplicates = [];
  const questions = [];
  const queue = [];

  for (const sourceQuestion of raw.questions || []) {
    const key = duplicateKey(sourceQuestion);
    if (seen.has(key)) {
      duplicates.push({ id: sourceQuestion.id, duplicate_of: seen.get(key) });
      continue;
    }
    seen.set(key, sourceQuestion.id);
    const question = structuredClone(sourceQuestion);
    const sourceExplanation = meaningfulExplanation(question.explanation);
    let explanation = sourceExplanation;
    let explanationSource = sourceExplanation ? "myschool" : null;
    let explanationStatus = sourceExplanation ? "source_unreviewed" : "missing";
    let explanationReview = null;

    if (reviewed[question.id]) {
      explanationReview = validateReviewedExplanation(question, reviewed[question.id]);
      explanation = explanationReview.explanation;
      explanationSource = "seomtorch_editorial";
      explanationStatus = "reviewed";
      if (explanationReview.corrected_index !== question.correct_index) {
        const originalIndex = question.correct_index;
        question.correct_index = explanationReview.corrected_index;
        question.correct_option = question.options[question.correct_index]?.label || String.fromCharCode(65 + question.correct_index);
        question.answer_review = { original_index: originalIndex, corrected_index: question.correct_index, reason: explanationReview.answer_change_reason, reviewed_by: explanationReview.reviewed_by, reviewed_at: explanationReview.reviewed_at };
      }
    }

    question.explanation = explanation;
    question.explanation_source = explanationSource;
    question.explanation_status = explanationStatus;
    question.explanation_review = explanationReview
      ? { reviewed_by: explanationReview.reviewed_by, reviewed_at: explanationReview.reviewed_at }
      : null;
    question.quality_flags = [...new Set((question.quality_flags || []).filter(flag =>
      !["missing_explanation", "missing_visual_media", "editorial_excluded"].includes(flag)))];
    if (editorialExclusions[question.id]) {
      question.quality_flags.push("editorial_excluded");
      question.editorial_exclusion = editorialExclusions[question.id];
    }
    if (!explanation) question.quality_flags.push("missing_explanation");
    const hasQuestionMedia = (question.question_image_urls || []).length
      || (question.options || []).some(option => (option.image_urls || []).length);
    if (VISUAL_REFERENCE.test(question.question || "") && !hasQuestionMedia) question.quality_flags.push("missing_visual_media");
    if (remoteMedia(question).length && !mediaFiles(question).length) question.quality_flags.push("media_not_downloaded");

    if (!explanation) {
      const correct = question.options?.[question.correct_index];
      queue.push({
        id: question.id,
        source_url: question.source_url,
        subject: question.subject,
        exam_type: question.exam_type,
        year: question.year,
        question: question.question,
        options: question.options?.map(option => ({ label: option.label, text: option.text, image_files: option.image_files || [] })),
        correct_option: question.correct_option,
        correct_answer: correct?.text || null,
        question_image_files: question.question_image_files || [],
        explanation_image_files: question.explanation_image_files || [],
        blocked_by_missing_visual: question.quality_flags.includes("missing_visual_media"),
        editorial_requirements: [
          "Solve independently before consulting the supplied answer key.",
          "If the independent result disagrees with the key, flag the record instead of rationalizing it.",
          "State the governing principle or formula and show only the steps needed by a learner.",
          "Use clear SI units and finish by identifying the correct option.",
        ],
      });
    }
    questions.push(question);
  }

  return {
    prepared: {
      version: 1,
      source: raw.source,
      subject: raw.subject,
      exam_type: raw.exam_type,
      source_collection: raw.collection,
      prepared_at: new Date().toISOString(),
      quality: {
        source_questions: (raw.questions || []).length,
        prepared_questions: questions.length,
        duplicates_removed: duplicates.length,
        reviewed_explanations: questions.filter(question => question.explanation_status === "reviewed").length,
        source_explanations: questions.filter(question => question.explanation_status === "source_unreviewed").length,
        missing_explanations: questions.filter(question => question.explanation_status === "missing").length,
        missing_visual_media: questions.filter(question => question.quality_flags.includes("missing_visual_media")).length,
        corrected_answers: questions.filter(question => question.answer_review).length,
        editorial_exclusions: questions.filter(question => question.quality_flags.includes("editorial_excluded")).length,
        unresolved_source_failures: (raw.failures || []).length,
        duplicates,
      },
      failures: raw.failures || [],
      questions,
    },
    queue: {
      version: 1,
      subject: raw.subject,
      generated_at: new Date().toISOString(),
      total: queue.length,
      blocked_by_missing_visual: queue.filter(item => item.blocked_by_missing_visual).length,
      instructions: "Add reviewed explanations to a separate keyed JSON file; never edit this generated queue in place.",
      questions: queue,
    },
  };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return usage();
  const raw = JSON.parse(fs.readFileSync(config.input, "utf8"));
  const reviewed = config.explanations
    ? JSON.parse(fs.readFileSync(config.explanations, "utf8"))
    : {};
  const result = prepareCollection(raw, reviewed);
  writeJson(config.output, result.prepared);
  writeJson(config.queue, result.queue);
  console.log(`Prepared ${result.prepared.quality.prepared_questions} questions; removed ${result.prepared.quality.duplicates_removed} duplicate(s).`);
  console.log(`${result.queue.total} explanation(s) remain in the review queue.`);
  console.log(`Wrote ${config.output}`);
  console.log(`Wrote ${config.queue}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(`Preparation stopped: ${error.message}`);
    process.exitCode = 1;
  }
}

export { meaningfulExplanation, parseArgs, prepareCollection, validateReviewedExplanation };
