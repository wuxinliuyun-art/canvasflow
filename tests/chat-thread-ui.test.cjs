const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("chat node uses a saved message thread and a separate draft", () => {
  assert.match(app, /chatDraft: type === "chat" \? "" : undefined/);
  assert.match(app, /class="chat-messages" role="log"/);
  assert.match(app, /node\.chatDraft = ev\.target\.value/);
  assert.doesNotMatch(app, /node\.chatText = ev\.target\.value/);
  assert.match(app, /return latestReply \|\| chatResultPortion\(node\.chatText\)/);
});

test("message actions do not introduce chat branches", () => {
  assert.match(app, /data-role="chat-message-copy"/);
  assert.match(app, /data-role="chat-message-retry"/);
  assert.match(app, /data-role="chat-message-split"/);
  assert.doesNotMatch(app, /chatBranch|conversationBranch|branchMessages/);
  assert.doesNotMatch(app, /if \(splitItems\) createChatPromptTextNodes/);
});

test("chat thread styles and cache versions ship together", () => {
  assert.match(styles, /\.chat-messages\s*\{/);
  assert.match(styles, /\.chat-message\.is-user/);
  assert.match(styles, /\.chat-message-actions/);
  assert.match(index, /styles\.css\?v=20261105-chat-sessions-packaging1/);
  assert.match(index, /app\.js\?v=20261107-viewport-reveal2/);
  assert.match(styles, /\.chat-compact-card\s*\{/);
  assert.match(styles, /\.chat-compact-summary\s*\{/);
  assert.doesNotMatch(styles, /chat-compact-card-stats/);
  assert.match(app, /class="chat-compact-card/);
  assert.match(app, /打开 AI 对话侧边栏/);
  assert.match(app, /CHAT_NODE_WIDTH = 300/);
  assert.match(app, /CHAT_NODE_HEIGHT = 220/);
});

test("chat sessions provide tabs, history, migration, and lifecycle actions", () => {
  assert.match(app, /function ensureChatSessions\(node\)/);
  assert.match(app, /function saveActiveChatSession\(node, touch = false\)/);
  assert.match(app, /data-role="chat-session-history"/);
  assert.match(app, /data-role="chat-session-add"/);
  assert.match(app, /data-role="chat-session-close"/);
  assert.match(app, /actionRole === "chat-session-delete"/);
  assert.match(app, /actionRole === "chat-session-rename"/);
  assert.match(app, /text\/x-canvasflow-chat-session/);
  assert.match(app, /继续当前对话会把已有聊天历史发送给新站点/);
  assert.match(styles, /\.chat-session-strip\s*\{/);
  assert.match(styles, /\.chat-history-panel\s*\{/);
});

test("complete HTML replies get sandboxed previews", () => {
  assert.match(app, /function extractHtmlDocument\(text\)/);
  assert.match(app, /sandbox="allow-scripts"/);
  assert.match(app, /referrerpolicy="no-referrer"/);
  assert.match(app, /data-role="chat-html-open"/);
  assert.match(app, /data-role="chat-html-code"/);
  assert.match(app, /data-html-copy-code/);
  assert.match(app, /data-html-save/);
  assert.match(app, /data-role="chat-html-save"/);
  assert.match(app, /function saveChatHtmlFile\(html\)/);
  assert.match(app, /class="chat-html-code"/);
  assert.match(app, /完整文档已生成/);
  assert.doesNotMatch(app, /data-chat-html-preview=/);
  const start = app.indexOf("function extractHtmlDocument(text)");
  const end = app.indexOf("function chatHtmlPreviewCard", start);
  const context = {};
  vm.runInNewContext(`${app.slice(start, end).trim()}; this.extractHtmlDocument = extractHtmlDocument;`, context);
  assert.match(context.extractHtmlDocument("说明\n```html\n<!doctype html><html><body>作品集</body></html>\n```"), /<body>作品集<\/body>/);
  assert.equal(context.extractHtmlDocument("```html\n<div>只有片段</div>\n```"), "");
});

test("clipboard copy falls back when the modern API is rejected", () => {
  const start = app.indexOf("async function copyTextValue(value)");
  const end = app.indexOf("async function copyGeneratedFilePath", start);
  const source = app.slice(start, end);
  assert.match(source, /try\s*\{[\s\S]*navigator\.clipboard\.writeText/);
  assert.match(source, /catch \(_\)/);
  assert.match(source, /document\.execCommand\("copy"\)/);
});

test("chat can expand into a dedicated workspace", () => {
  assert.match(app, /function openChatWorkspace\(nodeId\)/);
  assert.match(app, /function chatOverlayClass\(baseClass\)/);
  assert.match(app, /els\.app\.classList\.contains\("theme-dark"\)/);
  assert.match(app, /chatOverlayClass\("chat-workspace-backdrop"\)/);
  assert.match(app, /class="chat-workspace" role="dialog"/);
  assert.match(app, /data-role="chat-expand"/);
  assert.match(styles, /\.chat-workspace-backdrop\s*\{/);
  assert.match(styles, /\.chat-workspace-body \.chat-message-content/);
  assert.match(styles, /\.chat-composer-send/);
  assert.match(styles, /justify-content: flex-end; padding: 0; pointer-events: none/);
  assert.match(styles, /width: min\(720px, 100vw\)/);
  assert.match(styles, /\.chat-workspace \{[^}]*border-radius: 0;/);
  assert.match(styles, /border-left: 1px solid var\(--panel-2\); border-radius: 0; background: var\(--panel-solid\)/);
  assert.match(app, /chatNodeBody\(node, true\)/);
  assert.match(app, /composer\.insertBefore\(controls, send\)/);
  assert.match(app, /function handleChatNodeAction\(node, actionRole, action\)/);
  assert.match(app, /actionRole === "chat-send"[\s\S]*sendChatNodeMessage\(node\.id\)/);
});

test("complete HTML replies can be edited without creating a chat branch", () => {
  assert.match(app, /data-role="chat-html-edit"/);
  assert.match(app, /function openChatHtmlEditor\(node, messageIndex\)/);
  assert.match(app, /function replaceHtmlDocumentInMessage\(content, nextHtml\)/);
  assert.match(app, /data-html-editor-undo/);
  assert.match(app, /data-html-editor-redo/);
  assert.match(app, /data-html-editor-replace-image/);
  assert.match(app, /data-html-editor-delete/);
  assert.match(app, /cf-html-element-selected/);
  assert.match(app, /data-html-property-text/);
  assert.match(app, /data-html-property-color/);
  assert.match(app, /function chatHtmlEditorTextEditable\(element\)/);
  assert.match(app, /H\[1-6\]\|P\|SPAN/);
  assert.match(app, /message\.content = replaceHtmlDocumentInMessage/);
  assert.match(styles, /\.chat-html-editor-body\s*\{/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 320px/);
  assert.doesNotMatch(app, /class="chat-html-editor-source"/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.chat-html-editor-body/);
});
