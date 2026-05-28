const data = window.APP_DATA || { items: [], source: "" };
const queryInput = document.querySelector("#query");
const resultsEl = document.querySelector("#results");
const emptyEl = document.querySelector("#empty");
const resultCountEl = document.querySelector("#result-count");
const sourceNameEl = document.querySelector("#source-name");
const explanationEl = document.querySelector("#explanation");
const template = document.querySelector("#result-template");
const filters = [...document.querySelectorAll(".filter")];

let activeFilter = "all";
let selectedId = null;
sourceNameEl.textContent = data.source;
data.items.forEach((item, index) => {
  item.viewId = String(index);
});
queryInput.value = new URLSearchParams(window.location.search).get("q") || "";

const normalize = (value) =>
  (value || "")
    .toString()
    .toLowerCase()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, " ")
    .trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (value) =>
  (value || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const highlight = (text, terms) => {
  let output = escapeHtml(text);
  for (const term of terms) {
    if (!term) continue;
    output = output.replace(new RegExp(`(${escapeRegExp(term)})`, "gi"), "<mark>$1</mark>");
  }
  return output;
};

const hasFilter = (item) => {
  const refs = item.references || [];
  if (activeFilter === "law") return refs.some((ref) => /法第|生活保護法|福祉法|施行規則|法律/.test(ref));
  if (activeFilter === "notice") return refs.some((ref) => /通知|社発/.test(ref));
  if (activeFilter === "qa") return refs.some((ref) => /問答/.test(ref));
  return true;
};

const scoreItem = (item, terms) => {
  const title = normalize(item.title);
  const chapter = normalize(item.chapter);
  const refs = normalize((item.references || []).join(" "));
  const body = normalize(item.body);
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 16;
    if (refs.includes(term)) score += 12;
    if (chapter.includes(term)) score += 6;
    if (body.includes(term)) score += 2;
  }
  return score;
};

const makeSnippet = (item, rawTerms) => {
  const body = item.body || "";
  const normalizedBody = normalize(body);
  const normalizedTerms = rawTerms.map(normalize);
  let index = -1;
  for (const term of normalizedTerms) {
    index = normalizedBody.indexOf(term);
    if (index >= 0) break;
  }
  const start = Math.max(0, index - 80);
  const snippet = body.slice(start, start + 240);
  return `${start > 0 ? "…" : ""}${snippet}${start + 240 < body.length ? "…" : ""}`;
};

