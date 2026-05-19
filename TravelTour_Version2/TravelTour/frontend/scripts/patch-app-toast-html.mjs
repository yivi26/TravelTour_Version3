import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(__dirname, "..");

const SNIPPET = `
    <link rel="stylesheet" href="/assets/css/common/app-toast.css" />
    <script src="/assets/js/common/app-toast.js"></script>
`;

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (name.endsWith(".html")) files.push(full);
  }
  return files;
}

let patched = 0;
let skipped = 0;

for (const file of walk(frontendRoot)) {
  let html = fs.readFileSync(file, "utf8");
  if (html.includes("app-toast.js")) {
    skipped += 1;
    continue;
  }
  if (!html.includes("</head>")) {
    skipped += 1;
    continue;
  }
  html = html.replace("</head>", `${SNIPPET}\n  </head>`);
  fs.writeFileSync(file, html, "utf8");
  patched += 1;
}

console.log(`Patched ${patched} HTML files, skipped ${skipped}.`);
