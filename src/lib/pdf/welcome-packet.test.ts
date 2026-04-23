import { describe, it, expect } from 'vitest';
import { renderWelcomePacketBuffer } from './welcome-packet';

/**
 * Lightweight snapshot: render the packet and assert it is a valid PDF by
 * checking the magic bytes and a reasonable minimum size. We don't diff the
 * byte stream — @react-pdf/renderer bundles a font that makes exact bytes
 * non-deterministic across machines.
 */
describe('renderWelcomePacketBuffer', () => {
  const baseInput = {
    clinic: { practiceName: 'Sage Vet Clinic', contactEmail: 'hello@sagevet.example' },
    plan: {
      tierName: 'Puppy Plus',
      monthlyFeeCents: 4900,
      includedServices: ['Annual wellness exam', 'Vaccinations', 'Unlimited nail trims'],
    },
    member: {
      petName: 'Rex',
      species: 'dog',
      ownerEmail: 'owner@example.com',
      enrolledAt: new Date('2026-04-23T12:00:00.000Z'),
      nextBillingAt: new Date('2026-05-23T12:00:00.000Z'),
    },
  };

  it('renders a non-empty Buffer with PDF magic bytes', async () => {
    const buf = await renderWelcomePacketBuffer(baseInput);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1024); // real PDFs are >> 1KB
    // %PDF- magic bytes.
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('tolerates an empty includedServices array', async () => {
    const buf = await renderWelcomePacketBuffer({
      ...baseInput,
      plan: { ...baseInput.plan, includedServices: [] },
    });
    expect(buf.length).toBeGreaterThan(1024);
  });

  it('tolerates a null nextBillingAt', async () => {
    const buf = await renderWelcomePacketBuffer({
      ...baseInput,
      member: { ...baseInput.member, nextBillingAt: null },
    });
    expect(buf.length).toBeGreaterThan(1024);
  });

  it('tolerates a null clinic contactEmail', async () => {
    const buf = await renderWelcomePacketBuffer({
      ...baseInput,
      clinic: { ...baseInput.clinic, contactEmail: null },
    });
    expect(buf.length).toBeGreaterThan(1024);
  });
}, 15_000);
