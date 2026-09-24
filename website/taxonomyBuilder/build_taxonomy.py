import argparse
import json
import os
import sys
import urllib.request
import zipfile


def download_and_extract_taxonomy_dump(download_dir="."):
    """
    Downloads and extracts NCBI taxonomy dump files if they don't exist.
    Returns True if files are available, False if download/extraction failed.
    """
    nodes_path = os.path.join(download_dir, "nodes.dmp")
    names_path = os.path.join(download_dir, "names.dmp")

    # Check if files already exist
    if os.path.exists(nodes_path) and os.path.exists(names_path):
        print(f"Taxonomy dump files already exist in {download_dir}", file=sys.stderr)
        return True

    # Download taxdmp.zip
    taxdmp_url = "https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdmp.zip"
    zip_path = os.path.join(download_dir, "taxdmp.zip")

    try:
        print(f"Downloading taxonomy dump from {taxdmp_url}...", file=sys.stderr)
        urllib.request.urlretrieve(taxdmp_url, zip_path)
        print(f"Downloaded taxdmp.zip to {zip_path}", file=sys.stderr)

        # Extract the zip file
        print("Extracting taxdmp.zip...", file=sys.stderr)
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            # Extract only the files we need
            files_to_extract = ["nodes.dmp", "names.dmp"]
            for file_name in files_to_extract:
                if file_name in zip_ref.namelist():
                    zip_ref.extract(file_name, download_dir)
                    print(f"Extracted {file_name}", file=sys.stderr)
                else:
                    print(
                        f"Warning: {file_name} not found in taxdmp.zip", file=sys.stderr
                    )

        # Clean up zip file
        os.remove(zip_path)
        print("Cleaned up taxdmp.zip", file=sys.stderr)

        # Verify files were extracted
        if os.path.exists(nodes_path) and os.path.exists(names_path):
            print(
                "Taxonomy dump files successfully downloaded and extracted",
                file=sys.stderr,
            )
            return True
        else:
            print("Error: Expected files not found after extraction", file=sys.stderr)
            return False

    except Exception as e:
        print(f"Error downloading or extracting taxonomy dump: {e}", file=sys.stderr)
        # Clean up partial download
        if os.path.exists(zip_path):
            try:
                os.remove(zip_path)
            except:
                pass
        return False


