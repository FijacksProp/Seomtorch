import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const GENERATION_SCHEMA = path.join(SCRIPT_DIR, "schemas", "physics-explanation-batch.schema.json");
const REVIEW_SCHEMA = path.join(SCRIPT_DIR, "schemas", "physics-explanation-review.schema.json");
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_OLLAMA_MODEL = "qwen3:1.7b";
const DEFAULT_HOST = "http://127.0.0.1:11435";

function parseArgs(argv) {
  const config = {
    input: null,
    output: null,
    provider: "codex",
    model: DEFAULT_MODEL,
    reviewModel: DEFAULT_MODEL,
    host: DEFAULT_HOST,
    batchSize: 30,
    concurrency: 3,
    limit: Infinity,
    ids: null,
    reasoningEffort: "low",
    reviewReasoningEffort: "medium",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value.`);
      return value;
    };
    if (argument === "--input") config.input = next();
    else if (argument === "--output") config.output = next();
    else if (argument === "--provider") config.provider = next().toLowerCase();
    else if (argument === "--model") config.model = next();
    else if (argument === "--review-model") config.reviewModel = next();
    else if (argument === "--host") config.host = next().replace(/\/$/, "");
    else if (argument === "--batch-size") config.batchSize = Number(next());
    else if (argument === "--concurrency") config.concurrency = Number(next());
    else if (argument === "--limit") config.limit = Number(next());
    else if (argument === "--ids") config.ids = new Set(next().split(",").map(clean).filter(Boolean));
    else if (argument === "--reasoning-effort") config.reasoningEffort = next();
    else if (argument === "--review-reasoning-effort") config.reviewReasoningEffort = next();
    else if (argument === "--help" || argument === "-h") config.help = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!config.help && (!config.input || !config.output)) throw new Error("--input and --output are required.");
  if (!["codex", "ollama"].includes(config.provider)) throw new Error("--provider must be codex or ollama.");
  if (!Number.isInteger(config.batchSize) || config.batchSize < 1 || config.batchSize > 50) throw new Error("--batch-size must be between 1 and 50.");
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1 || config.concurrency > 4) throw new Error("--concurrency must be between 1 and 4.");
  if (!Number.isFinite(config.limit) && config.limit !== Infinity) throw new Error("--limit must be a number.");
  if (config.provider === "ollama" && config.model === DEFAULT_MODEL) config.model = DEFAULT_OLLAMA_MODEL;
  return config;
}

function usage() {
  return `Usage: node scripts/generate-physics-explanations.mjs --input PREPARED.json --output REVIEWED.json [options]

Options:
  --provider NAME            codex or ollama (default: codex)
  --model NAME               Generation model (default: ${DEFAULT_MODEL})
  --review-model NAME        Independent review model (default: ${DEFAULT_MODEL})
  --batch-size N             Questions per call, 1-50 (default: 30)
  --concurrency N            Editorial batches processed in parallel, 1-4 (default: 3)
  --limit N                  Stop after N newly processed questions
  --ids ID,ID                Process only the listed question IDs
  --reasoning-effort LEVEL   Codex generation effort (default: low)
  --review-reasoning-effort  Codex review effort (default: medium)
  --host URL                 Ollama server (default: ${DEFAULT_HOST})

Codex mode uses the existing authenticated Codex CLI session. It generates a draft,
then independently re-solves and reviews every item. Checkpoints are saved after
every question, so an interrupted run can resume safely.`;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mediaForQuestion(question) {
  const items = [];
  const append = (role, values) => {
    for (const value of values || []) {
      const absolute = path.resolve(REPO_ROOT, value);
      if (fs.existsSync(absolute)) items.push({ role, file: absolute, source: String(value).replaceAll("\\", "/") });
    }
  };
  append("question diagram", question.question_image_files);
  for (const option of question.options || []) append(`option ${option.label || "image"}`, option.image_files);
  append("source worked-solution image", question.explanation_image_files);
  return items;
}

function buildBatchMedia(questions) {
  const files = [];
  const positions = new Map();
  for (const question of questions) {
    const questionMedia = [];
    for (const item of mediaForQuestion(question)) {
      let position = files.indexOf(item.file);
      if (position < 0) {
        files.push(item.file);
        position = files.length - 1;
      }
      questionMedia.push({ attachment: position + 1, role: item.role, file: path.basename(item.source) });
    }
    positions.set(question.id, questionMedia);
  }
  return { files, positions };
}

function questionPayload(question, positions = new Map()) {
  return {
    id: question.id,
    year: question.year,
    question: question.question,
    options: question.options.map((option, index) => `${index}: ${option.text || `[image option ${option.label || index + 1}]`}`),
    supplied_correct_index: question.correct_index,
    supplied_correct_answer: question.options[question.correct_index]?.text || "",
    attached_images: positions.get(question.id) || [],
  };
}

const generationInstructions = `Act only as a meticulous senior Physics editor for a Nigerian JAMB preparation platform. Independently solve every multiple-choice item before comparing your result with the supplied answer. Return only JSON matching the schema.

Editorial rules:
- correct_index is zero-based and must identify the option you independently judge correct.
- For calculations, name the formula, substitute the values, show the decisive arithmetic, and retain correct SI units.
- For concepts, name the governing law or principle and connect it directly to the correct option.
- Check powers of ten, signs, unit conversions, ratios, vector directions, and arithmetic explicitly.
- Use attached diagrams and worked-solution images when listed for an item. Attachment numbers refer to their order in this request.
- Never invent a value that is absent from both the text and attached image.
- If indispensable information is genuinely unavailable, set exclude=true and explain why.
- If the supplied answer is wrong, correct it and give a specific answer_change_reason. Otherwise answer_change_reason must be empty.
- Write 45-90 words in clear plain text. Do not use Markdown, LaTeX delimiters, raw backslashes, headings, or conversational filler.
- Finish naturally with the answer; do not merely state that an option is correct.
- Use g = 10 m s⁻² only when that is the clear exam convention and no other value is supplied.`;

const reviewInstructions = `Act only as an independent senior Physics examiner and copy editor. Re-solve every item from first principles. Do not trust the supplied key or the draft. Return only JSON matching the schema.

For each item:
- verify the selected option, formula, substitution, arithmetic, sign, power of ten, units, and physical interpretation;
- consult any attached image mapped to the item;
- return the correct zero-based index and a final replacement explanation of 45-90 words in plain text;
- correct even subtle inconsistencies between the prose, arithmetic, and final option;
- set valid=true only when the returned answer and explanation are mutually consistent and defensible;
- set exclude=true only if the question is genuinely unsolvable, contradictory, or missing an indispensable visual;
- use high confidence for an unambiguous result, medium for a defensible convention-dependent result, and low for unresolved uncertainty;
- do not use Markdown, LaTeX delimiters, raw backslashes, headings, or conversational filler.

The review_reason must briefly state what was checked or corrected.`;

function commandForPlatform() {
  return process.platform === "win32" ? "codex.exe" : "codex";
}

function runProcess(command, args, stdin, timeoutMs = 600_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
    child.stdout.on("data", chunk => { stdout = `${stdout}${chunk}`.slice(-20_000); });
    child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-20_000); });
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}. ${clean(stderr || stdout)}`));
    });
    child.stdin.end(stdin);
  });
}

