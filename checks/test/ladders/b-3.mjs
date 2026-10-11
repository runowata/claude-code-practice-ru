// Every FAIL message of lesson 3's check, each from a practice copy that
// produces it: `files` to write, or `setup(dir, { write, commit })`. The
// tests item runs `npm test`, so its copies hold a one-line test script.
const saveHead = (dir, write, sha) => write(dir, { '.practice/b-3-commit.txt': `${sha}\n` });

export const scenarios = [
  { item: 0, name: 'no saved commit yet', files: {} },
  { item: 0, name: 'a blank saved commit', files: { '.practice/b-3-commit.txt': '\n' } },
  { item: 0, name: 'a saved sha this repository does not have', files: { '.practice/b-3-commit.txt': '0123456789abcdef0123456789abcdef01234567\n' } },
  {
    item: 0,
    name: 'a commit with no test file',
    setup(dir, { write, commit }) {
      write(dir, { 'src/links.js': 'export const x = 1;\n' });
      saveHead(dir, write, commit(dir, 'code only', ['src/links.js']));
    },
  },
  {
    item: 0,
    name: 'a commit with only the test',
    setup(dir, { write, commit }) {
      write(dir, { 'test/links.test.js': 'test\n' });
      saveHead(dir, write, commit(dir, 'test only', ['test/links.test.js']));
    },
  },
  { item: 1, name: 'npm test fails', files: { 'package.json': JSON.stringify({ scripts: { test: 'exit 1' } }) } },
  { item: 1, name: 'no npm test script and no saved exit code', files: {} },
  { item: 1, name: 'a saved exit code that is not a number', files: { '.practice/b-3-tests.txt': 'True\n' } },
  { item: 1, name: 'a saved exit code that is not 0', files: { '.practice/b-3-tests.txt': '1\n' } },
  { item: 2, name: 'a file left uncommitted', files: { 'src/links.js': 'export const x = 1;\n' } },
];
