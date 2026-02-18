/**
 * Example: Healthcare Patient Record Sync
 *
 * Scenario: An LLM-powered clinical assistant helps physicians manage
 * patient records, prescriptions, and lab results via MCP tools.
 *
 * The Danger Without StateSync:
 *
 *   Turn 1: LLM reads patient.getAllergies("P-4401") → ["Penicillin"]
 *   Turn 3: Nurse updates allergies via hospital system → adds "Sulfonamides"
 *   Turn 5: LLM recommends Sulfamethoxazole based on Turn 1 allergy list
 *   Result: ADVERSE DRUG REACTION — LLM missed the updated allergy
 *
 * With StateSync, patient data is always `no-store`. When the LLM writes
 * a prescription, all patient domains are invalidated — forcing a fresh
 * read of allergies, medications, and conditions before the next decision.
 *
 * Run: npx tsx examples/healthcare-patient-records.ts
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StateSync } from '@vinkius-core/mcp-state-sync';

const server = new Server({ name: 'clinical-assistant', version: '1.0.0' }, {
    capabilities: { tools: {} },
});

// ── StateSync Configuration ─────────────────────────────────────────
//
// Design principle: In healthcare, EVERY piece of patient data is volatile.
// A nurse, another physician, or a lab system can update records at any time.
// The only safe default is `no-store` for everything patient-related.
//
// Reference data (ICD-10 codes, drug formulary) is immutable — these are
// international standards that don't change within a clinical session.

const sync = new StateSync({
    defaults: { cacheControl: 'no-store' },
    policies: [
        // ── Reference data (international standards, safe to cache) ──
        { match: 'icd10.*',        cacheControl: 'immutable' },
        { match: 'formulary.*',    cacheControl: 'immutable' },
        { match: 'labCodes.*',     cacheControl: 'immutable' },

        // ── Prescription writes invalidate the full patient domain ───
        {
            match: 'prescriptions.create',
            invalidates: [
                'patient.*',           // Patient record may show new active Rx
                'prescriptions.*',     // Prescription list is stale
                'interactions.*',      // Drug interaction profile changed
            ],
        },
        {
            match: 'prescriptions.cancel',
            invalidates: [
                'patient.*',
                'prescriptions.*',
                'interactions.*',
            ],
        },

        // ── Lab order writes ────────────────────────────────────────
        {
            match: 'labOrders.create',
            invalidates: [
                'labOrders.*',
                'patient.*',           // Patient's pending orders changed
            ],
        },

        // ── Vitals recording ────────────────────────────────────────
        {
            match: 'vitals.record',
            invalidates: [
                'vitals.*',
                'patient.*',           // Patient summary includes latest vitals
            ],
        },

        // ── Everything else: no-store by default ────────────────────
        // patient.getAllergies, patient.getMedications, vitals.getLatest, etc.
        // All require fresh reads — the LLM must never use cached patient data
    ],
});

sync.attachToServer(server, {
    tools: [
        {
            name: 'patient.getAllergies',
            description: 'Get all known allergies for a patient.',
            inputSchema: {
                type: 'object',
                properties: { patientId: { type: 'string' } },
                required: ['patientId'],
            },
        },
        {
            name: 'patient.getMedications',
            description: 'Get active medications for a patient.',
            inputSchema: {
                type: 'object',
                properties: { patientId: { type: 'string' } },
                required: ['patientId'],
            },
        },
        {
            name: 'prescriptions.create',
            description: 'Create a new prescription for a patient.',
            inputSchema: {
                type: 'object',
                properties: {
                    patientId: { type: 'string' },
                    drugCode: { type: 'string' },
                    dosage: { type: 'string' },
                    frequency: { type: 'string' },
                },
                required: ['patientId', 'drugCode', 'dosage', 'frequency'],
            },
        },
        {
            name: 'icd10.lookup',
            description: 'Look up an ICD-10 diagnosis code.',
            inputSchema: {
                type: 'object',
                properties: { code: { type: 'string' } },
                required: ['code'],
            },
        },
    ],
    handler: async (name, args) => {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
    },
});

// ── What the LLM Sees ───────────────────────────────────────────────
//
// tools/list:
//   "Get all known allergies for a patient. [Cache-Control: no-store]"
//   "Look up an ICD-10 diagnosis code. [Cache-Control: immutable]"
//
// After prescriptions.create succeeds:
//   [System: Cache invalidated for patient.*, prescriptions.*, interactions.* — caused by prescriptions.create]
//
// The LLM now knows it MUST re-read the patient's allergy list and
// active medications before recommending any further treatment.
