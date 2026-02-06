# jb2hubs - Snakemake Workflow

Modular Snakemake workflows for generating JBrowse2 genome hubs.

**Pipelines:**
- **genark2jbrowse**: Process NCBI GenArk hubs (~5-10 hubs, ~30 min)
- **ucsc2jbrowse**: Process UCSC Golden Path assemblies (~100+ assemblies, ~4-6 hours)

## Optimized for Daily Incremental Runs

**Data changes ~weekly, runs happen daily.** The workflows:

- ✅ **Always download/rsync** (rsync is efficient - only transfers changed blocks)
- ✅ **Let Snakemake track changes** (uses timestamps, skips unchanged rules)
- ✅ **Process only new/modified items** (rules depend on data, not timestamps)

### How Incremental Works

**First run (Monday):**
```
Download list → Transform → Rsync all → Process all (6 hours)
```

**Daily runs (Tue-Sun):**
```
Download list → No changes → Rsync skips unchanged files → Skip processing (30 seconds)
```

**Weekly update (Next Monday):**
```
Download list → Content changed → Rsync syncs new files → Process new items (30 min)
```

Rsync is smart about only transferring changed data. Snakemake is smart about only running rules whose inputs changed. Together: **minimal work on each run**.

### Simple Pattern

No caching logic needed. Just:
- Download/rsync every run (rsync handles deduplication)
- Snakemake tracks timestamps automatically
- Rules only re-run if inputs changed

## Quick Start

### Installation (One-time)

```bash
bash genark2jbrowse/setup_snakemake.sh
conda activate snakemake
```

### Run Both Pipelines
```bash
snakemake --cores 8
```

### Run Individual Pipelines
```bash
# GenArk only
snakemake --config pipelines=genark2jbrowse --cores 4

# UCSC only
snakemake --config pipelines=ucsc2jbrowse --cores 16
```

### Preview Before Running
```bash
snakemake --dry-run --reason
```

### Visualize Dependencies
```bash
snakemake --dag | dot -Tpng > dag.png
```

## Common Commands

| Task | Command |
|------|---------|
| Run both pipelines | `snakemake --cores 8` |
| Run GenArk only | `snakemake --config pipelines=genark2jbrowse --cores 4` |
| Run UCSC only | `snakemake --config pipelines=ucsc2jbrowse --cores 16` |
| Preview what runs | `snakemake --dry-run --reason` |
| Force rebuild everything | `snakemake --forceall --cores 8` |
| Skip UCSC download | `snakemake --config pipelines=ucsc2jbrowse ucsc2jbrowse_skip_download=true --cores 8` |
| Monitor progress | `tail -f */logs/*/*log` |
| View DAG graph | `snakemake --dag \| dot -Tpng > dag.png` |

## Configuration

### GenArk Config (`genark2jbrowse/snakemake_config.yaml`)
```yaml
hub_categories: ["mammals", "primates"]   # Which hub categories to process
max_hubs: 5                                # Max hubs per category
cores: 4                                   # Default cores
```

### UCSC Config (`ucsc2jbrowse/snakemake_config.yaml`)
```yaml
skip_download: false                       # Skip download phase
reprocess: false                           # Force reprocess everything
max_parallel_downloads: 2                  # Don't overwhelm UCSC servers
cores: 4                                   # Default cores
ucsc_data_dir: "~/ucsc"                   # Download location
ucsc_results_dir: "~/ucscResults"         # Results location
```

## File Structure

```
jb2hubs/
├── Snakefile                    ← Master workflow (orchestrates both)
├── README.md                    ← This file
│
├── genark2jbrowse/
│   ├── Snakefile               ← GenArk pipeline (86 lines)
│   ├── snakemake_config.yaml   ← GenArk configuration
│   ├── src/                    ← TypeScript scripts
│   ├── hash_if_needed.sh       ← Hashing utility (still used)
│   └── setup_snakemake.sh      ← Installation script
│
└── ucsc2jbrowse/
    ├── Snakefile               ← UCSC pipeline (246 lines)
    ├── snakemake_config.yaml   ← UCSC configuration
    ├── src/                    ← TypeScript scripts
    └── hash_if_needed.sh       ← Hashing utility (still used)
```

