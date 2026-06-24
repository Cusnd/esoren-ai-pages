---
title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
authors:
  - "Patrick Lewis"
  - "Ethan Perez"
  - "Aleksandra Piktus"
  - "Fabio Petroni"
venue: "NeurIPS"
year: 2020
status: "Notes"
summary: "Introduces RAG, a framework that combines parametric generation with non-parametric retrieval so answers can be grounded in external documents."
tags:
  - "RAG"
  - "knowledge retrieval"
  - "question answering"
trail: "RAG Foundations"
citations:
  - label: "REALM: Retrieval-Augmented Language Model Pre-Training"
    url: "https://arxiv.org/abs/2002.08909"
  - label: "Atlas: Few-shot Learning with Retrieval Augmented Language Models"
    url: "https://arxiv.org/abs/2208.03299"
links:
  - label: "Paper"
    url: "https://arxiv.org/abs/2005.11401"
relatedSkills:
  - "information-retrieval"
  - "evaluation-loops"
relatedMcp:
  - "arxiv-search"
  - "pdf-extract"
  - "semantic-scholar"
featured: true
---

RAG is the first paper in the current reading trail because it gives the archive a concrete foundation: retrieval is not just an implementation detail, it changes how a system stores, cites, and updates knowledge.

## Builder Notes

- Treat retrieval quality as part of generation quality.
- Keep the document corpus, retriever, and generator observable as separate parts.
- Track citations in the product surface so users can audit claims.
- Use this paper as the anchor for later notes on dense retrieval, reranking, and evaluation.

## Implementation Angle

For Soren AI Pages, this paper connects directly to the `Information Retrieval` skill and to MCP-style tools such as arXiv search, PDF extraction, and citation lookup.
