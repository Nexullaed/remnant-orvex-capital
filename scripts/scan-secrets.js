const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const excludedDirs = new Set(["node_modules", ".git", ".vscode", "uploads"]);
const ignoredFiles = new Set(["package-lock.json"]);
const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
  ".zip",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
]);

const frontendFileExtensions = new Set([".html", ".js", ".jsx", ".ts", ".tsx", ".css", ".json"]);

const secretEnvNames = [
  "JWT_SECRET",
  "DB_PASSWORD",
  "APP_DB_PASSWORD",
  "SMTP_PASS",
  "SMTP_USER",
  "AT_API_KEY",
  "AT_USERNAME",
  "AT_SENDER_ID",
  "ADMIN_PASSWORD",
  "KYC_WEBHOOK_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
];

const rules = [
  { name: "OpenAI API key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z\-_]{20,}\b/g },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", regex: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "Private key block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    name: "Credential URI",
    regex: /\b(?:mongodb\+srv|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s'"]+/g,
  },
  {
    name: "Suspicious password assignment",
    regex: /\b(?:password|passwd|pwd|secret|token|api[_-]?key|smtp_pass|db_password)\b\s*[:=]\s*["'][^"'\r\n]{8,}["']/gi,
  },
];

function walk(currentDir, files = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) {
        continue;
      }
      walk(fullPath, files);
      continue;
    }

    if (ignoredFiles.has(entry.name)) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (binaryExtensions.has(extension)) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function relative(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function getLineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function isFrontendFile(filePath) {
  const rel = relative(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (!frontendFileExtensions.has(extension)) {
    return false;
  }

  if (rel.startsWith("server/") || rel.startsWith("scripts/")) {
    return false;
  }

  return true;
}

function scanFile(filePath) {
  const findings = [];
  const rel = relative(filePath);
  const content = fs.readFileSync(filePath, "utf8");

  for (const rule of rules) {
    const matches = content.matchAll(rule.regex);
    for (const match of matches) {
      findings.push({
        file: rel,
        line: getLineNumber(content, match.index || 0),
        rule: rule.name,
      });
    }
  }

  if (isFrontendFile(filePath)) {
    for (const envName of secretEnvNames) {
      const envRegex = new RegExp(`\\b${envName}\\b`, "g");
      const matches = content.matchAll(envRegex);
      for (const match of matches) {
        findings.push({
          file: rel,
          line: getLineNumber(content, match.index || 0),
          rule: `Server secret referenced in frontend (${envName})`,
        });
      }
    }

    const publicEnvRegex = /\b(?:process\.env|import\.meta\.env|REACT_APP_|VITE_|NEXT_PUBLIC_)[A-Za-z0-9_\.]*/g;
    const matches = content.matchAll(publicEnvRegex);
    for (const match of matches) {
      findings.push({
        file: rel,
        line: getLineNumber(content, match.index || 0),
        rule: "Frontend environment variable usage",
      });
    }
  }

  return findings;
}

function scanGitIgnore() {
  const findings = [];
  const gitIgnorePath = path.join(rootDir, ".gitignore");
  if (!fs.existsSync(gitIgnorePath)) {
    findings.push({ file: ".gitignore", line: 1, rule: "Missing .gitignore for secret files" });
    return findings;
  }

  const gitIgnore = fs.readFileSync(gitIgnorePath, "utf8");
  if (!/^\s*\.env\s*$/m.test(gitIgnore)) {
    findings.push({ file: ".gitignore", line: 1, rule: "Missing .env ignore rule" });
  }
  if (!/^\s*\.env\.\*\s*$/m.test(gitIgnore)) {
    findings.push({ file: ".gitignore", line: 1, rule: "Missing .env.* ignore rule" });
  }
  if (!/^\s*!\.env\.example\s*$/m.test(gitIgnore)) {
    findings.push({ file: ".gitignore", line: 1, rule: "Missing .env.example allowlist rule" });
  }
  return findings;
}

function main() {
  const findings = [];
  const files = walk(rootDir);

  for (const filePath of files) {
    const rel = relative(filePath);
    if (rel === ".env.example") {
      continue;
    }
    findings.push(...scanFile(filePath));
  }

  findings.push(...scanGitIgnore());

  if (!findings.length) {
    console.log("No obvious secret exposure findings in the working tree.");
    return;
  }

  console.error("Secret scan findings:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.rule}`);
  }
  process.exitCode = 1;
}

main();