## How the Master Snakefile Works

The master `Snakefile` uses Snakemake's `include` directive to load pipeline-specific rules:

```python
if "genark2jbrowse" in PIPELINES:
    include: "genark2jbrowse/Snakefile"

if "ucsc2jbrowse" in PIPELINES:
    include: "ucsc2jbrowse/Snakefile"
```

**Benefits:**
- Each pipeline independent (run separately or together)
- Pipelines can run in parallel (if cores allow)
- Easy to add new pipelines (just create a directory + Snakefile)
- Single entry point (`snakemake` from jb2hubs root)

## Adding a New Pipeline

```bash
# 1. Create directory
mkdir newpipeline

# 2. Create Snakefile
cat > newpipeline/Snakefile <<'EOF'
configfile: "snakemake_config.yaml"

rule all:
    input: "output.json"

rule process:
    output: "output.json"
    shell: "node src/process.ts"
EOF

# 3. Create config
cat > newpipeline/snakemake_config.yaml <<'EOF'
cores: 4
EOF

# 4. Update master Snakefile (add before onsuccess):
# if "newpipeline" in PIPELINES:
#     include: "newpipeline/Snakefile"

# 5. Run
snakemake --config pipelines=newpipeline --cores 4
```

## Examples

### Example 1: Test Run (Both Pipelines)
```bash
# Configure for quick test
echo 'max_hubs: 2' > genark2jbrowse/snakemake_config.yaml
echo 'ucsc_data_dir: ~/ucsc_test' > ucsc2jbrowse/snakemake_config.yaml

# Run both with 4 cores
snakemake --cores 4

# Expected: ~30 min, ~10 GB disk
```

### Example 2: GenArk Production
```bash
# Full GenArk pipeline
snakemake --config pipelines=genark2jbrowse --cores 8

# Results in: genark2jbrowse/processedHubJson/all.json
```

### Example 3: UCSC Production
```bash
# Full UCSC pipeline with 16 cores
snakemake --config pipelines=ucsc2jbrowse --cores 16

# Results in: ~/ucscResults/*/config.json, fileListing.txt
# Expected: ~6 hours, ~150 GB disk
```

### Example 4: Sequential Execution (Different Resources)
```bash
# GenArk (4 hours, 4 cores)
snakemake --config pipelines=genark2jbrowse --cores 4

# Then UCSC (6 hours, 16 cores)
snakemake --config pipelines=ucsc2jbrowse --cores 16
```

### Example 5: Rebuild After Code Change
```bash
# Modify a TypeScript file
vi genark2jbrowse/src/generateConfigs.ts

# Rebuild only affected rules
snakemake --config pipelines=genark2jbrowse --cores 4

# Time: ~5 min (not 30 min) - only affected rules rebuild
```

## Troubleshooting

### "No such file or directory: hash_if_needed.sh"
Make sure you're running from the pipeline directory (genark2jbrowse or ucsc2jbrowse), or ensure the script is in PATH.

### Task failed - where are the logs?
```bash
# Check pipeline-specific logs
tail -f genark2jbrowse/logs/*/*log
tail -f ucsc2jbrowse/logs/*/*log
```

### Want to reprocess only one assembly
```bash
# UCSC: rebuild just hg38
snakemake ucsc2jbrowse/logs/hg38/ --cores 1

# Or rebuild all hg38-related tasks
snakemake --cores 1 --wildcard-constraints assembly=hg38
```

### Running out of memory
```bash
# Reduce parallel tasks
snakemake --cores 4  # Instead of 16
```

### Want to skip UCSC download (use existing data)
```bash
snakemake --config pipelines=ucsc2jbrowse ucsc2jbrowse_skip_download=true --cores 8
```

