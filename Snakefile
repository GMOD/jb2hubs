"""
Master Snakemake workflow for jb2hubs project

This master workflow orchestrates multiple JBrowse hub pipelines:
- genark2jbrowse: Process NCBI GenArk hubs
- ucsc2jbrowse:   Process UCSC Golden Path assemblies

Modularity features:
- Run any combination of pipelines via --config
- Each pipeline maintains its own configuration
- Shared rules can be referenced by multiple pipelines
- Easy to add new pipelines in the future

Usage:
  # Run both pipelines
  snakemake --cores 8

  # Run only genark2jbrowse
  snakemake --config pipelines=genark2jbrowse --cores 4

  # Run only ucsc2jbrowse
  snakemake --config pipelines=ucsc2jbrowse --cores 4

  # Run in sequence with different cores
  snakemake --cores 8 --config pipelines=genark2jbrowse
  snakemake --cores 16 --config pipelines=ucsc2jbrowse

  # Preview both pipelines
  snakemake --dry-run --reason

  # Visualize both pipelines
  snakemake --dag | dot -Tpng > dag.png
"""

import os
from pathlib import Path

# --- Configuration ---

# Determine which pipelines to run
# Options: "genark2jbrowse", "ucsc2jbrowse", or comma-separated list
PIPELINES = config.get("pipelines", "genark2jbrowse,ucsc2jbrowse").split(",")
PIPELINES = [p.strip() for p in PIPELINES]  # Clean whitespace

# Validate pipeline names
VALID_PIPELINES = {"genark2jbrowse", "ucsc2jbrowse"}
for pipeline in PIPELINES:
    if pipeline not in VALID_PIPELINES:
        raise ValueError(
            f"Unknown pipeline: {pipeline}. "
            f"Valid options: {', '.join(sorted(VALID_PIPELINES))}"
        )

# Build list of final targets based on selected pipelines
FINAL_TARGETS = []

if "genark2jbrowse" in PIPELINES:
    FINAL_TARGETS.extend([
        "genark2jbrowse/processedHubJson/all.json",
    ])

if "ucsc2jbrowse" in PIPELINES:
    FINAL_TARGETS.extend([
        "ucsc2jbrowse/fileListing.txt",
    ])

print(f"\n{'='*70}")
print(f"jb2hubs Master Workflow")
print(f"{'='*70}")
print(f"Running pipelines: {', '.join(PIPELINES)}")
print(f"Target outputs: {len(FINAL_TARGETS)}")
print(f"{'='*70}\n")


# --- Master Rule ---

rule all:
    """
    Master rule requesting final outputs from all selected pipelines.
    Each pipeline provides its own outputs.
    """
    input:
        FINAL_TARGETS,


# --- Include Pipeline-Specific Rules ---

if "genark2jbrowse" in PIPELINES:
    include: "genark2jbrowse/Snakefile"


if "ucsc2jbrowse" in PIPELINES:
    include: "ucsc2jbrowse/Snakefile"


# --- Success/Error Handlers ---

onsuccess:
    print("\n" + "="*70)
    print("✓ jb2hubs master workflow completed successfully!")
    print("="*70)
    print("\nCompleted pipelines:")
    for pipeline in PIPELINES:
        if pipeline == "genark2jbrowse":
            print(f"  ✓ GenArk hubs: processedHubJson/all.json")
        elif pipeline == "ucsc2jbrowse":
            print(f"  ✓ UCSC assemblies: fileListing.txt")
    print("\nNext steps:")
    print("  - View logs: ls logs/")
    print("  - Check outputs in each pipeline directory")
    print("="*70 + "\n")


onerror:
    print("\n" + "="*70)
    print("✗ Workflow failed. Check logs in logs/ directories.")
    print("="*70 + "\n")