async function askCodex(config, prompt, schema, images, effort) {
  const outputFile = path.join(os.tmpdir(), `seomtorch-physics-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--color", "never",
    "--model", config.modelForCall,
    "--config", `model_reasoning_effort=\"${effort}\"`,
    "--output-schema", schema,
    "--output-last-message", outputFile,
  ];
  for (const image of images) args.push("--image", image);
  args.push("-");
  try {
    await runProcess(commandForPlatform(), args, prompt);
    if (!fs.existsSync(outputFile)) throw new Error("Codex completed without writing its structured result.");
    return JSON.parse(fs.readFileSync(outputFile, "utf8"));
  } finally {
    fs.rmSync(outputFile, { force: true });
  }
}

async function askOllama(config, prompt, schema) {
  const response = await fetch(`${config.host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.modelForCall,
      stream: false,
      think: false,
      format: JSON.parse(fs.readFileSync(schema, "utf8")),
      messages: [{ role: "user", content: prompt }],
      options: { temperature: 0.1, top_p: 0.85, num_ctx: 16384, num_predict: 7000 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return JSON.parse(payload.message.content);
}

async function ask(config, { instructions, payload, schema, images = [], model, effort }, retries = 3) {
  const prompt = `${instructions}\n\nItems:\n${JSON.stringify(payload)}`;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const callConfig = { ...config, modelForCall: model };
      return config.provider === "codex"
        ? await askCodex(callConfig, prompt, schema, images, effort)
        : await askOllama(callConfig, prompt, schema);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

function normalizedExplanation(value) {
  return clean(value)
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
    .replace(/\\times\b/g, "×")
    .replace(/\\omega\b/g, "ω")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\$+/g, "")
    .trim();
}

function explanationProblem(explanation) {
  if (explanation.length < 80) return "explanation is too short";
  if (explanation.length > 900) return "explanation is too long";
  if (/\b(?:as an ai|i cannot|cannot determine|insufficient information)\b/i.test(explanation)) return "explanation contains unresolved language";
  if (/\\(?:frac|text|times|omega|begin|end)\b|\\\(|\\\)/.test(explanation)) return "explanation contains raw LaTeX";
  return null;
}

function validateDraft(question, result) {
  if (!result || result.id !== question.id) throw new Error(`${question.id}: missing or mismatched draft.`);
  if (!Number.isInteger(result.correct_index) || result.correct_index < 0 || result.correct_index >= question.options.length) throw new Error(`${question.id}: invalid draft correct_index.`);
  const explanation = normalizedExplanation(result.explanation);
  const problem = explanationProblem(explanation);
  if (problem && !result.exclude) throw new Error(`${question.id}: ${problem}.`);
  const changed = result.correct_index !== question.correct_index;
  const reason = changed ? clean(result.answer_change_reason) : "";
  if (changed && reason.length < 20) throw new Error(`${question.id}: answer change has no adequate reason.`);
  return {
    id: question.id,
    explanation,
    confidence: result.confidence,
    proposed_correct_index: result.correct_index,
    original_correct_index: question.correct_index,
    answer_change_reason: reason,
    exclude: Boolean(result.exclude),
    exclusion_reason: clean(result.exclusion_reason),
  };
}

function validateReview(question, result) {
  if (!result || result.id !== question.id) throw new Error(`${question.id}: missing or mismatched review.`);
  if (!Number.isInteger(result.correct_index) || result.correct_index < 0 || result.correct_index >= question.options.length) throw new Error(`${question.id}: invalid reviewed correct_index.`);
  const explanation = normalizedExplanation(result.explanation);
  const problem = explanationProblem(explanation);
  if (problem && !result.exclude) throw new Error(`${question.id}: reviewed ${problem}.`);
  return {
    id: question.id,
    correct_index: result.correct_index,
    explanation,
    confidence: result.confidence,
    valid: Boolean(result.valid),
    review_reason: clean(result.review_reason),
    exclude: Boolean(result.exclude),
    exclusion_reason: clean(result.exclusion_reason),
  };
}

function reviewPayload(question, draft, positions) {
  return {
    ...questionPayload(question, positions),
    draft_correct_index: draft.proposed_correct_index,
    draft_explanation: draft.explanation,
    draft_confidence: draft.confidence,
    draft_answer_change_reason: draft.answer_change_reason,
  };
}

async function generateBatch(config, questions, media) {
  const response = await ask(config, {
    instructions: generationInstructions,
    payload: questions.map(question => questionPayload(question, media.positions)),
    schema: GENERATION_SCHEMA,
    images: media.files,
    model: config.model,
    effort: config.reasoningEffort,
  });
  const byId = new Map((response.results || []).map(result => [result.id, result]));
  const drafts = new Map();
  drafts.errors = new Map();
  for (const question of questions) {
    try {
      drafts.set(question.id, validateDraft(question, byId.get(question.id)));
    } catch (error) {
      drafts.errors.set(question.id, error);
    }
  }
  return drafts;
}

async function reviewBatch(config, questions, drafts, media) {
  const response = await ask(config, {
    instructions: reviewInstructions,
    payload: questions.map(question => reviewPayload(question, drafts.get(question.id), media.positions)),
    schema: REVIEW_SCHEMA,
    images: media.files,
    model: config.reviewModel,
    effort: config.reviewReasoningEffort,
  });
  const byId = new Map((response.results || []).map(result => [result.id, result]));
  const reviews = new Map();
  reviews.errors = new Map();
  for (const question of questions) {
    try {
      reviews.set(question.id, validateReview(question, byId.get(question.id)));
    } catch (error) {
      reviews.errors.set(question.id, error);
    }
  }
  return reviews;
}

async function resolveDisagreement(config, question, draft, review, media) {
  const instructions = `${reviewInstructions}\n\nThis is a final tie-break. Two earlier passes disagreed. Recalculate the item carefully and return one unambiguous final decision. Set confidence=high only if the answer follows decisively.`;
  const response = await ask(config, {
    instructions,
    payload: [{
      ...reviewPayload(question, draft, media.positions),
      first_review_correct_index: review.correct_index,
      first_review_explanation: review.explanation,
      first_review_reason: review.review_reason,
    }],
    schema: REVIEW_SCHEMA,
    images: media.files,
    model: config.reviewModel,
    effort: "high",
  });
  return validateReview(question, response.results?.[0]);
}

function loadCheckpoint(file, config) {
  if (!fs.existsSync(file)) {
    return {
      version: 2,
      provider: config.provider,
      generation_model: config.model,
      review_model: config.reviewModel,
      generated_at: new Date().toISOString(),
      entries: {},
      exclusions: {},
      answer_audit: {},
    };
  }
  const checkpoint = JSON.parse(fs.readFileSync(file, "utf8"));
  checkpoint.entries ||= {};
  checkpoint.exclusions ||= {};
  checkpoint.answer_audit ||= {};
  return checkpoint;
}

function saveCheckpoint(file, checkpoint) {
  checkpoint.updated_at = new Date().toISOString();
  checkpoint.completed = Object.keys(checkpoint.entries).length;
  checkpoint.excluded = Object.keys(checkpoint.exclusions).length;
  checkpoint.answer_changes = Object.values(checkpoint.answer_audit).filter(item => item.applied).length;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function recordExclusion(checkpoint, question, reason, details = {}) {
  checkpoint.exclusions[question.id] = {
    reason: clean(reason) || "The item did not pass the independent editorial review.",
    confidence: details.confidence || "low",
    source_url: question.source_url || "",
    ...details,
  };
}

async function processQuestion(config, checkpoint, question, draft, initialReview, media) {
  if (draft.exclude) {
    recordExclusion(checkpoint, question, draft.exclusion_reason, { confidence: draft.confidence, stage: "generation" });
    return;
  }
  if (initialReview.exclude || !initialReview.valid || initialReview.confidence === "low") {
    recordExclusion(checkpoint, question, initialReview.exclusion_reason || initialReview.review_reason, { confidence: initialReview.confidence, stage: "review" });
    return;
  }

  let finalReview = initialReview;
  const disagreement = draft.proposed_correct_index !== initialReview.correct_index;
  const proposedCorrection = initialReview.correct_index !== question.correct_index;
  const correctionNeedsTieBreak = proposedCorrection && (disagreement || draft.confidence !== "high" || initialReview.confidence !== "high");
  if (disagreement || correctionNeedsTieBreak) finalReview = await resolveDisagreement(config, question, draft, initialReview, media);

  if (finalReview.exclude || !finalReview.valid || finalReview.confidence !== "high") {
    recordExclusion(checkpoint, question, finalReview.exclusion_reason || finalReview.review_reason || "The final verification was not decisive.", {
      confidence: finalReview.confidence,
      stage: "tie_break",
    });
    return;
  }

  const correctedIndex = finalReview.correct_index;
  const answerChanged = correctedIndex !== question.correct_index;
  const agreementCount = [draft.proposed_correct_index, initialReview.correct_index, finalReview.correct_index]
    .filter(index => index === correctedIndex).length;
  if (answerChanged && agreementCount < 2) {
    recordExclusion(checkpoint, question, "A proposed answer correction did not receive two independent matching decisions.", {
      confidence: finalReview.confidence,
      stage: "answer_correction",
    });
    return;
  }

  const answerChangeReason = answerChanged ? clean(finalReview.review_reason || draft.answer_change_reason) : "";
  checkpoint.entries[question.id] = {
    explanation: finalReview.explanation,
    reviewed_by: `Seomtorch Physics editorial pass (${config.model} + ${config.reviewModel} verification)`,
    reviewed_at: new Date().toISOString(),
    corrected_index: correctedIndex,
    answer_change_reason: answerChangeReason,
    confidence: finalReview.confidence,
  };
  if (answerChanged || disagreement) {
    checkpoint.answer_audit[question.id] = {
      original_index: question.correct_index,
      generation_index: draft.proposed_correct_index,
      review_index: initialReview.correct_index,
      final_index: correctedIndex,
      applied_index: correctedIndex,
      applied: answerChanged,
      generation_reason: draft.answer_change_reason,
      review_reason: initialReview.review_reason,
      final_reason: finalReview.review_reason,
    };
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return console.log(usage());
  const prepared = JSON.parse(fs.readFileSync(config.input, "utf8"));
  const checkpoint = loadCheckpoint(config.output, config);
  const eligible = (prepared.questions || []).filter(question =>
    !question.quality_flags?.includes("missing_visual_media")
    && (!config.ids || config.ids.has(question.id)));
  const pending = eligible
    .filter(question => !checkpoint.entries[question.id] && !checkpoint.exclusions[question.id])
    .slice(0, config.limit);
  console.log(`${eligible.length} eligible; ${pending.length} pending; ${Object.keys(checkpoint.entries).length} completed; ${Object.keys(checkpoint.exclusions).length} excluded.`);

  async function prepareBatch(batch, batchNumber) {
    const media = buildBatchMedia(batch);
    let drafts = new Map();
    let reviews = new Map();
    try {
      drafts = await generateBatch(config, batch, media);
      const reviewable = batch.filter(question => drafts.has(question.id));
      if (reviewable.length) reviews = await reviewBatch(config, reviewable, drafts, buildBatchMedia(reviewable));
    } catch (batchError) {
      console.warn(`Batch ${batchNumber} call failed and will be recovered item by item: ${batchError.message}`);
    }

    const recovery = batch.filter(question => !drafts.has(question.id) || !reviews.has(question.id));
    if (recovery.length) console.warn(`Batch ${batchNumber}: recovering ${recovery.length} item(s) individually.`);
    await Promise.all(recovery.map(async question => {
      const singleMedia = buildBatchMedia([question]);
      try {
        const singleDrafts = await generateBatch(config, [question], singleMedia);
        if (!singleDrafts.has(question.id)) throw singleDrafts.errors?.get(question.id) || new Error("Draft validation failed.");
        const singleReviews = await reviewBatch(config, [question], singleDrafts, singleMedia);
        if (!singleReviews.has(question.id)) throw singleReviews.errors?.get(question.id) || new Error("Review validation failed.");
        drafts.set(question.id, singleDrafts.get(question.id));
        reviews.set(question.id, singleReviews.get(question.id));
      } catch (error) {
        recordExclusion(checkpoint, question, `Editorial generation failed after retries: ${error.message}`, { stage: "generation_error" });
      }
    }));
    if (recovery.length) saveCheckpoint(config.output, checkpoint);
    return { batch, drafts, reviews };
  }

  const batches = [];
  for (let offset = 0; offset < pending.length; offset += config.batchSize) batches.push(pending.slice(offset, offset + config.batchSize));
  let processed = 0;
  for (let groupOffset = 0; groupOffset < batches.length; groupOffset += config.concurrency) {
    const group = batches.slice(groupOffset, groupOffset + config.concurrency);
    const preparedBatches = await Promise.all(group.map((batch, index) => prepareBatch(batch, groupOffset + index + 1)));
    const finalWork = preparedBatches.flatMap(({ batch, drafts, reviews }) =>
      batch.filter(question => drafts.has(question.id) && reviews.has(question.id))
        .map(question => ({ question, draft: drafts.get(question.id), review: reviews.get(question.id) })));
    for (let workOffset = 0; workOffset < finalWork.length; workOffset += config.concurrency) {
      const workGroup = finalWork.slice(workOffset, workOffset + config.concurrency);
      await Promise.all(workGroup.map(async ({ question, draft, review }) => {
        try {
          await processQuestion(config, checkpoint, question, draft, review, buildBatchMedia([question]));
        } catch (error) {
          recordExclusion(checkpoint, question, `Final editorial verification failed: ${error.message}`, { stage: "verification_error" });
        }
      }));
      saveCheckpoint(config.output, checkpoint);
    }
    processed += group.reduce((total, batch) => total + batch.length, 0);
    console.log(`${processed}/${pending.length} processed · ${checkpoint.completed} completed · ${checkpoint.excluded} excluded · ${checkpoint.answer_changes} answer corrections`);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
