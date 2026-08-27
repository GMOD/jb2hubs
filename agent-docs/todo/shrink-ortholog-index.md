# `ortholog_index.json` is 9× bigger than it needs to be

4.34 MB (1.11 MB gzipped), the gene page's largest asset. Only two things are
read from it: whether an accession is one we host, and its `ucscDb` (62
entries). The names in it duplicate `taxname`/`common_name`, which every
ortholog report already carries — and NCBI's copies are cleaner, with no
assembly parenthetical to strip.

An accession list plus the `ucscDb` map measures 672 KB raw / 120 KB gzipped.
