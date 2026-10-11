// Every FAIL message of lesson 1's check, each from a practice copy that
// produces it: `files` to write, or `setup(dir, { write, commit })`.
export const scenarios = [
  { item: 0, name: 'no version file', files: {} },
  { item: 0, name: 'an empty version file', files: { '.practice/version.txt': '' } },
  { item: 0, name: 'an error instead of a version', files: { '.practice/version.txt': 'zsh: command not found: claude\n' } },
];
