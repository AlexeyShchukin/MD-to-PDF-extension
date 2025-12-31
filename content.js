const MD2PDF_BASE_URL = "https://md2pdf.dev/";
const ICON_SRC = chrome.runtime.getURL("icons/icon32.png");

function isMarkdownUrl(href) {
  try {
    const url = new URL(href);
    const path = url.pathname.toLowerCase();

    if (path.endsWith(".md")) {
      return true;
    }

    if (
      url.hostname === "github.com" &&
      path.includes("/blob/") &&
      path.endsWith(".md")
    ) {
      return true;
    }

    if (url.hostname === "raw.githubusercontent.com" && path.endsWith(".md")) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function buildMd2PdfUrl(markdownUrl) {
  const u = new URL(MD2PDF_BASE_URL);
  u.searchParams.set("url", markdownUrl);
  // Duplicate in hash with a /?url=... pattern for hash-based routers.
  const encoded = encodeURIComponent(markdownUrl);
  u.hash = `/?url=${encoded}`;
  return u.toString();
}

function githubRawUrl(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];

  // repo root -> README.md on HEAD
  if (parts.length === 2) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`;
  }

  // /owner/repo/blob/branch/path
  if (parts[2] === "blob" && parts.length >= 5) {
    const branch = parts[3];
    const filePath = parts.slice(4).join("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  }

  // /owner/repo/tree/branch/path (treat as folder -> README.md inside)
  if (parts[2] === "tree" && parts.length >= 4) {
    const branch = parts[3];
    const filePath =
      parts.length > 4 ? `${parts.slice(4).join("/")}/README.md` : "README.md";
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  }

  // direct path without blob/tree but with .md at the end: assume HEAD branch
  const last = parts[parts.length - 1];
  if (last.toLowerCase().endsWith(".md")) {
    const filePath = parts.slice(2).join("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${filePath}`;
  }

  return null;
}

function toRawMarkdownUrl(href) {
  try {
    const url = new URL(href);
    if (url.hostname === "github.com") {
      const raw = githubRawUrl(url);
      if (raw) return raw;
    }
    return href;
  } catch {
    return href;
  }
}

function resolveTargetHref(rawHref) {
  if (!rawHref) return null;

  let href = rawHref;
  // Support relative /url links from Google.
  if (rawHref.startsWith("/")) {
    href = new URL(rawHref, location.origin).toString();
  }

  try {
    const url = new URL(href);

    const isGoogleRedirect =
      /\.google\./.test(url.hostname) && url.pathname === "/url";

    if (isGoogleRedirect) {
      const realHref = url.searchParams.get("q") || url.searchParams.get("url");
      if (realHref) {
        href = realHref;
      }
    }

    href = href.replace(/^http:/, "https:");

    return href;
  } catch {
    return null;
  }
}

function createIcon(markdownUrl) {
  const icon = document.createElement("span");
  icon.setAttribute("data-md2pdf-button", "1");
  icon.title = "Open in MD2PDF";

  icon.style.cssText = `
    display: inline-block;
    width: 16px;
    height: 16px;
    margin-left: 6px;
    margin-right: 0;
    cursor: pointer;
    vertical-align: middle;
    user-select: none;
    line-height: 1;
  `;

  const img = document.createElement("img");
  img.src = ICON_SRC;
  img.alt = "MD2PDF";
  img.width = 16;
  img.height = 16;
  img.style.display = "block";
  img.style.borderRadius = "4px";

  icon.appendChild(img);

  icon.addEventListener("mouseenter", () => {
    icon.style.opacity = "0.75";
  });
  icon.addEventListener("mouseleave", () => {
    icon.style.opacity = "1";
  });

  icon.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(buildMd2PdfUrl(markdownUrl), "_blank", "noopener,noreferrer");
  });

  return icon;
}

async function isRealMarkdownByHead(url) {
  try {
    const res = await fetch(url, { method: "HEAD" }); // ✅
    if (!res.ok) return false; // ✅

    const ct = (res.headers.get("content-type") || "").toLowerCase(); // ✅
    return (
      ct.includes("text/markdown") ||
      ct.includes("text/plain") ||
      ct.includes("application/octet-stream")
    ); // ✅
  } catch {
    return false;
  }
}


function injectButtons(root = document) {
  const resultBlocks = root.querySelectorAll("div.MjjYud, div.g");

  for (const block of resultBlocks) {
    // If an icon already exists in this block, leave it; avoid duplicates.
    if (block.querySelector('[data-md2pdf-button="1"]')) continue;

    const anchors = Array.from(block.querySelectorAll("a[href]"));
    let targetAnchor = null;
    let targetHref = null;

    for (const a of anchors) {
      const rawHref = a.getAttribute("href");
      const resolved = resolveTargetHref(rawHref);
      a.dataset.md2pdfChecked = "1";
      if (!resolved || !resolved.startsWith("http")) continue;
      if (!isMarkdownUrl(resolved)) continue;

      targetAnchor = a;
      targetHref = resolved;
      break;
    }

    if (!targetAnchor || !targetHref) continue;

    const normalizedHref = toRawMarkdownUrl(targetHref); // ✅

    isRealMarkdownByHead(normalizedHref).then(isMd => { // ✅
      if (!isMd) return; // ✅

      const icon = createIcon(normalizedHref); // ✅

      const snippet =
        block.querySelector("div.VwiC3b") ||
        block.querySelector("div[data-sncf]") ||
        block.querySelector("span.aCOpRe");

      if (snippet) {
        snippet.insertAdjacentElement("beforeend", icon); // ✅
      } else {
        targetAnchor.insertAdjacentElement("afterend", icon); // ✅
      }
    });
  }
}

injectButtons();

const mo = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        injectButtons(node);
      }
    }
  }
});
mo.observe(document.documentElement, { childList: true, subtree: true });
