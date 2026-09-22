import { InteractionReferenceProvider } from './interaction-reference.provider';

describe('InteractionReferenceProvider', () => {
  const provider = new InteractionReferenceProvider();

  it('matches only normalized exact canonical names and conservative aliases', () => {
    expect(provider.match('  SILDENAFIL  ')).toEqual({
      canonicalId: 'SILDENAFIL',
      displayName: 'sildenafil',
    });
    expect(provider.match('Isosorbide   Mononitrate')).toEqual({
      canonicalId: 'NITRATE_MEDICINE',
      displayName: 'nitrate medicine',
    });
  });

  it('does not use substring, dosage stripping, or fuzzy matching', () => {
    expect(provider.match('sildenafil 50 mg')).toBeNull();
    expect(provider.match('sildenafi')).toBeNull();
    expect(provider.match('my sildenafil medicine')).toBeNull();
  });

  it('exposes immutable version and source provenance', () => {
    const metadata = provider.metadata();
    expect(metadata.version).toBe('2026.08.22');
    expect(
      metadata.sources.some(
        (source) =>
          source.publisher.includes('National Library of Medicine') &&
          source.url.includes('dailymed.nlm.nih.gov') &&
          source.accessedAt === '2026-08-22',
      ),
    ).toBe(true);
  });
});
