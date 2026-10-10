
// Inline marks: **bold**, *italic*, `code`
const parseInline = (text) => {
  const nodes = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push({ type: 'text', text: text.slice(last, match.index) });
    const token = match[0];

    if (token.startsWith('**')) nodes.push({ type: 'text', text: token.slice(2, -2), marks: [{ type: 'bold' }] });
    else if (token.startsWith('`')) nodes.push({ type: 'text', text: token.slice(1, -1), marks: [{ type: 'code' }] });
    else nodes.push({ type: 'text', text: token.slice(1, -1), marks: [{ type: 'italic' }] });

    last = match.index + token.length;
  }

  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes.filter((n) => n.text);
};

export const textToTiptapDoc = (markdown) => {
  const content = [];
  let listType = null;
  let listItems = [];

  const flushList = () => {
    if (listItems.length) content.push({ type: listType, content: listItems });
    listItems = [];
    listType = null;
  };

  const pushListItem = (type, text) => {
    if (listType !== type) {
      flushList();
      listType = type;
    }
    listItems.push({ type: 'listItem', content: [{ type: 'paragraph', content: parseInline(text) }] });
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (heading) {
      flushList();
      content.push({ type: 'heading', attrs: { level: heading[1].length }, content: parseInline(heading[2]) });
    } else if (bullet) {
      pushListItem('bulletList', bullet[1]);
    } else if (ordered) {
      pushListItem('orderedList', ordered[1]);
    } else {
      flushList();
      content.push({ type: 'paragraph', content: parseInline(line) });
    }
  }

  flushList();
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
};