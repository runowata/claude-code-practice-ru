// Every FAIL message of lesson 4's check, each from a practice copy that
// produces it: `files` to write, or `setup(dir, { write, commit })`.
const BEFORE = '.practice/b-4-before-rewind.txt';
const AFTER = '.practice/b-4-after-rewind.txt';

export const scenarios = [
  { item: 0, name: 'no before file', files: {} },
  { item: 0, name: 'a before file saved before the edit', files: { [BEFORE]: '' } },
  { item: 0, name: 'a before file that lists only saved state', files: { [BEFORE]: '?? .practice/b-4-after-rewind.txt\n' } },
  { item: 1, name: 'no after file', files: {} },
  { item: 1, name: 'a change from before the lesson stays', files: { [BEFORE]: ' M src/cli.js\n?? notes.txt\n', [AFTER]: '?? notes.txt\n' } },
  { item: 1, name: 'the edit is still there', files: { [BEFORE]: ' M src/cli.js\n', [AFTER]: ' M src/cli.js\n' } },
  { item: 1, name: 'a changed after file with no before file', files: { [AFTER]: ' M src/cli.js\n' } },
];
