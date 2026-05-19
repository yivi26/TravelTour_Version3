import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(__dirname, "..");

const files = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(js|html)$/.test(name) && !name.includes("app-toast")) files.push(full);
  }
}
walk(path.join(frontendRoot, "assets", "js"));
walk(path.join(frontendRoot, "pages"));
walk(frontendRoot);

const replacements = [
  [/const ok = window\.confirm\(/g, "const ok = await showAppConfirm("],
  [/const ok = confirm\(/g, "const ok = await showAppConfirm("],
  [/const isConfirmed = confirm\(/g, "const isConfirmed = await showAppConfirm("],
  [/const confirmDelete = confirm\(/g, "const confirmDelete = await showAppConfirm("],
  [/if \(!window\.confirm\(/g, "if (!(await showAppConfirm("],
  [/if \(!confirm\(/g, "if (!(await showAppConfirm("],
  [/!\s*window\.confirm\(/g, "!(await showAppConfirm("],
  [/!\s*confirm\(/g, "!(await showAppConfirm("],
];

let count = 0;
for (const file of files) {
  if (file.includes("node_modules") || file.includes("patch-")) continue;
  let src = fs.readFileSync(file, "utf8");
  const before = src;
  for (const [re, rep] of replacements) {
    src = src.replace(re, rep);
  }
  if (src !== before) {
    fs.writeFileSync(file, src, "utf8");
    count += 1;
  }
}
console.log(`Updated confirm in ${count} files.`);