const refClass = (ref) => (/法第|生活保護法|福祉法|施行規則|法律/.test(ref) ? "law" : "");
const displayRef = (ref) => {
  let output = normalizeSpaces(ref).replace(/－ \(/g, "－(");
  if (/\([^)]$/.test(output) || /\([^)]+$/.test(output)) {
    output = `${output})`;
  }
  return output;
};

const plainText = (value) => normalizeSpaces((value || "").replace(/[「」『』]/g, ""));

const normalizeSpaces = (value) => value.toString().replace(/\s+/g, " ").trim();

const readableSentence = (sentence) => {
  const cleaned = plainText(sentence);
  return cleaned.length > 120 ? `${cleaned.slice(0, 118)}…` : cleaned;
};

const splitSentences = (body) =>
  body
    .replace(/\n/g, "")
    .split("。")
    .map(readableSentence)
    .filter((sentence) => sentence.length > 18 && !/^(問|答|なお、?設問|根拠|参考)/.test(sentence))
    .slice(0, 8);

const judgeTone = (body) => {
  if (/認められない|できない|適当ではない|誤りである|廃止する/.test(body)) {
    return "この項目は、できない扱いや注意が必要な場面を確認するためのものです。";
  }
  if (/認められる|できる|差し支えない|可能である|支給する/.test(body)) {
    return "この項目は、条件を満たす場合に認められる扱いを確認するためのものです。";
  }
  return "この項目は、事実関係を確認したうえで、どの扱いにするか判断するためのものです。";
};

const makeExplanation = (item) => {
  const sentences = splitSentences(item.body || "");
  const refs = item.references?.length ? item.references : [];
  const title = item.title.replace(/^（問[^）]+）\s*/, "");
  const point = sentences[0] || "本文から判断のポイントを確認してください。";
  const practice =
    sentences.find((sentence) => sentence !== point && !/示されたい|どうなるか|よいか/.test(sentence) && /必要|確認|調査|判断|留意|扱い|要件/.test(sentence)) ||
    sentences.find((sentence) => sentence !== point) ||
    point;
  return {
    lead: `これは「${title}」について、生活保護の運用上どう扱うかを確認する項目です。${judgeTone(item.body || "")}`,
    points: [
      `中心になる考え方は「${point}」という部分です。`,
      `実務では「${practice}」という点を見落とさないようにします。`,
      refs.length
        ? `根拠候補として、${refs.slice(0, 5).map(displayRef).join("、")} が本文中に出ています。`
        : "本文中から自動で拾える根拠候補はありません。本文全体を確認してください。",
    ],
    note:
      "この解説は本文を読みやすく言い換えた補助表示です。最終判断では、本文の原文と根拠候補をあわせて確認してください。",
  };
};

const renderExplanation = (item) => {
  const explanation = makeExplanation(item);
  explanationEl.innerHTML = `
    <p class="eyebrow">${escapeHtml(item.chapter || "章未分類")}</p>
    <h2>${escapeHtml(item.title)}</h2>
    <p class="explain-lead">${escapeHtml(explanation.lead)}</p>
    <div class="explain-group">
      <h3>平易な解説</h3>
      <ul class="explain-list">
        ${explanation.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
      </ul>
    </div>
    <div class="explain-group">
      <h3>確認メモ</h3>
      <p class="explain-text">${escapeHtml(explanation.note)}</p>
    </div>
  `;
};

const render = () => {
  const rawQuery = queryInput.value.trim();
  const rawTerms = rawQuery.split(/[ 　]+/).filter(Boolean);
  const terms = rawTerms.map(normalize);
  const matches = rawQuery
    ? data.items
        .map((item) => ({ item, score: scoreItem(item, terms) }))
        .filter(({ item, score }) => score > 0 && hasFilter(item))
        .sort((a, b) => b.score - a.score)
        .slice(0, 80)
    : [];

  resultCountEl.textContent = `${matches.length}件`;
  resultsEl.replaceChildren();
  emptyEl.hidden = matches.length > 0 || rawQuery;
  if (matches.length === 0 && rawQuery) {
    emptyEl.hidden = false;
    emptyEl.querySelector("h2").textContent = "該当する候補がありません";
    emptyEl.querySelector("p").textContent = "別の表記や短い単語で検索してみてください。";
  } else if (!rawQuery) {
    emptyEl.querySelector("h2").textContent = "関連ワードを入力してください";
    emptyEl.querySelector("p").textContent = "問のタイトル、本文、根拠候補をまとめて検索します。";
  }

  for (const { item } of matches) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".result-card");
    card.dataset.id = item.viewId;
    if (item.viewId === selectedId) {
      card.classList.add("selected");
    }
    node.querySelector(".chapter").textContent = item.chapter || "章未分類";
    node.querySelector("h2").innerHTML = highlight(item.title, rawTerms);
    node.querySelector(".snippet").innerHTML = highlight(makeSnippet(item, rawTerms), rawTerms);
    node.querySelector(".body").innerHTML = highlight(item.body, rawTerms);
    const refsEl = node.querySelector(".refs");
    const refs = item.references?.length ? item.references : ["根拠候補なし"];
    refs.forEach((ref) => {
      const chip = document.createElement("span");
      chip.className = `ref ${refClass(ref)}`;
      chip.textContent = displayRef(ref);
      refsEl.append(chip);
    });
    node.querySelector(".explain-button").addEventListener("click", () => {
      selectedId = item.viewId;
      renderExplanation(item);
      document.querySelectorAll(".result-card").forEach((cardEl) => {
        cardEl.classList.toggle("selected", cardEl.dataset.id === selectedId);
      });
    });
    resultsEl.append(node);
  }
};

queryInput.addEventListener("input", render);
filters.forEach((button) => {
  button.addEventListener("click", () => {
    filters.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    render();
  });
});

render();
