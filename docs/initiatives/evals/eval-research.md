# Basic Research for Eval Structure

## Layers of a possible eval system

Layers to answer:

1. **What are you evaluating?**
   A final answer, a step output, a whole trace, a tool call, a retrieval result, a simulation branch, a prompt version, or a whole workflow version.

2. **How are you scoring it?**
   Exact match, schema validation, code assertion, reference/golden answer, similarity, LLM-as-judge, pairwise preference, human review, safety check, cost/latency metric, etc.

3. **How are scores stored?**
   Per run, per step, per evaluator, per metric, per experiment.

4. **How are scores aggregated?**
   Pass rate, average score, grouped by scenario, compared across versions, plotted over time, regression-tested.

5. **How are results used?**
   Debug one trace, compare two runs, compare two flow versions, detect regressions, optimize prompts, or build reports.

## The main eval families

### 1. Deterministic / rule-based evals

These are the simplest and often the most important — but **not the v1 for the project**.

These measurements are possible, but many checks in the engine, including schemas for parsing json, statuses on steps, are already measured. And while these are great goals to extend an eval system, they are not the first priority.

Examples:

- Did the output parse as JSON?
- Did it match a Zod schema?
- Did it include required fields?
- Did it call the expected tool?
- Did the workflow complete without errors?
- Did a step produce an artifact?
- Did a value fall within an allowed range?
- Did latency stay under a threshold?

This is the eval equivalent of unit testing. OpenAI's grader docs list simple grader types like string checks, text similarity, model graders, and Python code execution — deterministic graders return clear, repeatable scores, often `0` or `1`. ([OpenAI Developers][1])

Example score:

```ts
{
  evaluatorType: "schema_check",
  metric: "valid_json",
  score: 1,
  passed: true
}
```

---

### 2. Golden-answer / reference evals

These compare a model or workflow output against a known expected answer.

Also **not the v1 version of evals**. Genuinely a great standard for evals, but not a first goal.

Examples:

- Classification: expected label is `"rainy"`; model says `"rainy"` -> pass.
- QA: expected answer includes "Paris"; model says "Paris" -> pass.
- Extraction: expected JSON field equals known value.
- Summarization: compare against a reference summary.

Typical metrics:

- accuracy
- exact match
- precision / recall / F1
- edit distance
- BLEU / ROUGE / METEOR
- embedding cosine similarity
- semantic similarity

OpenAI's eval guide describes the common pattern: define the task, run test inputs, compare model outputs against criteria or ground truth, then analyze and iterate. It also shows test data containing inputs plus ground-truth labels. ([OpenAI Developers][2])

Good for:

- classification
- extraction
- routing
- tool selection
- factual QA with known answers
- regression tests

Weak for:

- open-ended writing
- creative output
- multi-step agent behavior
- subjective quality

---

### 3. Rubric-based LLM-as-judge evals

**The v1 version of evals in this system**

This is where a separate model scores the workflow output according to a rubric.

Example rubric dimensions:

- correctness
- completeness
- faithfulness to provided data
- helpfulness
- clarity
- instruction following
- unnecessary speculation
- safety / policy compliance
- formatting quality

OpenAI's current grader docs describe "score model" graders as model-based graders that return a numeric score within a configured range. ([OpenAI Developers][1])

A v1 judge output could be:

```ts
{
  "overall": 0.82,
  "passed": true,
  "dimensions": {
    "correctness": 0.8,
    "faithfulness": 0.9,
    "completeness": 0.7,
    "format": 1.0
  },
  "failureModes": ["minor_omission"],
  "rationale": "The answer used the weather data correctly but omitted wind information."
}
```

This fits my current use case, as the judge can consume:

- run params
- step exports
- final output
- trace summary
- selected artifacts
- simulation metadata
- mock/sim branch information

LLM-as-judge is especially useful for open-ended outputs, but it has known failure modes. The MT-Bench / Chatbot Arena paper found strong LLM judges can approximate human preference well, but also discusses position bias, verbosity bias, self-enhancement bias, and limited reasoning ability. ([arXiv][3])

---

### 4. Pairwise / preference evals

**Actually a genuinely useful implementation in the engine, not v1 but shortly after adaptation of llm-as-judge.**

Instead of asking "what score did output A get?", ask instead:

> Which is better: output A or output B?

This is useful when absolute scores are hard but relative comparison is easier.

Examples:

- Prompt v1 vs prompt v2
- Model A vs model B
- Flow version A vs flow version B
- With retrieval vs without retrieval
- Real tool result vs mocked result
- Original run vs simulation branch

