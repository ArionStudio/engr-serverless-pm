# Threat Modeling - Part 3

## What are we going to do about it?

This part plans how the identified findings will be addressed. It uses the findings from [Part 2](./Report_nr_3_2_What_Can_Go_Wrong.md) and turns them into controls, design decisions, implementation tasks, and priorities.

## 1. Mitigation objective

### 1.1 Purpose of this part

The purpose of this part is to answer the third question: "What are we going to do about it?" It records how the identified threats will be mitigated, reduced, accepted, or deferred.

### 1.2 Inputs used from Part 2

- Threat identification worksheet
- Findings register
- Severity or priority decisions
- Open questions that affect mitigations

---

## 2. Mitigation strategy

### 2.1 General security strategy

`[ explain the overall mitigation approach, for example prevent by design, reduce attack surface, validate untrusted inputs, minimize secret exposure, and prefer secure defaults ]`

### 2.2 Types of treatment used in this report

| Treatment type | Meaning                                                                          | When it is used                                               |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Mitigate       | `[ reduce likelihood or impact with controls ]`                                  | `[ when the risk should be addressed ]`                       |
| Avoid          | `[ change the design so the threat no longer applies ]`                          | `[ when the feature or pattern is too risky ]`                |
| Transfer       | `[ move part of the responsibility to another mechanism or trusted dependency ]` | `[ if justified ]`                                            |
| Accept         | `[ explicitly keep the residual risk ]`                                          | `[ when the risk is low or unavoidable ]`                     |
| Defer          | `[ postpone the mitigation with justification ]`                                 | `[ when dependency or scope reasons block immediate action ]` |

---

## 3. Existing controls inventory

Document the protections that already exist in the design before proposing new mitigations.

| Control ID | Existing control | Protects against         | Where it applies | Notes       |
| ---------- | ---------------- | ------------------------ | ---------------- | ----------- |
| C1         | `[ control ]`    | `[ threats / findings ]` | `[ elements ]`   | `[ notes ]` |
| C2         | `[ control ]`    | `[ threats / findings ]` | `[ elements ]`   | `[ notes ]` |
| C3         | `[ control ]`    | `[ threats / findings ]` | `[ elements ]`   | `[ notes ]` |

---

## 4. Mitigation plan by finding

| Finding ID | Selected treatment                                 | Existing controls | Planned mitigation | Owner / scope             | Priority                  | Expected result | Residual risk after action | Status                             |
| ---------- | -------------------------------------------------- | ----------------- | ------------------ | ------------------------- | ------------------------- | --------------- | -------------------------- | ---------------------------------- |
| F1         | `[ mitigate / avoid / transfer / accept / defer ]` | `[ controls ]`    | `[ action ]`       | `[ component / process ]` | `[ low / medium / high ]` | `[ result ]`    | `[ residual risk ]`        | `[ planned / in progress / done ]` |
| F2         | `[ mitigate / avoid / transfer / accept / defer ]` | `[ controls ]`    | `[ action ]`       | `[ component / process ]` | `[ low / medium / high ]` | `[ result ]`    | `[ residual risk ]`        | `[ planned / in progress / done ]` |
| F3         | `[ mitigate / avoid / transfer / accept / defer ]` | `[ controls ]`    | `[ action ]`       | `[ component / process ]` | `[ low / medium / high ]` | `[ result ]`    | `[ residual risk ]`        | `[ planned / in progress / done ]` |

### 4.1 Design or architecture changes required

| Change ID | Description of change | Reason       | Related finding(s) | Impacted components | Notes       |
| --------- | --------------------- | ------------ | ------------------ | ------------------- | ----------- |
| CH1       | `[ change ]`          | `[ reason ]` | `[ F# ]`           | `[ components ]`    | `[ notes ]` |
| CH2       | `[ change ]`          | `[ reason ]` | `[ F# ]`           | `[ components ]`    | `[ notes ]` |

---

## 5. Verification actions for mitigations

Define how each important mitigation should later be verified.

| Verification ID | Related finding / mitigation | Verification method                                         | Evidence expected | When to verify |
| --------------- | ---------------------------- | ----------------------------------------------------------- | ----------------- | -------------- |
| V1              | `[ F# / mitigation ]`        | `[ test / review / diagram update / implementation check ]` | `[ evidence ]`    | `[ timing ]`   |
| V2              | `[ F# / mitigation ]`        | `[ test / review / diagram update / implementation check ]` | `[ evidence ]`    | `[ timing ]`   |
| V3              | `[ F# / mitigation ]`        | `[ test / review / diagram update / implementation check ]` | `[ evidence ]`    | `[ timing ]`   |

---

## 6. Deferred items and accepted risks

Use this section only for cases where no immediate mitigation is planned.

| Item ID | Related finding | Decision                  | Justification | Conditions for revisit |
| ------- | --------------- | ------------------------- | ------------- | ---------------------- |
| D1      | `[ F# ]`        | `[ accepted / deferred ]` | `[ reason ]`  | `[ trigger ]`          |
| D2      | `[ F# ]`        | `[ accepted / deferred ]` | `[ reason ]`  | `[ trigger ]`          |

---

## 7. Completion checklist

- [ ] treatment strategy defined
- [ ] existing controls documented
- [ ] each relevant finding mapped to a planned treatment
- [ ] architecture or design changes recorded where needed
- [ ] verification actions defined for important mitigations
- [ ] accepted or deferred risks explicitly justified
- [ ] output is ready for final evaluation in Part 4
