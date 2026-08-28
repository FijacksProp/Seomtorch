import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function usage() {
  return `Usage: node scripts/build-myschool-pack.mjs --input PREPARED.json --output data/questions-SUBJECT.json

Builds a deployable Seomtorch question pack from a reviewed Myschool preparation file.
Questions flagged as missing required visual media are excluded automatically.`;
}

function parseArgs(argv) {
  const config = { input: null, output: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value.`);
      return value;
    };
    if (argument === "--input") config.input = next();
    else if (argument === "--output") config.output = next();
    else if (argument === "--help" || argument === "-h") config.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!config.help && (!config.input || !config.output)) throw new Error("Both --input and --output are required.");
  return config;
}

function webPath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

export function buildPack(prepared) {
  const excluded = [];
  const questions = [];
  for (const item of prepared.questions || []) {
    const flags = Array.isArray(item.quality_flags) ? item.quality_flags : [];
    if (flags.includes("missing_visual_media") || flags.includes("editorial_excluded")) {
      excluded.push({ id: item.id, reason: flags.includes("missing_visual_media") ? "missing_visual_media" : "editorial_excluded" });
      continue;
    }
    if (!Array.isArray(item.options) || item.options.length < 2 || !Number.isInteger(item.correct_index)) {
      excluded.push({ id: item.id, reason: "invalid_answer_structure" });
      continue;
    }
    questions.push({
      id: item.id,
      subject: item.subject,
      topic: item.topic || "Mixed JAMB questions",
      difficulty: item.difficulty || "standard",
      questionYear: item.year || null,
      text: item.question,
      options: item.options.map(option => option.text),
      correct: item.correct_index,
      explanation: item.explanation || "",
      explanationStatus: item.explanation_status || (item.explanation ? "source_unreviewed" : "missing"),
      image_url: webPath(item.question_image_files?.[0]),
      explanation_image_url: webPath(item.explanation_image_files?.[0]),
      quality_flags: flags,
      source: item.source || "myschool",
      source_url: item.source_url || "",
    });
  }
  return {
    version: 3,
    subject: prepared.subject,
    generated_at: new Date().toISOString(),
    quality: {
      source_questions: prepared.questions?.length || 0,
      published_questions: questions.length,
      excluded_questions: excluded.length,
      reviewed_explanations: questions.filter(question => question.explanationStatus === "reviewed").length,
      explanations_pending: questions.filter(question => question.explanationStatus !== "reviewed").length,
      excluded,
    },
    questions,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = parseArgs(process.argv.slice(2));
    if (config.help) {
      console.log(usage());
      process.exit(0);
    }
    const prepared = JSON.parse(fs.readFileSync(config.input, "utf8"));
    const pack = buildPack(prepared);
    fs.mkdirSync(path.dirname(config.output), { recursive: true });
    fs.writeFileSync(config.output, `${JSON.stringify(pack, null, 2)}\n`);
    console.log(`Published ${pack.quality.published_questions} ${pack.subject} questions; excluded ${pack.quality.excluded_questions}.`);
    console.log(`Wrote ${config.output}`);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(1);
  }
}
