import { performance } from 'node:perf_hooks';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { BulletList, OrderedList, ListItem, ListKeymap, TaskList, TaskItem } from '@tiptap/extension-list';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { Marked } from 'marked';

const marked = new Marked({ gfm: true, breaks: false });
const large = Array.from({ length: 400 }, (_, i) => `### Section ${i + 1}\n\nParagraph ${i} with *emphasis*, \`inline\` code and [link](https://example.test/${i}).\n\n- one\n  - two\n\n\`\`\`text\nline ${i}\n\`\`\`\n`).join('\n');

// single clean cold open
const t0 = performance.now();
const editor = new Editor({
  element: document.createElement('div'),
  extensions: [
    StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false }),
    BulletList, OrderedList, ListItem, ListKeymap,
    TaskList, TaskItem.configure({ nested: true }),
    Table, TableRow, TableCell, TableHeader,
    Markdown.configure({ marked: marked, markedOptions: { gfm: true, breaks: false } }),
  ],
});
const tConstruct = performance.now() - t0;
const t1 = performance.now();
editor.commands.setContent(large, { contentType: 'markdown' });
const tParse = performance.now() - t1;
const t2 = performance.now();
const out = editor.getMarkdown();
const tSer = performance.now() - t2;
editor.destroy();
console.log(JSON.stringify({ constructMs: +tConstruct.toFixed(1), parseMs: +tParse.toFixed(0), serializeMs: +tSer.toFixed(1), bytes: large.length, outLen: out.length }));