## Performance

### Time Estimates
- **GenArk** (5-10 hubs): 30 min - 1 hour with 4 cores
- **UCSC** (100+ assemblies): 4-6 hours with 16 cores, 2-3 hours rebuild after change
- **Both together**: 6-8 hours with 8 cores

### Resource Requirements
- **GenArk**: 2-4 cores, 2-4 GB RAM, 5 GB disk
- **UCSC**: 8-16 cores, 4-8 GB RAM, 150+ GB disk
- **Recommended**: 16 cores, 16 GB RAM, 200+ GB disk

### Optimization Tips
- Run pipelines sequentially if low memory: `snakemake ... && snakemake ...`
- Use `--cores $(nproc)` on multi-core machines
- Rebuild skips unaffected rules (faster than bash approach)
- Use `--dry-run` to verify plan before running

## Architecture

### Master Workflow
```
                 snakemake --cores 8
                      |
        ________________|________________
       |                                |
   GenArk Pipeline            UCSC Pipeline
   (parallel)                 (parallel)
       |                                |
   ~5 rules                        ~40 rules
   ~30 min                         ~4 hours
```

### Per-Pipeline Structure

**GenArk (87 lines):**
1. Download hub lists
2. Checkpoint: discover hubs
3. Per-hub: fetch metadata + generate config
4. Global: merge results

**UCSC (246 lines):**
1. Download genome list
2. Checkpoint: download assemblies (rsync)
3. Per-assembly: create config, tracks, metadata
4. Global: merge, index, hash

Both use **checkpoint pattern** for dynamic discovery (don't know count until runtime).

## Key Features

✅ **Modular**: Run pipelines independently or together
✅ **Parallel**: Multiple pipelines share cores efficiently
✅ **Smart caching**: Rebuilds only affected tasks
✅ **Transparent**: `--dry-run` shows execution plan
✅ **Visualizable**: `--dag | dot` shows dependencies
✅ **Extensible**: Add new pipelines easily
✅ **Minimal**: 450 lines Snakemake + 2 config files
✅ **Replaced 800+ lines** of bash wrapper scripts

## Before/After

| Aspect | Bash | Snakemake |
|--------|------|-----------|
| Main files | make.sh (600 lines each) | Snakefile (86-246 lines) |
| Wrapper scripts | 30+ shell files | 2 only (hash + setup) |
| Dry-run | ❌ Not possible | ✅ `--dry-run --reason` |
| DAG visualization | ❌ Not possible | ✅ `--dag \| dot` |
| Parallel control | Scattered `-j` flags | Unified `--cores` |
| Rebuild changed | Manual (delete files) | Automatic (timestamps) |
| Configuration | Env vars + flags | YAML config |
| Total docs | 4000+ lines | This README (~400 lines) |

## Getting Help

```bash
# Show all rules
snakemake --list

# Show execution plan with reasons
snakemake --dry-run --reason | head -50

# Visualize task graph
snakemake --dag | dot -Tpng > workflow.png

# Check specific pipeline
snakemake --config pipelines=genark2jbrowse --dry-run
```

## Related Files

- **genark2jbrowse/snakemake_config.yaml** - GenArk configuration
- **ucsc2jbrowse/snakemake_config.yaml** - UCSC configuration
- **genark2jbrowse/setup_snakemake.sh** - Installation script
- **genark2jbrowse/hash_if_needed.sh** - File hashing utility

## Summary

This is a **minimal, modular workflow** that replaces 800+ lines of bash scripts with 450 lines of Snakemake code. It:

1. **Downloads** genome data (GenArk hubs or UCSC assemblies)
2. **Processes** into JBrowse configurations
3. **Merges** and finalizes outputs

Run from root:
```bash
snakemake --cores 8
```

That's it! 🚀

---

See [DEVELOPERS.md](DEVELOPERS.md) for info relevant to devs
