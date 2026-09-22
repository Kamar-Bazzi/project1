export interface InteractionSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  accessedAt: string;
}

export interface ReferenceMedication {
  canonicalId: string;
  displayName: string;
  aliases: readonly string[];
}

export interface ReferenceInteraction {
  canonicalIds: readonly [string, string];
  summary: string;
  sourceIds: readonly string[];
}

export const INTERACTION_REFERENCE = {
  name: 'CareTrack Offline Medication Interaction Reference',
  version: '2026.08.22',
  publishedAt: '2026-08-22',
  sources: [
    {
      id: 'DAILYMED_SILDENAFIL_2026_08_22',
      title: 'DailyMed sildenafil drug label',
      publisher: 'U.S. National Library of Medicine / FDA label data',
      url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8127ff38-2761-49ec-8ce7-7f971f521cfb',
      accessedAt: '2026-08-22',
    },
    {
      id: 'DAILYMED_SPIRONOLACTONE_2026_08_22',
      title: 'DailyMed spironolactone drug label',
      publisher: 'U.S. National Library of Medicine / FDA label data',
      url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=768563dc-a619-44dc-b97f-1a7e71fd56a0',
      accessedAt: '2026-08-22',
    },
  ] satisfies InteractionSource[],
  medications: [
    {
      canonicalId: 'SILDENAFIL',
      displayName: 'sildenafil',
      aliases: ['sildenafil', 'viagra'],
    },
    {
      canonicalId: 'NITRATE_MEDICINE',
      displayName: 'nitrate medicine',
      aliases: [
        'nitroglycerin',
        'glyceryl trinitrate',
        'isosorbide mononitrate',
        'isosorbide dinitrate',
      ],
    },
    {
      canonicalId: 'SPIRONOLACTONE',
      displayName: 'spironolactone',
      aliases: ['spironolactone', 'aldactone'],
    },
    {
      canonicalId: 'ACE_INHIBITOR',
      displayName: 'ACE inhibitor',
      aliases: [
        'benazepril',
        'captopril',
        'enalapril',
        'lisinopril',
        'perindopril',
        'quinapril',
        'ramipril',
      ],
    },
  ] satisfies ReferenceMedication[],
  interactions: [
    {
      canonicalIds: ['SILDENAFIL', 'NITRATE_MEDICINE'],
      summary:
        'The reference data identifies a possible interaction between sildenafil medicines and nitrate medicines.',
      sourceIds: ['DAILYMED_SILDENAFIL_2026_08_22'],
    },
    {
      canonicalIds: ['SPIRONOLACTONE', 'ACE_INHIBITOR'],
      summary:
        'The reference data identifies a possible interaction between spironolactone and ACE inhibitor medicines.',
      sourceIds: ['DAILYMED_SPIRONOLACTONE_2026_08_22'],
    },
  ] satisfies ReferenceInteraction[],
} as const;
