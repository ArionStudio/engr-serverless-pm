# Threat Modeling - Part 2

## What can go wrong?

This part identifies threats against the system model prepared in [Part 1](./Report_nr_3_1_What_Are_We_Working_On.md). The main method used here is STRIDE applied to the DFD elements, flows, trust zones, trust boundaries, and protected assets.

## 1. Threat identification objective

### 1.1 Purpose of this part

The purpose of this part is to answer the second question: "What can go wrong?" It turns the system model into concrete candidate threats and then records the most relevant threats as report findings.

### 1.2 Inputs used from Part 1

- System scope and business purpose
- External entities
- Internal components and processes
- Data stores
- Sensitive assets
- Trust zones and trust boundaries
- Security-relevant data flows
- Prepared DFDs
- Assumptions and external dependencies

### 1.3 Threat identification method used

Threats are identified by applying the STRIDE method to the DFDs and trust boundaries prepared in Part 1. The goal is not to list generic category names, but to derive concrete threats that match the actual design of the password manager.

---

## 2. STRIDE applicability

### 2.1 STRIDE categories used in this report

| Short name | Category               | Meaning in this report                                                            |
| ---------- | ---------------------- | --------------------------------------------------------------------------------- |
| S          | Spoofing               | `[ pretending to be a valid user, device, component, or service ]`                |
| T          | Tampering              | `[ unauthorized modification, rollback, corruption, or replay of data or state ]` |
| R          | Repudiation            | `[ denial of actions without enough evidence or auditability ]`                   |
| I          | Information Disclosure | `[ exposure of secrets or protected information ]`                                |
| D          | Denial of Service      | `[ making the system or security-critical action unavailable ]`                   |
| E          | Elevation of Privilege | `[ gaining more authority than intended ]`                                        |

### 2.2 STRIDE applicability by DFD element type

| Element type    | Relevant STRIDE categories                                                                                | Notes                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| External entity | `[ Spoofing, Repudiation ]`                                                                               | `[ use when identity or claimed action of an actor can be faked or denied ]`              |
| Process         | `[ Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege ]` | `[ processes usually need the broadest analysis ]`                                        |
| Data flow       | `[ Tampering, Information Disclosure, Denial of Service ]`                                                | `[ use for interception, modification, replay, leakage, and blocking ]`                   |
| Data store      | `[ Tampering, Information Disclosure, Denial of Service ]`                                                | `[ use for unauthorized read, write, rollback, deletion, and corruption ]`                |
| Trust boundary  | `[ not a direct STRIDE element ]`                                                                         | `[ use boundaries to focus where trust changes and where threats become more important ]` |

### 2.3 Threat-writing rules

- Each threat should be written as a concrete system-specific statement.
- Each threat should reference at least one DFD element, flow, or trust boundary.
- Each threat should identify which assets are affected.
- Existing controls should be noted, even if they do not fully mitigate the threat.
- If a threat is already sufficiently addressed by design, record that and decide whether it still needs to be a formal finding.

---

## 3. Threat identification worksheets

### 3.1 Worksheet by DFD or scenario

Use this table as the working area for candidate threats.

| Threat ID | DFD / scenario reference | Element / flow       | STRIDE category             | Threat statement                  | Affected assets | Boundary / zone involved | Existing controls      | Required mitigation / next step |
| --------- | ------------------------ | -------------------- | --------------------------- | --------------------------------- | --------------- | ------------------------ | ---------------------- | ------------------------------- |
| T1        | `[ DFD-# / S# ]`         | `[ element / flow ]` | `[ S / T / R / I / D / E ]` | `[ concrete threat description ]` | `[ assets ]`    | `[ boundary / zone ]`    | `[ current controls ]` | `[ mitigation or follow-up ]`   |
| T2        | `[ DFD-# / S# ]`         | `[ element / flow ]` | `[ S / T / R / I / D / E ]` | `[ concrete threat description ]` | `[ assets ]`    | `[ boundary / zone ]`    | `[ current controls ]` | `[ mitigation or follow-up ]`   |
| T3        | `[ DFD-# / S# ]`         | `[ element / flow ]` | `[ S / T / R / I / D / E ]` | `[ concrete threat description ]` | `[ assets ]`    | `[ boundary / zone ]`    | `[ current controls ]` | `[ mitigation or follow-up ]`   |
| T4        | `[ DFD-# / S# ]`         | `[ element / flow ]` | `[ S / T / R / I / D / E ]` | `[ concrete threat description ]` | `[ assets ]`    | `[ boundary / zone ]`    | `[ current controls ]` | `[ mitigation or follow-up ]`   |

