---
title: "Toolformer: Language Models Can Teach Themselves to Use Tools"
authors:
  - "Timo Schick"
  - "Jane Dwivedi-Yu"
  - "Roberto Dessì"
venue: "NeurIPS"
year: 2023
status: "Reading"
summary: "Explores how language models can learn to call external tools through self-supervised data generation."
tags:
  - "tool use"
  - "self-supervision"
  - "agents"
trail: "Tool Use & Agents"
citations:
  - label: "ReAct: Synergizing Reasoning and Acting"
    url: "https://arxiv.org/abs/2210.03629"
links:
  - label: "Paper"
    url: "https://arxiv.org/abs/2302.04761"
relatedSkills:
  - "agent-workflows"
  - "mcp-integration"
relatedMcp:
  - "github"
  - "filesystem"
featured: true
---

Toolformer is useful as a lens for deciding when a workflow should remain a prompt pattern and when it deserves a stable tool interface.

## Builder Notes

- Tool calls need clear affordances, predictable inputs, and cheap failure modes.
- Self-supervision helps produce training examples, but product workflows still need explicit verification.
- The most reusable tool interfaces should be documented like APIs, not hidden as prompt tricks.
