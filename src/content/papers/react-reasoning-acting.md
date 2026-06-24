---
title: "ReAct: Synergizing Reasoning and Acting in Language Models"
authors:
  - "Shunyu Yao"
  - "Jeffrey Zhao"
  - "Dian Yu"
venue: "ICLR"
year: 2023
status: "Notes"
summary: "Combines reasoning traces with environment actions so agents can plan, observe, and revise while solving tasks."
tags:
  - "agents"
  - "reasoning"
  - "acting"
trail: "Agents & Reasoning"
citations:
  - label: "Reflexion: Language Agents with Verbal Reinforcement Learning"
    url: "https://arxiv.org/abs/2303.11366"
links:
  - label: "Paper"
    url: "https://arxiv.org/abs/2210.03629"
relatedSkills:
  - "agent-workflows"
  - "evaluation-loops"
relatedMcp:
  - "github"
  - "filesystem"
featured: true
---

ReAct is the agent workflow reference for the site. It makes a simple point durable: useful agents need an action loop, but they also need observable state and repair paths.

## Builder Notes

- Model the loop as plan, act, observe, reflect, and verify.
- Keep actions inspectable so failures can be traced.
- Pair ReAct-style workflows with evaluation logs, not only prompt examples.