### 3.2 Worksheet grouped by STRIDE category

| Category               | Candidate threats identified | Most exposed elements | Notes       |
| ---------------------- | ---------------------------- | --------------------- | ----------- |
| Spoofing               | `[ list or count ]`          | `[ elements ]`        | `[ notes ]` |
| Tampering              | `[ list or count ]`          | `[ elements ]`        | `[ notes ]` |
| Repudiation            | `[ list or count ]`          | `[ elements ]`        | `[ notes ]` |
| Information Disclosure | `[ list or count ]`          | `[ elements ]`        | `[ notes ]` |
| Denial of Service      | `[ list or count ]`          | `[ elements ]`        | `[ notes ]` |
| Elevation of Privilege | `[ list or count ]`          | `[ elements ]`        | `[ notes ]` |

---

## 4. Findings register

This section records the threats that remain relevant after the initial review and should appear as formal findings.

| Finding ID | Title                     | Related threat ID(s) | STRIDE category             | Severity / priority                  | Affected element(s) | Main consequence  | Why it matters      | Recommended mitigation | Status                                       |
| ---------- | ------------------------- | -------------------- | --------------------------- | ------------------------------------ | ------------------- | ----------------- | ------------------- | ---------------------- | -------------------------------------------- |
| F1         | `[ short finding title ]` | `[ T# ]`             | `[ S / T / R / I / D / E ]` | `[ low / medium / high / critical ]` | `[ elements ]`      | `[ consequence ]` | `[ justification ]` | `[ mitigation ]`       | `[ open / mitigated / accepted / deferred ]` |
| F2         | `[ short finding title ]` | `[ T# ]`             | `[ S / T / R / I / D / E ]` | `[ low / medium / high / critical ]` | `[ elements ]`      | `[ consequence ]` | `[ justification ]` | `[ mitigation ]`       | `[ open / mitigated / accepted / deferred ]` |
| F3         | `[ short finding title ]` | `[ T# ]`             | `[ S / T / R / I / D / E ]` | `[ low / medium / high / critical ]` | `[ elements ]`      | `[ consequence ]` | `[ justification ]` | `[ mitigation ]`       | `[ open / mitigated / accepted / deferred ]` |

### 4.1 Notes for grouping threats into findings

- A finding may group several related threats if they share the same root cause.
- Grouping should remain traceable back to the worksheet entries.
- Findings should be written in a report-friendly way, not only as raw working notes.

---

## 5. Open questions and uncertainty

Use this section for areas where the threat analysis depends on missing design decisions, implementation details, or environmental assumptions.

| Question ID | Open question  | Why it affects threat analysis | Related element / finding | Needed follow-up |
| ----------- | -------------- | ------------------------------ | ------------------------- | ---------------- |
| Q1          | `[ question ]` | `[ reason ]`                   | `[ element / finding ]`   | `[ follow-up ]`  |
| Q2          | `[ question ]` | `[ reason ]`                   | `[ element / finding ]`   | `[ follow-up ]`  |
| Q3          | `[ question ]` | `[ reason ]`                   | `[ element / finding ]`   | `[ follow-up ]`  |

---

## 6. Completion checklist

- [ ] STRIDE categories defined for the report
- [ ] applicability of STRIDE to relevant DFD elements documented
- [ ] candidate threats listed from the prepared DFDs and trust boundaries
- [ ] each threat linked to concrete elements, flows, boundaries, or assets
- [ ] relevant findings extracted from the threat worksheet
- [ ] uncertainty and open questions recorded
- [ ] output is ready to feed mitigation planning in Part 3
