import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const BASE_URL = "https://myschool.ng";
const DEFAULT_SUBJECTS = ["physics", "biology"];
const CHECKPOINT_VERSION = 2;
const USER_AGENT = "SeomtorchQuestionImporter/1.0 (+authorized educational archive)";

function usage() {
  console.log(`
Authorized MySchool question importer

Usage:
  npm run questions:myschool -- [options]

Options:
  --url URL                   Classroom listing URL; repeat for more subjects
  --links-file PATH           Text file containing one classroom URL per line
  --subjects physics,biology  Legacy JAMB shortcut (default: physics,biology)
  --output-dir PATH           Raw JSON/checkpoint directory (default: data/imports/myschool)
  --delay-ms NUMBER           Minimum delay between requests (default: 1250)
  --start-page NUMBER         First listing page (default: 1)
  --max-pages NUMBER          Limit pages per collection; useful for a sample run
  --max-questions NUMBER      Limit details per collection; useful for a sample run
  --retries NUMBER            Retries for transient failures (default: 4)
  --timeout-ms NUMBER         Per-request timeout (default: 30000)
  --refresh                   Fetch pages/questions already in the checkpoint again
  --help                      Show this help

The importer is resumable. Re-run the same command after interruption and it will
continue from its checkpoint. Use --refresh only when the source site has changed.

Examples:
  npm run questions:myschool -- "https://myschool.ng/classroom/chemistry?exam_type=jamb"
  npm run questions:myschool -- --url "https://myschool.ng/classroom/mathematics?exam_type=jamb" --url "https://myschool.ng/classroom/government?exam_type=jamb"
  npm run questions:myschool -- --links-file myschool-links.txt
`);
}

function parsePositiveInteger(value, name, { allowZero = false } = {}) {
  const number = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return number;
}

function parseArgs(argv) {
  const config = {
    subjects: null,
    sourceUrls: [],
    linksFile: null,
    outputDir: path.join(process.cwd(), "data", "imports", "myschool"),
    delayMs: 1250,
    startPage: 1,
    maxPages: null,
    maxQuestions: null,
    retries: 4,
    timeoutMs: 30_000,
    refresh: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      index += 1;
      return value;
    };
    if (argument === "--help") return { ...config, help: true };
    if (argument === "--refresh") config.refresh = true;
    else if (argument === "--subjects") config.subjects = next().split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
    else if (argument === "--url") config.sourceUrls.push(next());
    else if (argument === "--links-file") config.linksFile = path.resolve(next());
    else if (argument === "--output-dir") config.outputDir = path.resolve(next());
    else if (argument === "--delay-ms") config.delayMs = parsePositiveInteger(next(), argument, { allowZero: true });
    else if (argument === "--start-page") config.startPage = parsePositiveInteger(next(), argument);
    else if (argument === "--max-pages") config.maxPages = parsePositiveInteger(next(), argument);
    else if (argument === "--max-questions") config.maxQuestions = parsePositiveInteger(next(), argument);
    else if (argument === "--retries") config.retries = parsePositiveInteger(next(), argument, { allowZero: true });
    else if (argument === "--timeout-ms") config.timeoutMs = parsePositiveInteger(next(), argument);
    else if (/^https?:\/\//i.test(argument)) config.sourceUrls.push(argument);
    else throw new Error(`Unknown option or invalid URL: ${argument}`);
  }

  if (config.linksFile) {
    if (!fs.existsSync(config.linksFile)) throw new Error(`Links file was not found: ${config.linksFile}`);
    const fileUrls = fs.readFileSync(config.linksFile, "utf8")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));
    config.sourceUrls.push(...fileUrls);
  }
  if (config.subjects === null && !config.sourceUrls.length) config.subjects = DEFAULT_SUBJECTS;
  for (const subject of config.subjects || []) {
    if (!/^[a-z0-9-]+$/.test(subject)) throw new Error(`Invalid subject slug: ${subject}`);
    config.sourceUrls.push(`${BASE_URL}/classroom/${subject}?exam_type=jamb`);
  }
  config.collections = [...new Map(config.sourceUrls.map(value => {
    const collection = parseCollectionUrl(value);
    return [collection.key, collection];
  })).values()];
  if (!config.collections.length) throw new Error("At least one classroom listing URL is required.");
  return config;
}

function safeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseCollectionUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid classroom URL: ${value}`);
  }
  if (url.protocol !== "https:" || !/(^|\.)myschool\.ng$/i.test(url.hostname)) {
    throw new Error(`Only HTTPS classroom links on myschool.ng are accepted: ${value}`);
  }
  const match = url.pathname.match(/^\/classroom\/([^/]+)\/?$/i);
  if (!match) throw new Error(`Use a subject listing link, not an individual question link: ${value}`);
  const subject = safeSlug(match[1]);
  if (!subject) throw new Error(`The subject could not be read from: ${value}`);

  url.hostname = "myschool.ng";
  url.hash = "";
  url.searchParams.delete("page");
  const orderedFilters = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  url.search = "";
  for (const [key, filterValue] of orderedFilters) url.searchParams.append(key, filterValue);
  const examType = safeSlug(url.searchParams.get("exam_type")) || null;
  const filterSlug = orderedFilters.length === 1 && orderedFilters[0][0] === "exam_type"
    ? examType || "exam-type-unspecified"
    : orderedFilters.length
      ? orderedFilters.map(([key, filterValue]) => `${safeSlug(key)}-${safeSlug(filterValue)}`).join("-")
      : "all";
  return {
    key: `${subject}-${filterSlug}`,
    subject,
    examType,
    url: url.href,
    filters: Object.fromEntries(orderedFilters),
  };
}

function listingPageUrl(collection, page) {
  const url = new URL(collection.url);
  url.searchParams.set("page", String(page));
  return url.href;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nodeText($, node) {
  if (!node?.length) return "";
  const clone = node.clone();
  clone.find("br").replaceWith("\n");
  return cleanText(clone.text());
}

function absoluteUrl(value, baseUrl) {
  if (!value || value.startsWith("data:")) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function imageUrls($, scope, baseUrl) {
  const urls = [];
  scope.find("img").addBack("img").each((_, image) => {
    const element = $(image);
    const candidate = element.attr("src") || element.attr("data-src") || element.attr("data-lazy-src");
    const resolved = absoluteUrl(candidate, baseUrl);
    if (resolved && !urls.includes(resolved)) urls.push(resolved);
  });
  return urls;
}

function getQuestionId(url, subject) {
  const match = new URL(url).pathname.match(new RegExp(`^/classroom/${subject}/(\\d+)/?$`, "i"));
  return match?.[1] || null;
}

function parseListing(html, subject, pageUrl) {
  const $ = cheerio.load(html);
  const urls = [];
  $(`a[href*="/classroom/${subject}/"]`).each((_, anchor) => {
    const href = $(anchor).attr("href");
    const url = absoluteUrl(href, pageUrl);
    if (url && getQuestionId(url, subject) && !urls.includes(url)) urls.push(url);
  });

  const numericButtons = $("button")
    .map((_, button) => cleanText($(button).text()))
    .get()
    .filter(value => /^\d+$/.test(value))
    .map(Number)
    .filter(value => value > 0 && value < 10_000);
  const totalPages = numericButtons.length ? Math.max(...numericButtons) : null;
  return { urls, totalPages };
}

function findExplanation($, sourceUrl) {
  const heading = $("h1,h2,h3,h4,h5,h6")
    .filter((_, node) => cleanText($(node).text()).toLowerCase() === "explanation")
    .first();
  if (!heading.length) return { text: null, imageUrls: [] };

  const section = heading.parent().parent();
  const preferred = section.find("p.text-tx_secondary").first();
  let text = nodeText($, preferred);
  if (!text) {
    const directParagraph = section.children("p").first();
    text = nodeText($, directParagraph);
  }
  return {
    text: text || null,
    imageUrls: imageUrls($, section, sourceUrl),
  };
}

function parseDetail(html, expectedSubject, sourceUrl, expectedExamType = null) {
  const $ = cheerio.load(html);
  const heading = $("h1").filter((_, node) => cleanText($(node).text()).length > 5).first();
  if (!heading.length) throw new Error("Question heading was not found.");

  const subjectLink = heading.parent().find('a[href^="/classroom/"]').first();
  const pageSubject = subjectLink.attr("href")?.match(/^\/classroom\/([^/?#]+)/)?.[1]?.toLowerCase() || expectedSubject;
  if (pageSubject !== expectedSubject) {
    throw new Error(`Subject mismatch: expected ${expectedSubject}, found ${pageSubject}.`);
  }

  const questionText = nodeText($, heading);
  const questionContainer = heading.parent();
  const optionsContainer = questionContainer.next();
  const options = [];

  optionsContainer.children("div").each((_, card) => {
    const cardElement = $(card);
    const label = cardElement.find("span").map((__, span) => cleanText($(span).text()).toUpperCase()).get().find(value => /^[A-E]$/.test(value));
    const textElement = cardElement.find("p.font-medium").first();
    const text = nodeText($, textElement);
    if (!label || (!text && !imageUrls($, cardElement, sourceUrl).length)) return;
    options.push({
      label,
      text: text || null,
      image_urls: imageUrls($, cardElement, sourceUrl),
    });
  });

  const correctBadge = $("*").filter((_, node) => /^Correct (?:Option|Answer)\s*[A-E]$/i.test(cleanText($(node).text())) && $(node).find("span").length).first();
  let correctOption = correctBadge.find("span").map((_, span) => cleanText($(span).text()).toUpperCase()).get().find(value => /^[A-E]$/.test(value));
  if (!correctOption) {
    const highlighted = optionsContainer.children("div").filter((_, card) => /DFFFEC|0C5132/i.test($(card).attr("class") || "")).first();
    correctOption = highlighted.find("span").map((_, span) => cleanText($(span).text()).toUpperCase()).get().find(value => /^[A-E]$/.test(value));
  }

  const yearText = questionContainer.find('a[href*="exam_year="]').first().text();
  const year = Number(yearText.match(/(?:19|20)\d{2}/)?.[0]) || null;
  const explanation = findExplanation($, sourceUrl);
  const sourceId = getQuestionId(sourceUrl, expectedSubject);
  const questionImages = imageUrls($, heading, sourceUrl);
  const correctIndex = options.findIndex(option => option.label === correctOption);

  if (!questionText) throw new Error("Question text was empty.");
  if (options.length < 2) throw new Error(`Only ${options.length} answer option(s) were found.`);
  if (!correctOption || correctIndex < 0) throw new Error("The correct option could not be matched to the extracted options.");

  const qualityFlags = [];
  if (!year) qualityFlags.push("missing_year");
  if (!explanation.text) qualityFlags.push("missing_explanation");
  if (questionImages.length || options.some(option => option.image_urls.length)) qualityFlags.push("has_images");
  if (options.length < 4 || options.length > 5) qualityFlags.push("unusual_option_count");

  return {
    id: `myschool-${expectedSubject}-${sourceId}`,
    source: "myschool",
    source_id: sourceId,
    source_url: sourceUrl,
    subject: expectedSubject,
    exam_type: expectedExamType,
    year,
    question: questionText,
    question_image_urls: questionImages,
    options,
    correct_option: correctOption,
    correct_index: correctIndex,
    explanation: explanation.text,
    explanation_image_urls: explanation.imageUrls,
    quality_flags: qualityFlags,
    scraped_at: new Date().toISOString(),
  };
}

function emptyState(collection) {
  return {
    version: CHECKPOINT_VERSION,
    source: "myschool",
    collection,
    subject: collection.subject,
    exam_type: collection.examType,
    pages: {},
    questions: {},
    failures: {},
    discovered_total_pages: null,
    updated_at: null,
  };
}

function loadState(filename, collection) {
  if (!fs.existsSync(filename)) return emptyState(collection);
  const state = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (state.version === 1 && state.subject === collection.subject && collection.examType === "jamb") {
    state.version = CHECKPOINT_VERSION;
    state.collection = collection;
    state.exam_type = collection.examType;
    return state;
  }
  if (state.version !== CHECKPOINT_VERSION || state.collection?.key !== collection.key) {
    throw new Error(`Checkpoint ${filename} is incompatible with this importer.`);
  }
  return state;
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temporary, filename);
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "EPERM") throw error;
    fs.rmSync(filename, { force: true });
    fs.renameSync(temporary, filename);
  }
}

function summarize(collection, state, expectedPages, pageRange) {
  const questions = Object.values(state.questions).sort((a, b) => Number(a.source_id) - Number(b.source_id));
  const duplicateKeys = new Map();
  const duplicates = [];
  for (const question of questions) {
    const key = `${question.question.toLowerCase()}|${question.options.map(option => (option.text || option.image_urls.join("|")).toLowerCase()).join("|")}`;
    if (duplicateKeys.has(key)) duplicates.push({ id: question.id, duplicate_of: duplicateKeys.get(key) });
    else duplicateKeys.set(key, question.id);
  }
  const counts = flag => questions.filter(question => question.quality_flags.includes(flag)).length;
  const collectedPages = Object.keys(state.pages).filter(page => Number(page) >= pageRange.start && Number(page) <= pageRange.end);
  const discoveredUrls = new Set(collectedPages.flatMap(page => state.pages[page] || []));
  const discoveredIds = [...discoveredUrls].map(url => getQuestionId(url, collection.subject)).filter(Boolean);
  const extractedDiscovered = discoveredIds.filter(id => state.questions[id]).length;
  const failedDiscovered = discoveredIds.filter(id => state.failures[id]).length;
  return {
    version: 1,
    source: "myschool",
    collection: {
      key: collection.key,
      source_url: collection.url,
      filters: collection.filters,
      expected_pages: expectedPages,
      pages_collected: collectedPages.length,
      question_urls_discovered: discoveredUrls.size,
      questions_extracted: questions.length,
      selected_questions_extracted: extractedDiscovered,
      failed_questions: failedDiscovered,
      complete: expectedPages !== null && collectedPages.length >= expectedPages && extractedDiscovered === discoveredUrls.size && failedDiscovered === 0,
    },
    subject: collection.subject,
    exam_type: collection.examType,
    generated_at: new Date().toISOString(),
    quality: {
      with_explanations: questions.length - counts("missing_explanation"),
      missing_explanations: counts("missing_explanation"),
      with_images: counts("has_images"),
      missing_years: counts("missing_year"),
      unusual_option_counts: counts("unusual_option_count"),
      exact_duplicates: duplicates,
    },
    failures: Object.values(state.failures),
    questions,
  };
}

function createRequester(config) {
  let lastRequestAt = 0;
  return async function request(url) {
    let lastError;
    for (let attempt = 0; attempt <= config.retries; attempt += 1) {
      const wait = Math.max(0, config.delayMs - (Date.now() - lastRequestAt));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        lastRequestAt = Date.now();
        const response = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status} ${response.statusText}`);
          error.status = response.status;
          throw error;
        }
        return await response.text();
      } catch (error) {
        lastError = error;
        const transient = error.name === "AbortError" || !error.status || error.status === 429 || error.status >= 500;
        if (!transient || attempt === config.retries) break;
        const backoff = Math.min(30_000, 1_000 * (2 ** attempt)) + Math.floor(Math.random() * 500);
        console.warn(`  Request failed (${error.message}); retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  };
}

async function collectCollection(collection, config, request) {
  const { subject, examType, key } = collection;
  const checkpointFile = path.join(config.outputDir, `${key}.checkpoint.json`);
  const outputFile = path.join(config.outputDir, `${key}.raw.json`);
  const legacyCheckpointFile = path.join(config.outputDir, `${subject}.checkpoint.json`);
  const stateFile = !fs.existsSync(checkpointFile) && examType === "jamb" && fs.existsSync(legacyCheckpointFile)
    ? legacyCheckpointFile
    : checkpointFile;
  const state = loadState(stateFile, collection);
  const save = () => {
    state.updated_at = new Date().toISOString();
    writeJson(checkpointFile, state);
  };

  const label = `${subject}${examType ? ` · ${examType}` : ""}`.toUpperCase();
  console.log(`\n${label}: collecting listing pages`);
  const firstUrl = listingPageUrl(collection, config.startPage);
  if (config.refresh || !state.pages[config.startPage]) {
    const parsed = parseListing(await request(firstUrl), subject, firstUrl);
    if (!parsed.urls.length) throw new Error(`No ${subject} question links were found on page ${config.startPage}.`);
    state.pages[config.startPage] = parsed.urls;
    if (parsed.totalPages) state.discovered_total_pages = parsed.totalPages;
    save();
  }

  const discoveredPages = state.discovered_total_pages;
  if (!discoveredPages && !config.maxPages) {
    throw new Error(`Could not determine the final ${subject} page. Re-run with --max-pages to set an explicit limit.`);
  }
  const finalPage = config.maxPages
    ? Math.min(discoveredPages || Infinity, config.startPage + config.maxPages - 1)
    : discoveredPages;

  for (let page = config.startPage; page <= finalPage; page += 1) {
    if (!config.refresh && state.pages[page]) continue;
    const url = listingPageUrl(collection, page);
    const parsed = parseListing(await request(url), subject, url);
    if (!parsed.urls.length) throw new Error(`No ${subject} question links were found on listing page ${page}.`);
    state.pages[page] = parsed.urls;
    if (parsed.totalPages) state.discovered_total_pages = Math.max(state.discovered_total_pages || 0, parsed.totalPages);
    save();
    console.log(`  Page ${page}/${finalPage}: ${parsed.urls.length} question links`);
  }

  let urls = [...new Set(Object.entries(state.pages)
    .filter(([page]) => Number(page) >= config.startPage && Number(page) <= finalPage)
    .sort(([left], [right]) => Number(left) - Number(right))
    .flatMap(([, pageUrls]) => pageUrls))];
  if (config.maxQuestions) urls = urls.slice(0, config.maxQuestions);

  console.log(`${label}: extracting ${urls.length} question detail pages`);
  let processed = 0;
  for (const url of urls) {
    const sourceId = getQuestionId(url, subject);
    if (!config.refresh && state.questions[sourceId]) {
      processed += 1;
      continue;
    }
    try {
      const question = parseDetail(await request(url), subject, url, examType);
      state.questions[sourceId] = question;
      delete state.failures[sourceId];
    } catch (error) {
      state.failures[sourceId] = {
        source_id: sourceId,
        source_url: url,
        error: error.message,
        failed_at: new Date().toISOString(),
      };
      console.warn(`  Question ${sourceId} failed: ${error.message}`);
    }
    processed += 1;
    save();
    if (processed === 1 || processed % 10 === 0 || processed === urls.length) {
      console.log(`  ${processed}/${urls.length} processed; ${Object.keys(state.failures).length} unresolved failure(s)`);
    }
  }

  const expectedPages = config.maxPages ? finalPage - config.startPage + 1 : discoveredPages;
  const output = summarize(collection, state, expectedPages, { start: config.startPage, end: finalPage });
  writeJson(outputFile, output);
  console.log(`${label}: wrote ${output.collection.questions_extracted} questions to ${outputFile}`);
  return output;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    usage();
    return;
  }
  fs.mkdirSync(config.outputDir, { recursive: true });
  const request = createRequester(config);
  const summaries = [];
  for (const collection of config.collections) summaries.push(await collectCollection(collection, config, request));
  writeJson(path.join(config.outputDir, "import-report.json"), {
    generated_at: new Date().toISOString(),
    collections: summaries.map(({ subject, exam_type, collection, quality }) => ({ subject, exam_type, collection, quality })),
  });
  console.log("\nImport complete. Review import-report.json before converting these records for production use.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error(`\nImport stopped: ${error.message}`);
    process.exitCode = 1;
  });
}

export { cleanText, listingPageUrl, parseArgs, parseCollectionUrl, parseDetail, parseListing };
