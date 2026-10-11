// Every FAIL message of the Beginner capstone's check, each from a practice
// copy that produces it: `files` to write, or `setup(dir, { write, commit })`.

// The bug as the report describes it: every link resolves, exit code 0.
const UNFIXED_CLI = "console.log('All relative links resolve.');\nprocess.exit(0);\n";

// Commits `files`, then saves the plan and the commit as the capstone asks.
const savedCommit = (files, plan) => (dir, { write, commit }) => {
  write(dir, files);
  const sha = commit(dir, 'Fix the missing folder', Object.keys(files));
  write(dir, { '.practice/capstone-plan.txt': plan, '.practice/capstone-commit.txt': `${sha}\n` });
};

export const scenarios = [
  { item: 0, name: 'no version file', files: {} },
  { item: 0, name: 'an empty version file', files: { '.practice/version.txt': '' } },
  { item: 0, name: 'an error instead of a version', files: { '.practice/version.txt': 'zsh: command not found: claude\n' } },

  { item: 1, name: 'no snapshot while the plan was on screen', files: {} },
  { item: 1, name: 'a file had changed before the approval', files: { '.practice/capstone-before.txt': ' M src/cli.js\n?? linkcheck.json\n' } },
  { item: 1, name: 'saved after approving', files: { '.practice/capstone-before.txt': ' M src/check-links.js\n M src/cli.js\n?? test/check-links.test.js\n' } },

  { item: 2, name: 'no plan file', files: {} },
  { item: 2, name: 'a plan, but no saved commit', files: { '.practice/capstone-plan.txt': 'src/cli.js\nsrc/check-links.js\ntest/check-links.test.js\n' } },
  { item: 2, name: 'a saved commit that is not in the repository', files: { '.practice/capstone-plan.txt': 'src/cli.js\n', '.practice/capstone-commit.txt': '0123456789abcdef0123456789abcdef01234567\n' } },
  {
    item: 2,
    name: 'the commit changes a file the plan did not name',
    setup: savedCommit({ 'src/cli.js': '// fixed\n', 'test/cli.test.js': '// test\n', 'README.md': 'notes\n' }, 'src/cli.js\ntest/cli.test.js\n'),
  },
  {
    // A real run's plan added two test files: a list that names only one of
    // them fails here, not when the plan is saved.
    item: 2,
    name: 'the plan names one of the two test files the commit changes',
    setup: savedCommit(
      { 'src/check-links.js': '// fixed\n', 'src/cli.js': '// fixed\n', 'test/links.test.js': '// test\n', 'test/cli.test.js': '// test\n' },
      'src/check-links.js\nsrc/cli.js\ntest/links.test.js\n',
    ),
  },
  {
    item: 2,
    name: 'the saved commit is the earlier CLAUDE.md commit',
    setup(dir, { write, commit }) {
      write(dir, { 'CLAUDE.md': '# linkcheck\n\nRun the tests with npm test.\n' });
      const sha = commit(dir, 'Add CLAUDE.md', ['CLAUDE.md']);
      write(dir, { '.practice/capstone-plan.txt': 'src/check-links.js\nsrc/cli.js\ntest/check-links.test.js\n', '.practice/capstone-commit.txt': `${sha}\n` });
    },
  },
  {
    item: 2,
    name: 'the commit has no test',
    setup: savedCommit({ 'src/cli.js': '// fixed\n', 'src/check-links.js': '// fixed\n' }, 'src/cli.js\nsrc/check-links.js\ntest/check-links.test.js\n'),
  },

  { item: 3, name: 'the bug is not fixed yet', files: { 'src/cli.js': UNFIXED_CLI } },

  { item: 4, name: 'the tests fail', files: { 'package.json': '{ "scripts": { "test": "exit 1" } }\n' } },
  { item: 4, name: 'no test script and no saved exit code', files: {} },
  { item: 4, name: 'a PowerShell True instead of an exit code', files: { '.practice/b-3-tests.txt': 'True\n' } },
  { item: 4, name: 'a saved exit code that is not 0', files: { '.practice/b-3-tests.txt': '1\n' } },

  {
    item: 5,
    name: 'a committed CLAUDE.md without the test command',
    setup(dir, { write, commit }) {
      write(dir, { 'CLAUDE.md': '# linkcheck\n\nRun the app with npm run linkcheck.\n' });
      commit(dir, 'Add CLAUDE.md');
    },
  },
  {
    item: 5,
    name: 'a CLAUDE.md that names npm test but is not committed',
    setup(dir, { write, commit }) {
      write(dir, { 'README.md': 'linkcheck\n' });
      commit(dir, 'Initial commit');
      write(dir, { 'CLAUDE.md': '# linkcheck\n\nRun the tests with npm test.\n' });
    },
  },

  {
    item: 6,
    name: 'a linkcheck.json left in the copy',
    setup(dir, { write, commit }) {
      write(dir, { 'README.md': 'linkcheck\n' });
      commit(dir, 'Initial commit');
      write(dir, { 'linkcheck.json': '{ "files": ["docs"] }\n' });
    },
  },
];