def load_taxonomy_dump(nodes_file_path="nodes.dmp", names_file_path="names.dmp"):
    """
    Loads NCBI Taxonomy dump files (nodes.dmp and names.dmp) into memory.
    Returns two dictionaries:
    - tax_nodes: {tax_id: parent_tax_id}
    - tax_names: {tax_id: scientific_name}
    """
    tax_nodes = {}  # Stores {tax_id: parent_tax_id}
    tax_names = {}  # Stores {tax_id: scientific_name}

    print(
        f"Loading taxonomy data from '{nodes_file_path}' and '{names_file_path}'...",
        file=sys.stderr,
    )

    # Load nodes.dmp
    if not os.path.exists(nodes_file_path):
        print(
            f"Error: nodes.dmp not found at '{nodes_file_path}'. Please download taxdmp.zip from NCBI FTP and extract it.",
            file=sys.stderr,
        )
        return None, None

    try:
        with open(nodes_file_path, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t|\t")
                if len(parts) >= 2:
                    tax_id = parts[0]
                    parent_id = parts[1]
                    tax_nodes[tax_id] = parent_id
    except Exception as e:
        print(f"Error reading nodes.dmp: {e}", file=sys.stderr)
        return None, None

    # Load names.dmp
    if not os.path.exists(names_file_path):
        print(
            f"Error: names.dmp not found at '{names_file_path}'. Please download taxdmp.zip from NCBI FTP and extract it.",
            file=sys.stderr,
        )
        return None, None

    try:
        with open(names_file_path, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t|\t")
                # We are interested in scientific names, which are typically marked with 'scientific name'
                if (
                    len(parts) >= 4
                    and parts[3].strip().rstrip("|").strip() == "scientific name"
                ):
                    tax_id = parts[0]
                    name = parts[1]
                    tax_names[tax_id] = name
    except Exception as e:
        print(f"Error reading names.dmp: {e}", file=sys.stderr)
        return None, None

    print("Taxonomy data loaded successfully.", file=sys.stderr)
    return tax_nodes, tax_names


# Taxonomy IDs a lineage walked through that names.dmp has no scientific name
# for. Reported per input file rather than per occurrence; see get_lineage_from_dump.
unnamed_taxon_ids = set()


def get_lineage_from_dump(tax_id, tax_nodes, tax_names):
    """
    Reconstructs the full taxonomic lineage for a given NCBI Taxonomy ID
    using the pre-loaded taxonomy dump data.
    Returns a list of (tax_id, scientific_name) tuples from root to the given ID.
    """
    lineage = []
    current_id = str(tax_id)

    # Traverse up the tree until the root (parent_id is '1' and tax_id is '1')
    while current_id != "1" or (
        current_id == "1" and "1" in tax_nodes and tax_nodes["1"] == "1"
    ):
        if current_id not in tax_names:
            # One line per unnamed ancestor was ~280 lines a run and said the
            # same thing every time. Collected instead and reported once, with
            # the ids, so the fact stays checkable without being a wall.
            unnamed_taxon_ids.add(current_id)
            name = f"Unknown_{current_id}"  # Placeholder name
        else:
            name = tax_names[current_id]

        lineage.append((current_id, name))

        if current_id not in tax_nodes:
            # This can happen if the ID is not in nodes.dmp (e.g., a deleted ID)
            # or if we've reached the absolute root (which points to itself).
            break

        # Move to the parent
        parent_id = tax_nodes[current_id]
        if parent_id == current_id:  # Break if parent is self (root)
            break
        current_id = parent_id

    # Add the root itself if it's not already added and its name is available
    if "1" in tax_names and ("1", tax_names["1"]) not in lineage:
        lineage.append(("1", tax_names["1"]))

    # The lineage is built from leaf to root, so reverse it
    return lineage[::-1]


NEWICK_DELIMITERS = set("(),:;'")


def newick_label(label):
    """Single-quote a label holding a Newick delimiter, doubling any quote in it.

    "Marburg virus - Musoke, Kenya, 1980" otherwise splits into three nodes,
    and the colon in "HM-1:IMSS" turns the leaf's [accession|taxonId] into a
    branch length.
    """
    if any(c in NEWICK_DELIMITERS for c in label):
        return "'" + label.replace("'", "''") + "'"
    return label


class SimpleTreeNode:
    """Simple tree node class to replace BioPython Clade"""

    def __init__(self, name=None, branch_length=1.0, taxon_id=None):
        self.name = name
        self.branch_length = branch_length
        self.taxon_id = taxon_id
        self.children = []

    def to_newick(self):
        """Convert this node and its subtree to Newick format"""
        name_str = self.name if self.name else ""
        if not self.children:
            # A leaf's name already ends in [accession|taxonId]
            return f"{newick_label(name_str)}:{self.branch_length}"
        children_str = ",".join(child.to_newick() for child in self.children)
        if self.taxon_id:
            name_str = f"{name_str}{{{self.taxon_id}}}"
        return f"({children_str}){newick_label(name_str)}:{self.branch_length}"


def build_phylogenetic_tree(taxon_accession_pairs, tax_nodes, tax_names):
    """
    Builds a phylogenetic tree from a list of (taxonId, accession) pairs using pre-loaded dump data.
    The tree is rooted at the lowest common ancestor (LCA) of the input taxon IDs.
    Leaf nodes will be labeled with species name and accession.
    Returns a Newick format string.
    """
    if not taxon_accession_pairs:
        print("No taxon-accession pairs provided.", file=sys.stderr)
        return None
    if not tax_nodes or not tax_names:
        print("Taxonomy dump data not loaded. Cannot build tree.", file=sys.stderr)
        return None

    all_lineages = {}
    accession_for_taxon = {}  # Map taxonId to accession

    for taxon_id, accession in taxon_accession_pairs:
        # print(
        #     f"  Reconstructing lineage for Tax ID: {taxon_id} (accession: {accession})",
        #     file=sys.stderr,
        # )
        lineage = get_lineage_from_dump(taxon_id, tax_nodes, tax_names)
        if lineage:
            # Use a unique key that includes both taxon_id and accession
            key = f"{taxon_id}_{accession}"
            all_lineages[key] = lineage
            accession_for_taxon[str(taxon_id)] = accession
        else:
            print(
                f"Warning: Could not reconstruct lineage for Taxonomy ID {taxon_id}. Skipping.",
                file=sys.stderr,
            )

    if not all_lineages:
        print(
            "No valid lineages found for the provided Taxonomy IDs. Cannot build tree.",
            file=sys.stderr,
        )
        return None

    # Step 1: Collect all unique (tax_id, name) pairs and create node objects
    nodes_by_id = {}
    leaf_nodes = {}  # Store leaf nodes with accession info

    for key, lineage in all_lineages.items():
        taxon_id = key.split("_")[0]  # Extract taxon_id from key
        accession = key.split("_", 1)[1]  # Extract accession from key

        for i, (node_id, node_name) in enumerate(lineage):
            if node_id not in nodes_by_id:
                node = SimpleTreeNode(
                    name=node_name, branch_length=1.0, taxon_id=node_id
                )
                nodes_by_id[node_id] = node

            # If this is the leaf node (last in lineage), create accession-specific leaf
            if i == len(lineage) - 1:  # This is the leaf node
                leaf_key = f"{node_id}_{accession}"
                if leaf_key not in leaf_nodes:
                    leaf_node = SimpleTreeNode(
                        name=f"{node_name}[{accession}|{taxon_id}]",
                        branch_length=1.0,
                        taxon_id=node_id,
                    )
                    leaf_nodes[leaf_key] = leaf_node
                    nodes_by_id[node_id].children.append(leaf_node)

    # Step 2: Link parent-child relationships within the collected nodes
    for lineage in all_lineages.values():
        for i in range(len(lineage) - 1):
            parent_id, _ = lineage[i]
            child_id, _ = lineage[i + 1]

            if parent_id in nodes_by_id and child_id in nodes_by_id:
                parent_node = nodes_by_id[parent_id]
                child_node = nodes_by_id[child_id]

                if child_node not in parent_node.children:
                    parent_node.children.append(child_node)

    # Step 3: Determine the root of the tree
    all_lineage_ids_sets = [
        set(node_id for node_id, _ in lineage) for lineage in all_lineages.values()
    ]

    if not all_lineage_ids_sets:
        print(
            "Error: No lineage ID sets available for common ancestor calculation.",
            file=sys.stderr,
        )
        return None

    common_ids_in_lineages = set.intersection(*all_lineage_ids_sets)

    if not common_ids_in_lineages:
        print(
            "Error: No common NCBI Taxonomy ID found among all lineages. Cannot build a single tree.",
            file=sys.stderr,
        )
        return None

    lca_id = None
    # Find the highest (closest to NCBI root ID 1) common ID among all lineages.
    # We iterate through the first lineage (as a reference) from root downwards
    # and pick the last common ID encountered that is in the common_ids_in_lineages set.
    ref_lineage = list(all_lineages.values())[0]
    for node_id, _ in ref_lineage:
        if node_id in common_ids_in_lineages:
            lca_id = node_id

    if lca_id is None:
        print(
            "Error: Could not determine a common ancestor for the tree root.",
            file=sys.stderr,
        )
        return None

    root_node = nodes_by_id.get(lca_id)
    if not root_node:
        print(
            f"Error: LCA node with ID {lca_id} not found in collected nodes.",
            file=sys.stderr,
        )
        return None

    return root_node


def load_taxon_accession_data(json_file_path):
    """
    Loads taxonId and accession pairs from JSON file.
    Supports both 'taxonId' and 'taxId' field names.
    Returns a list of (taxonId, accession) tuples.
    """
    try:
        with open(json_file_path, "r") as f:
            data = json.load(f)

        taxon_accession_pairs = []

        for entry in data:
            # Support both 'taxonId' and 'taxId' field names
            taxon_id = entry.get("taxonId") or entry.get("taxId")
            accession = entry.get("accession")

            if taxon_id and accession:
                taxon_accession_pairs.append((taxon_id, accession))

        return taxon_accession_pairs

    except FileNotFoundError:
        print(f"Error: {json_file_path} not found.", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON file {json_file_path}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error loading data from {json_file_path}: {e}", file=sys.stderr)
        return None


def build_one(input_path, output_path, tax_nodes, tax_names):
    """
    Builds one category's tree and writes it. Returns True on success; prints
    why and returns False otherwise, so a caller can carry on with the rest.
    """
    taxon_accession_pairs = load_taxon_accession_data(input_path)

    if not taxon_accession_pairs:
        print(f"No valid taxon-accession pairs in {input_path}.", file=sys.stderr)
        return False

    root_node = build_phylogenetic_tree(taxon_accession_pairs, tax_nodes, tax_names)

    if not root_node:
        print(f"\nFailed to generate phylogenetic tree for {input_path}.", file=sys.stderr)
        return False

    newick_string = root_node.to_newick() + ";\n"

    if output_path:
        output_dir = os.path.dirname(output_path)
        if output_dir:  # Only create dir if path includes a directory
            os.makedirs(output_dir, exist_ok=True)
        with open(output_path, "w") as f:
            f.write(newick_string)
        print(
            f"  {os.path.basename(output_path):<24} {len(taxon_accession_pairs)} taxon-accession pairs",
            file=sys.stderr,
        )
    else:
        print(newick_string)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Build phylogenetic tree from NCBI taxonomy data"
    )
    # Repeatable, and paired positionally with --output. nodes.dmp and names.dmp
    # are 477MB and take 2.6s to parse; generate_taxonomy.sh has 19 categories to
    # build, so one process per category spent ~50s re-reading the same two files
    # from a dump that cannot change between them. One process reads them once.
    parser.add_argument(
        "--input",
        "-i",
        action="append",
        required=True,
        help="Path to input JSON file containing taxon-accession pairs (repeatable)",
    )
    parser.add_argument(
        "--output",
        "-o",
        action="append",
        help="Path to output Newick file, one per --input (default: stdout)",
    )
    parser.add_argument(
        "--taxonomy-dir",
        "-t",
        default=".",
        help="Directory containing taxonomy dump files (default: current directory)",
    )

    args = parser.parse_args()
    outputs = args.output or [None] * len(args.input)
    if len(outputs) != len(args.input):
        print(
            f"Got {len(args.input)} --input and {len(outputs)} --output; they pair up positionally.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Define paths to NCBI Taxonomy dump files
    nodes_dmp_path = os.path.join(args.taxonomy_dir, "nodes.dmp")
    names_dmp_path = os.path.join(args.taxonomy_dir, "names.dmp")

    # Download and extract taxonomy dump files if needed
    if not download_and_extract_taxonomy_dump(args.taxonomy_dir):
        print(
            "Failed to download or extract taxonomy dump files. Exiting.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Load the taxonomy dump files once
    tax_nodes_data, tax_names_data = load_taxonomy_dump(nodes_dmp_path, names_dmp_path)

    if tax_nodes_data is None or tax_names_data is None:
        print("Exiting due to failure to load taxonomy dump files.", file=sys.stderr)
        sys.exit(1)

    # One bad category must not cost the other 18, which is what the per-process
    # loop gave for free and what this has to keep giving.
    failed = []
    for input_path, output_path in zip(args.input, outputs):
        if not build_one(input_path, output_path, tax_nodes_data, tax_names_data):
            failed.append(input_path)

    if unnamed_taxon_ids:
        sample = sorted(unnamed_taxon_ids)[:20]
        more = len(unnamed_taxon_ids) - len(sample)
        print(
            f"{len(unnamed_taxon_ids)} taxonomy ID(s) have no scientific name in names.dmp "
            f"and were placed as Unknown_<id>: {' '.join(sample)}"
            + (f" ... and {more} more" if more else ""),
            file=sys.stderr,
        )

    if failed:
        print(f"Failed to build: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
