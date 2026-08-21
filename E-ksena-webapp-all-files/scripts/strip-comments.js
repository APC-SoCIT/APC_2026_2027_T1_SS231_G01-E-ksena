const fs = require("fs");
const path = require("path");

const root = process.cwd();
const excludeDirs = ["node_modules", "dist", ".expo", ".cursor", "mcps", "agent-tools"];
const extJsLike = [".js", ".ts", ".tsx", ".jsx"];
const extCss = [".css", ".scss"];
const extHtml = [".html"];

function stripJsComments(content) {
  let out = content;
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => (m.includes("\n") ? "\n" : ""));
  out = out.replace(/^\s*\/\/.*$/gm, "");
  out = out.replace(/\n\s*\n\s*\n/g, "\n\n");
  return out.trimEnd();
}

function stripCssComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, (m) => (m.includes("\n") ? "\n" : "")).replace(/\n\s*\n\s*\n/g, "\n\n").trimEnd();
}

function stripHtmlComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, (m) => (m.includes("\n") ? "\n" : "")).replace(/\n\s*\n\s*\n/g, "\n\n").trimEnd();
}

function getAllFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!excludeDirs.includes(e.name)) getAllFiles(full, files);
    } else {
      const ext = path.extname(e.name);
      if (extJsLike.includes(ext) || extCss.includes(ext) || extHtml.includes(ext)) files.push(full);
    }
  }
  return files;
}

const rootFiles = ["eslint.config.js", "expo-env.d.ts"].filter((f) => fs.existsSync(path.join(root, f)));
const dirs = ["app", "components", "constants", "context", "hooks", "lib", "scripts"];
let all = [...rootFiles.map((f) => path.join(root, f))];
for (const d of dirs) {
  const full = path.join(root, d);
  if (fs.existsSync(full)) all = all.concat(getAllFiles(full));
}
const exoTypes = path.join(root, ".expo", "types", "router.d.ts");
if (fs.existsSync(exoTypes)) all.push(exoTypes);

for (const file of all) {
  const ext = path.extname(file);
  let content = fs.readFileSync(file, "utf8");
  if (extJsLike.includes(ext)) content = stripJsComments(content);
  else if (extCss.includes(ext)) content = stripCssComments(content);
  else if (extHtml.includes(ext)) content = stripHtmlComments(content);
  fs.writeFileSync(file, content, "utf8");
  console.log("Stripped:", path.relative(root, file));
}

console.log("Done.");