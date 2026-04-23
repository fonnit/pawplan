import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import * as React from 'react';

/**
 * Welcome packet PDF — NOTIF-01.
 *
 * Renders a branded, single-page summary of what the member just signed up
 * for: plan name, tier, included services, first billing date, clinic
 * contact info. The same layout is reused for both dogs and cats (species
 * is a note line, not a template switch).
 *
 * Implementation note: `@react-pdf/renderer` runs fully on the Node side.
 * This file MUST NEVER be imported by a Client Component or by the webhook
 * hot path — the bundle cost is non-trivial and we guarantee it stays out
 * via a grep-assert test in Wave 3.
 */

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#111827',
    lineHeight: 1.5,
  },
  headerBar: {
    borderBottomWidth: 2,
    borderBottomColor: '#4b6049',
    paddingBottom: 12,
    marginBottom: 24,
  },
  brand: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#4b6049' },
  clinicName: { fontSize: 14, marginTop: 4 },
  h1: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    color: '#111827',
  },
  subtle: { color: '#6b7280', fontSize: 10 },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#4b6049',
    marginBottom: 8,
  },
  kvRow: { flexDirection: 'row', marginBottom: 4 },
  kvKey: { width: 150, fontFamily: 'Helvetica-Bold' },
  kvVal: { flex: 1 },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 48,
    right: 48,
    fontSize: 9,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
  },
});

export interface WelcomePacketInput {
  clinic: {
    practiceName: string;
    /** Owner email — shown as clinic contact for replies. */
    contactEmail?: string | null;
  };
  plan: {
    /** Tier display name — e.g. "Puppy Plus". */
    tierName: string;
    /** Monthly price in USD cents. */
    monthlyFeeCents: number;
    /** Included services — list of short human-readable strings. */
    includedServices: string[];
  };
  member: {
    petName: string;
    species: string;
    ownerEmail: string;
    enrolledAt: Date;
    /** Next billing date (from Stripe current_period_end). */
    nextBillingAt: Date | null;
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function WelcomePacketDocument({
  clinic,
  plan,
  member,
}: WelcomePacketInput): React.ReactElement {
  const services =
    plan.includedServices.length > 0
      ? plan.includedServices
      : ['Plan details will be shared by your clinic.'];

  return (
    <Document
      title={`${clinic.practiceName} — Welcome Packet for ${member.petName}`}
      author={clinic.practiceName}
      subject="PawPlan membership welcome packet"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerBar}>
          <Text style={styles.brand}>PawPlan</Text>
          <Text style={styles.clinicName}>{clinic.practiceName}</Text>
        </View>

        <Text style={styles.h1}>Welcome, {member.petName}!</Text>
        <Text style={styles.subtle}>
          Enrolled on {format(member.enrolledAt, 'MMMM d, yyyy')}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Plan</Text>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Tier</Text>
            <Text style={styles.kvVal}>{plan.tierName}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Monthly</Text>
            <Text style={styles.kvVal}>{formatCents(plan.monthlyFeeCents)}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Next billing</Text>
            <Text style={styles.kvVal}>
              {member.nextBillingAt
                ? format(member.nextBillingAt, 'MMMM d, yyyy')
                : 'Shown on your receipt'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Included Services</Text>
          {services.map((svc, i) => (
            <View key={`svc-${i}`} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{svc}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Pet</Text>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Name</Text>
            <Text style={styles.kvVal}>{member.petName}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Species</Text>
            <Text style={styles.kvVal}>{member.species}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Owner email</Text>
            <Text style={styles.kvVal}>{member.ownerEmail}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinic Contact</Text>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Practice</Text>
            <Text style={styles.kvVal}>{clinic.practiceName}</Text>
          </View>
          {clinic.contactEmail ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Email</Text>
              <Text style={styles.kvVal}>{clinic.contactEmail}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.footer}>
          This packet is a summary of your PawPlan membership. Your official
          receipt is sent separately by Stripe. For billing questions, reply
          to this email.
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Render the welcome packet to a Buffer. Safe to call inside a pg-boss
 * worker — no browser globals, no DOM, no side effects.
 *
 * Returns a `Buffer` containing a valid PDF (starts with the `%PDF-` magic
 * bytes). Pipe the base64 encoding of this buffer into the SendGrid
 * `attachments[].content` field.
 */
export async function renderWelcomePacketBuffer(
  input: WelcomePacketInput,
): Promise<Buffer> {
  const element = <WelcomePacketDocument {...input} />;
  // renderToBuffer's return type is `Buffer` in @types/node shim, but the
  // runtime may give us a Node Buffer subclass. We normalize through
  // Buffer.from to make downstream base64 encoding deterministic.
  const buf = await renderToBuffer(element);
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}