Chatbot Arena popularized large-scale pairwise human preference evaluation for LLMs, using pairwise comparisons and statistical ranking methods. ([arXiv][4]) LangSmith also supports pairwise evaluation for comparing experiment outputs. ([Docs by LangChain][5])

Example:

```ts
{
  evaluatorType: "pairwise_llm_judge",
  baselineRunId: "run_a",
  candidateRunId: "run_b",
  winner: "candidate",
  preferenceScore: 0.71,
  reasons: ["more grounded", "better structured", "less vague"]
}
```

---

### 5. Trace / process evals

**Possibly powerful for analyzing the workflow engine**

Instead of only asking whether the final answer was good, ask whether the **process** was good:

- Did the right steps execute?
- Did the flow call the weather API before summarizing?
- Did the LLM use the tool result rather than inventing data?
- Did the router choose the correct branch?
- Did a retry happen?
- Did a guardrail stop something?
- Did the trace contain an avoidable error?
- Did the workflow spend too many tokens?
- Did it make unnecessary tool calls?

OpenAI's agent eval docs explicitly call out trace grading for workflow-level issues: traces capture model calls, tool calls, guardrails, and handoffs, and graders can score those traces for regressions and failure modes. ([OpenAI Developers][6])

Great for evaluating how a process happened.

---

### 6. RAG / retrieval evals

This matters if you later add retrieval, memory, file search, vector search, or context assembly.

Common metrics:

- context precision: were retrieved chunks relevant?
- context recall: did retrieval include needed evidence?
- answer faithfulness: is the answer supported by retrieved context?
- answer relevance: does the answer address the user's question?
- citation correctness
- hallucination / unsupported claim rate

Ragas is one common framework in this space; its docs describe metrics such as context precision, including versions that compare retrieved contexts against either a reference answer or generated response. ([Ragas][7])

---

### 7. Human review / annotation evals

Human evaluation is still the best signal for subjective product quality.

Examples:

- "Was this answer useful?"
- "Would you ship this?"
- "Which output do you prefer?"
- "Was the tool use appropriate?"
- "Was the failure acceptable?"

LangSmith treats human review, code rules, LLM-as-judge, and pairwise comparison as different evaluator types inside an evaluation workflow. ([Docs by LangChain][8])

Human review can be simple at first:

```ts
{
  evaluatorType: "human",
  score: 4,
  scale: [1, 5],
  label: "good",
  notes: "Accurate but too verbose."
}
```

This is something I could use to grade execution runs myself or allow within the system.

---

### 8. Online / production evals

Offline evals run against curated datasets before shipping. Online evals score real runs after deployment, often without reference answers. LangSmith makes this distinction explicitly: offline evals use datasets/examples, while online evals run on production traces where reference outputs may not exist. ([Docs by LangChain][9])

- **offline**: run 50 test cases against flow version A and B
- **online/live**: every actual run emits eval events, maybe sampled
- **debug**: manually evaluate a single trace
- **simulation**: evaluate forked runs against originals

It's possible to leverage evals as part of the system, not just a batch tool -- especially after each run, as an automated step.

## Various applications of evals at different levels

### Level 1: Step eval

Evaluate one step's output / exports. **Main v1 approach**.

Examples:

- LLM step produced valid JSON.
- Weather API step returned required fields.
- Template interpolation succeeded.
- Markdown export exists.
- Tool call arguments matched schema.

This is very v1-friendly.

---

### Level 2: Run eval (currently there's no concept of a run's output, constantly been deferred)

Evaluate the whole run's final result. **Basically the same mechanism as step evals, just need to define what this is**.

Examples:

- Final answer was useful.
- Final answer used the weather data.
- No hallucinated weather values.
- Output followed requested format.

---

### Level 3: Trace/process eval

Evaluate the execution path.

Examples:

- Correct branch was selected.
- Required steps happened in order.
- Retry logic worked.
- No unnecessary tool calls.
- Mocked step was correctly reused.
- Simulated branch differs only where expected.

---

### Level 4: Experiment eval

Evaluate a group of runs. **Possibly the ability to batch evals of a specific nature**

Examples:

- Prompt v2 improved faithfulness by 12%.
- Local LLM judge gives lower completeness than remote judge.
- Flow version B has fewer schema failures.
- Mocked API responses expose a failure mode.
- Temperature increase improved creativity but hurt factuality.

---

### Level 5: Regression / release gate

Evaluate whether a change is safe to merge or demo.

Examples:

- Must pass all schema checks.
- Must maintain average judge score above 0.75.
- Must not regress by more than 5% from baseline.
- Must not introduce new failure mode tags.
- Must pass smoke dataset.

