import fs from "fs";

const data = JSON.parse(fs.readFileSync("data/questions.json", "utf-8"));
const version = data.version;
const questions = data.questions;

const english = questions.filter(q => q.subject === "english");
const generalPaper = questions.filter(q => q.subject === "general-paper");
const mathematics = questions.filter(q => q.subject === "mathematics");

fs.writeFileSync("data/questions-english.json", JSON.stringify({ version, questions: english }, null, 2));
fs.writeFileSync("data/questions-general-paper.json", JSON.stringify({ version, questions: generalPaper }, null, 2));
fs.writeFileSync("data/questions-mathematics.json", JSON.stringify({ version, questions: mathematics }, null, 2));

const manifest = {
  version: 2,
  packs: [
    { id: "english", name: "English Language", file: "data/questions-english.json" },
    { id: "general-paper", name: "General Paper", file: "data/questions-general-paper.json" },
    { id: "mathematics", name: "Mathematics", file: "data/questions-mathematics.json" }
  ]
};

fs.writeFileSync("data/manifest.json", JSON.stringify(manifest, null, 2));
console.log("Questions split and manifest created.");
