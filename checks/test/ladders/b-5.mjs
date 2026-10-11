// Every FAIL message of lesson 5's check, each from a practice copy that
// produces it: `files` to write, or `setup(dir, { write, commit })`.
const RULE = { '.practice/b-5-rule.txt': '// Part of linkcheck.\n' };
const MEMORY = '# CLAUDE.md\n\n## Conventions\n\n- Every new source file starts with the line `// Part of linkcheck.`\n';

export const scenarios = [
  { item: 0, name: 'no rule line saved', files: {} },
  { item: 0, name: 'CLAUDE.md written but never committed', files: { ...RULE, 'CLAUDE.md': MEMORY } },
  {
    item: 0,
    name: 'the committed CLAUDE.md lacks the saved line',
    setup(dir, { write, commit }) {
      write(dir, { 'CLAUDE.md': '# CLAUDE.md\n\nRun the tests with `npm test`.\n' });
      commit(dir, 'Add project instructions for Claude Code', ['CLAUDE.md']);
      write(dir, RULE);
    },
  },
  { item: 1, name: 'no commit saved', files: RULE },
  { item: 1, name: 'a commit this repository does not have', files: { ...RULE, '.practice/b-5-commit.txt': '0123456789abcdef0123456789abcdef01234567\n' } },
  {
    item: 1,
    name: 'the saved commit adds only Markdown, and the new file is still untracked',
    setup(dir, { write, commit }) {
      write(dir, { 'CLAUDE.md': MEMORY });
      const sha = commit(dir, 'Add project instructions for Claude Code', ['CLAUDE.md']);
      write(dir, { ...RULE, '.practice/b-5-commit.txt': `${sha}\n`, 'src/stats.js': '// Part of linkcheck.\n' });
    },
  },
  {
    item: 1,
    name: 'the saved commit adds only a test and Markdown',
    setup(dir, { write, commit }) {
      write(dir, { 'CLAUDE.md': MEMORY, 'test/stats.test.js': '// Part of linkcheck.\n' });
      const sha = commit(dir, 'Add a test', ['CLAUDE.md', 'test/stats.test.js']);
      write(dir, { ...RULE, '.practice/b-5-commit.txt': `${sha}\n` });
    },
  },
  {
    item: 1,
    name: 'a new source file that does not start with the rule',
    setup(dir, { write, commit }) {
      write(dir, { 'src/stats.js': "import { findLinks } from './links.js';\n" });
      const sha = commit(dir, 'Add countLinks', ['src/stats.js']);
      write(dir, { ...RULE, '.practice/b-5-commit.txt': `${sha}\n` });
    },
  },
  {
    // Your turn's new rule is saved, but the commit file still names the
    // example's commit, whose file starts with the example's rule.
    item: 1,
    name: "Your turn's rule saved before its commit",
    setup(dir, { write, commit }) {
      write(dir, { 'src/stats.js': '// Part of linkcheck.\n' });
      const sha = commit(dir, 'Add countLinks', ['src/stats.js']);
      write(dir, { '.practice/b-5-rule.txt': '// linkcheck source.\n', '.practice/b-5-commit.txt': `${sha}\n` });
    },
  },
];
