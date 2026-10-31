import { describe, expect, it } from 'vitest';
import { KERUSI_SPEC } from './kerusi-spec.js';

describe('KERUSI_SPEC', () => {
  it('names the revision the conformance corpus was vendored from', () => {
    const [readme] = Object.values(
      import.meta.glob<string>('./conformance/README.md', {
        eager: true,
        query: '?raw',
        import: 'default',
      }),
    );
    const vendored = readme.match(/`spec-(1\.0\.0-draft)\.(\d+)`/);
    expect(vendored).not.toBeNull();
    expect(KERUSI_SPEC.version).toBe(vendored![1]);
    expect(KERUSI_SPEC.revision).toBe(Number(vendored![2]));
  });

  it('builds its schema version and label from the version and revision', () => {
    const { version, revision } = KERUSI_SPEC;
    expect(KERUSI_SPEC.schemaVersion).toBe(`${version}.${revision}`);
    expect(KERUSI_SPEC.label).toBe(`Kerusi v${version}, rev ${revision}`);
  });
});
