# Healthcare Patient Record Sync

> How `mcp-state-sync` prevents adverse clinical decisions from stale patient data.

---

## The Scenario

An LLM-powered clinical assistant helps physicians manage patient records, prescriptions, lab orders, and vitals via MCP tools. The hospital system is inherently multi-user: nurses, other physicians, lab technicians, and pharmacists all update patient records simultaneously through different interfaces (EMR workstations, bedside terminals, mobile devices).

## The Danger

```
Turn 1: LLM reads patient.getAllergies("P-4401")
        → Response: ["Penicillin"]

Turn 3: Nurse updates patient allergies via EMR terminal
        → Adds "Sulfonamides" to the allergy list
        → The LLM has no way to observe this update

Turn 5: Physician asks: "What antibiotic can we prescribe for this UTI?"
        → LLM checks its context: allergies are ["Penicillin"] (Turn 1)
        → LLM recommends Sulfamethoxazole (a sulfonamide)
        → prescriptions.create() is called

Turn 6: ADVERSE DRUG REACTION
        → Patient is allergic to Sulfonamides
        → The allergy was documented, but the LLM used stale data
```

This is not a hypothetical edge case. In a hospital, patient records change constantly:
- Nurses record vitals and update intake notes
- Pharmacists flag drug interactions
- Lab results arrive asynchronously
- Other physicians add diagnoses and treatments
- Patients themselves report symptoms to bedside terminals

The LLM sees a frozen snapshot from an earlier turn and treats it as the complete, current record.

## How StateSync Solves This

### Static signal — everything patient-related is `no-store`

```
name: "patient.getAllergies"
description: "Get all known allergies for a patient. [Cache-Control: no-store]"

name: "patient.getMedications"
description: "Get active medications for a patient. [Cache-Control: no-store]"
```

The LLM sees `[Cache-Control: no-store]` on every clinical data tool and learns that patient records must be re-read before every decision.

### Dynamic signal — prescription writes invalidate the full patient domain

When a prescription is created successfully:

```
Content Block 0:
  [System: Cache invalidated for patient.*, prescriptions.*, interactions.* — caused by prescriptions.create]

Content Block 1:
  {"ok": true, "rx_id": "RX-20241205-001"}
```

After this signal, the LLM knows:
1. Its cached patient data (allergies, medications, conditions) is stale
2. Its cached prescription list is stale
3. Its cached drug interaction analysis is stale

Before recommending any further treatment, it **must** re-read the patient record.

### Reference data is `immutable`

Not everything changes. ICD-10 diagnosis codes, drug formulary identifiers, and lab test codes are international standards that remain stable within a clinical session:

```
name: "icd10.lookup"
description: "Look up an ICD-10 diagnosis code. [Cache-Control: immutable]"
```

The LLM can safely reference ICD-10 code J06.9 (acute upper respiratory infection) from its context without re-reading — the code's meaning hasn't changed.

## Policy Configuration

```typescript
const sync = new StateSync({
    defaults: { cacheControl: 'no-store' },
    policies: [
        // International standards — safe to cache
        { match: 'icd10.*',        cacheControl: 'immutable' },
        { match: 'formulary.*',    cacheControl: 'immutable' },
        { match: 'labCodes.*',     cacheControl: 'immutable' },

        // Prescription writes invalidate the full patient domain
        {
            match: 'prescriptions.create',
            invalidates: [
                'patient.*',           // Allergy list, active meds, conditions
                'prescriptions.*',     // Active prescriptions list
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

        // Lab orders
        {
            match: 'labOrders.create',
            invalidates: ['labOrders.*', 'patient.*'],
        },

        // Vitals recording
        {
            match: 'vitals.record',
            invalidates: ['vitals.*', 'patient.*'],
        },

        // Everything else: no-store (default)
    ],
});
```

### Why `patient.*` appears in every write's invalidation list

A patient's summary view typically aggregates data from multiple sources: active medications, pending lab orders, latest vitals, recent prescriptions. When any of these change, the patient summary is stale.

By including `patient.*` in every write operation's invalidation list, we ensure the LLM always has a fresh view of the complete patient record before making clinical decisions.

The cost of over-invalidation (one extra API call to re-read patient data) is negligible compared to the cost of an adverse drug reaction caused by stale allergy data.

## Complete Code Example

→ See [`healthcare-patient-records.ts`](./healthcare-patient-records.ts)
