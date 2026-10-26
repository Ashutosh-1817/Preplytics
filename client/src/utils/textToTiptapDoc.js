// Converts the Markdown PrepBot writes (headings, tables, code blocks, lists, task lists, quotes, links,
// bold/italic/strike, inline code, math) into the exact Tiptap JSON the note editor uses, so a saved
// answer looks the same in your notes as it did in the chat.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

const text = (value, marks = []) => (value ? [{ type: 'text', text: value, ...(marks.length ? { marks } : {}) }] : []);

// Inline nodes -> Tiptap text nodes. `code` cannot be combined with other marks in Tiptap, so it stands alone.
function inline(node, marks = []) {
  switch (node.type) {
    case 'text': return text(node.value, marks);
    case 'strong': return kids(node, [...marks, { type: 'bold' }]);
    case 'emphasis': return kids(node, [...marks, { type: 'italic' }]);
    case 'delete': return kids(node, [...marks, { type: 'strike' }]);
    case 'link': return kids(node, [...marks.filter((m) => m.type !== 'link'), { type: 'link', attrs: { href: node.url } }]);
    case 'inlineCode': return text(node.value, [{ type: 'code' }]);
    case 'inlineMath': return text(`$${node.value}$`, [{ type: 'code' }]);
    case 'break': return [{ type: 'hardBreak' }];
    case 'image': return text(node.alt || node.url, [...marks, { type: 'link', attrs: { href: node.url } }]);
    default: return node.children ? kids(node, marks) : text(node.value ?? '', marks);
  }
}
const kids = (node, marks) => (node.children ?? []).flatMap((c) => inline(c, marks));

const paragraph = (node) => {
  const content = kids(node, []);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

const blocks = (node) => {
  const out = (node.children ?? []).flatMap(block);
  return out.length ? out : [{ type: 'paragraph' }];
};

function listItem(item, task) {
  const content = blocks(item);
  if (content[0].type !== 'paragraph') content.unshift({ type: 'paragraph' }); // items must start with a paragraph
  return task
    ? { type: 'taskItem', attrs: { checked: item.checked === true }, content }
    : { type: 'listItem', content };
}

function table(node) {
  const rows = node.children.map((row, ri) => ({
    type: 'tableRow',
    content: row.children.map((cell) => ({
      type: ri === 0 ? 'tableHeader' : 'tableCell',
      content: [paragraph(cell)],
    })),
  }));
  return { type: 'table', content: rows };
}

function block(node) {
  switch (node.type) {
    case 'paragraph': return [paragraph(node)];
    case 'heading': {
      const content = kids(node, []);
      const attrs = { level: Math.min(node.depth, 3) };
      return [content.length ? { type: 'heading', attrs, content } : { type: 'heading', attrs }];
    }
    case 'code': return [{ type: 'codeBlock', attrs: { language: node.lang || null }, ...(node.value ? { content: [{ type: 'text', text: node.value }] } : {}) }];
    case 'math': return [{ type: 'codeBlock', attrs: { language: 'latex' }, content: [{ type: 'text', text: node.value }] }];
    case 'blockquote': return [{ type: 'blockquote', content: blocks(node) }];
    case 'thematicBreak': return [{ type: 'horizontalRule' }];
    case 'table': return [table(node)];
    case 'list': {
      const task = node.children.some((i) => typeof i.checked === 'boolean');
      if (task) return [{ type: 'taskList', content: node.children.map((i) => listItem(i, true)) }];
      return [{
        type: node.ordered ? 'orderedList' : 'bulletList',
        ...(node.ordered ? { attrs: { start: node.start ?? 1 } } : {}),
        content: node.children.map((i) => listItem(i, false)),
      }];
    }
    case 'html': return node.value.trim() ? [{ type: 'paragraph', content: text(node.value.trim()) }] : [];
    case 'definition': case 'footnoteDefinition': return [];
    default: return node.children ? [paragraph(node)] : node.value ? [{ type: 'paragraph', content: text(node.value) }] : [];
  }
}

export const textToTiptapDoc = (markdown = '') => {
  const tree = parser.runSync(parser.parse(String(markdown)));
  return { type: 'doc', content: blocks(tree) };
};