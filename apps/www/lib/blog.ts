import fs from "fs";
import path from "path";

export type BlogArticle = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readingTime: string;
  tags: string[];
  schema: "Article" | "NewsArticle";
  content: string;
  wordCount: number;
  faqs: { question: string; answer: string }[];
};

const BLOG_DIR = path.join(resolveWwwRoot(), "content", "blog");

export function getAllBlogArticles(): BlogArticle[] {
  try {
    return fs
      .readdirSync(BLOG_DIR)
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => readBlogArticle(file.replace(/\.mdx$/, "")))
      .filter((article): article is BlogArticle => Boolean(article))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
}

export function getBlogArticle(slug: string): BlogArticle | null {
  return readBlogArticle(slug);
}

function readBlogArticle(slug: string): BlogArticle | null {
  try {
    const raw = fs.readFileSync(path.join(BLOG_DIR, `${slug}.mdx`), "utf8");
    const { metadata, content } = parseFrontmatter(raw);
    const wordCount = countWords(content);
    return {
      slug,
      title: metadata.title || titleFromSlug(slug),
      excerpt: metadata.excerpt || firstParagraph(content),
      date: metadata.date || "2026-05-24",
      readingTime: metadata.readingTime || `${Math.max(4, Math.ceil(wordCount / 180))} min read`,
      tags: (metadata.tags || "Mumbai real estate")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      schema: metadata.schema === "NewsArticle" ? "NewsArticle" : "Article",
      content,
      wordCount,
      faqs: extractFaqs(content),
    };
  } catch {
    return null;
  }
}

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { metadata: {} as Record<string, string>, content: raw.trim() };

  const metadata: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key) metadata[key] = value;
  }

  return { metadata, content: match[2].trim() };
}

function extractFaqs(content: string) {
  const lines = content.split(/\r?\n/);
  const faqStart = lines.findIndex((line) => /^##\s+FAQ\s*$/i.test(line.trim()));
  if (faqStart === -1) return [];

  const faqs: { question: string; answer: string }[] = [];
  let currentQuestion = "";
  let answerLines: string[] = [];

  for (const rawLine of lines.slice(faqStart + 1)) {
    const line = rawLine.trim();
    if (/^##\s+/.test(line)) break;
    if (/^###\s+/.test(line)) {
      if (currentQuestion) {
        faqs.push({ question: currentQuestion, answer: cleanMarkdown(answerLines.join(" ")) });
      }
      currentQuestion = line.replace(/^###\s+/, "").trim();
      answerLines = [];
    } else if (line) {
      answerLines.push(line);
    }
  }

  if (currentQuestion) {
    faqs.push({ question: currentQuestion, answer: cleanMarkdown(answerLines.join(" ")) });
  }

  return faqs.filter((faq) => faq.question && faq.answer);
}

function resolveWwwRoot() {
  const cwd = process.cwd();
  if (cwd.endsWith(path.join("apps", "www"))) return cwd;
  const nested = path.join(cwd, "apps", "www");
  if (fs.existsSync(nested)) return nested;
  return cwd;
}

function firstParagraph(content: string) {
  return (
    content
      .split(/\r?\n\r?\n/)
      .map((part) => cleanMarkdown(part))
      .find((part) => part.length > 80) || "Mumbai real estate analysis from PropAI Pulse."
  );
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function countWords(content: string) {
  return cleanMarkdown(content).split(/\s+/).filter(Boolean).length;
}

function cleanMarkdown(value: string) {
  return value
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
