import { Injectable } from '@nestjs/common';

import {
  INTERACTION_REFERENCE,
  type ReferenceMedication,
} from './interaction-reference.data';

export interface MatchedReferenceMedication {
  canonicalId: string;
  displayName: string;
}

@Injectable()
export class InteractionReferenceProvider {
  private readonly aliasIndex = new Map<string, ReferenceMedication>();

  constructor() {
    for (const medication of INTERACTION_REFERENCE.medications) {
      for (const alias of medication.aliases) {
        const normalized = this.normalize(alias);
        if (this.aliasIndex.has(normalized)) {
          throw new Error(`Duplicate interaction reference alias: ${alias}`);
        }
        this.aliasIndex.set(normalized, medication);
      }
    }
  }

  metadata() {
    return {
      name: INTERACTION_REFERENCE.name,
      version: INTERACTION_REFERENCE.version,
      publishedAt: INTERACTION_REFERENCE.publishedAt,
      sources: INTERACTION_REFERENCE.sources,
    };
  }

  match(name: string): MatchedReferenceMedication | null {
    const medication = this.aliasIndex.get(this.normalize(name));
    return medication
      ? {
          canonicalId: medication.canonicalId,
          displayName: medication.displayName,
        }
      : null;
  }

  interactions() {
    return INTERACTION_REFERENCE.interactions;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase('en-US')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/\s+/g, ' ');
  }
}