This is evals as engineering structure. Some of this happens already but evals as a way to do this is interesting.

## Standard scoring shapes

Not a universal scoring shape, but a common envelope to hold different score types.

Some major score types:

```ts
type ScoreKind =
  | "boolean" // pass/fail
  | "numeric" // 0..1, 1..5, etc.
  | "categorical" // good / bad / partial
  | "multi_metric" // correctness, faithfulness, format, etc.
  | "pairwise" // A wins, B wins, tie
  | "ranking" // ordered candidates
  | "diagnostic"; // failure tags, notes, explanations
```

Many eval platforms end up combining these. HELM is a good example of why multi-metric evaluation matters: it evaluates across multiple scenarios and desiderata such as accuracy, calibration, robustness, fairness, bias, toxicity, and efficiency rather than relying on one number. ([arXiv][10])

Initially avoid designing around a single `score: number` field. A flexible result envelope fits better:

Example:

```ts
type EvalResult = {
  evalResultId: string;
  evalRunId: string;

  target: {
    runId: string;
    stepId?: string;
    artifactId?: string;
    exportName?: string;
  };

  evaluator: {
    evaluatorId: string;
    evaluatorType: string;
    evaluatorVersion: string;
    rubricVersion?: string;
    model?: string;
  };

  metric: {
    name: string;
    dimension?: string;
    scoreKind:
      "boolean" | "numeric" | "categorical" | "pairwise" | "diagnostic";
    score?: number;
    passed?: boolean;
    label?: string;
    threshold?: number;
  };

  diagnostics?: {
    rationale?: string;
    failureModes?: string[];
    evidenceRefs?: string[];
  };

  metadata: {
    flowId: string;
    flowVersion?: string;
    runStartedAt: string;
    createdAt: string;
  };
};
```

This shape supports deterministic checks, LLM judge scores, human ratings, pairwise preferences, and trace diagnostics without redesigning later.

## What I would build for v1

### LLM judge evaluator

For open-ended quality.

Suggested dimensions:

```json
{
  "correctness": 0.0,
  "faithfulness": 0.0,
  "completeness": 0.0,
  "format": 0.0,
  "overall": 0.0,
  "passed": false,
  "failureModes": [],
  "rationale": ""
}
```

### Trace/process evaluator

Examples:

```json
{
  "usedRequiredSteps": true,
  "calledWeatherBeforeFinalLLM": true,
  "reusedMockedStepCorrectly": true,
  "unnecessaryToolCalls": 0,
  "passed": true
}
```

## Possible data concepts

### `EvalSuite`

A named collection of evaluators. Example: `"weather-answer-quality-v1"`.

### `EvalRun`

One execution of an eval suite against one or more workflow runs. Example: "evaluate 20 weather prompt variants."

### `EvalResult`

One evaluator's score for one target. Example: "LLM judge scored run 123 faithfulness as 0.9."

### `Experiment`

A grouping layer for comparing variants. Example: "prompt A vs prompt B, 10 runs each."

### `DatasetItem`

Inputs plus optional reference outputs and metadata. LangSmith's model of datasets/examples/experiments is a useful conceptual reference: examples contain inputs, optional reference outputs, and metadata, while experiments capture outputs, scores, and traces for each example. ([Docs by LangChain][9])

## References

OpenAI's own docs say the older Evals platform is being deprecated, even though the concepts remain useful. ([OpenAI Developers][2])

[1]: https://developers.openai.com/api/docs/guides/graders "Graders | OpenAI API"
[2]: https://developers.openai.com/api/docs/guides/evals "Working with evals | OpenAI API"
[3]: https://arxiv.org/abs/2306.05685?utm_source=chatgpt.com "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"
[4]: https://arxiv.org/abs/2403.04132?utm_source=chatgpt.com "Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference"
[5]: https://docs.langchain.com/langsmith/evaluate-pairwise?utm_source=chatgpt.com "How to run a pairwise evaluation"
[6]: https://developers.openai.com/api/docs/guides/agent-evals "Evaluate agent workflows | OpenAI API"
[7]: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/context_precision/ "Context Precision - Ragas"
[8]: https://docs.langchain.com/langsmith/evaluation "LangSmith Evaluation - Docs by LangChain"
[9]: https://docs.langchain.com/langsmith/evaluation-concepts "Evaluation concepts - Docs by LangChain"
[10]: https://arxiv.org/abs/2211.09110?utm_source=chatgpt.com "Holistic Evaluation of Language Models"
